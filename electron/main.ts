import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import {
  IPC, fail, ok,
  type ExportPayload, type IpcResult, type RecoveryInfo, type RenderPlan,
} from '../src/shared/ipc-contract'
import { ExportPayloadSchema } from '../src/shared/render-plan-schema'
import { buildRenderArgs } from '../src/shared/render-plan'
import { FfprobeResultSchema, type FfprobeResult } from '../src/shared/ffprobe'
import type { Project } from '../src/shared/project-schema'
import { getLastSavedPath, mapFsError, readProjectFile, recoveryInfo, restoreAutosave, writeAutosave, writeProjectFile } from './project-store'

const execFileAsync = promisify(execFile)

// ffprobe JSON grows with stream count; the 1 MB execFile default is too small.
const FFPROBE_MAX_BUFFER = 16 * 1024 * 1024

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#121212',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('media', (request, callback) => {
    const raw = decodeURIComponent(request.url.replace('media://', ''))
    // Reject relative-looking URLs (e.g. media://host/path, which would resolve
    // against the process cwd) and anything that is not an existing file.
    if (!path.isAbsolute(raw)) {
      callback({ error: -2 })
      return
    }
    const resolved = path.resolve(raw)
    let isFile = false
    try {
      isFile = fs.statSync(resolved).isFile()
    } catch {
      isFile = false
    }
    if (!isFile) {
      callback({ error: -2 })
      return
    }
    callback({ path: resolved })
  })
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// IPC: open media files
ipcMain.handle(IPC.dialogOpenMedia, async (): Promise<IpcResult<string[]>> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] },
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    ],
  })
  return ok(result.canceled ? [] : result.filePaths)
})

// IPC: save project. Serialization, validation and the atomic write all happen
// here; the renderer sends a Project object, never a JSON string.
ipcMain.handle(IPC.projectSave, async (_, project: Project, savePath?: string): Promise<IpcResult<string>> => {
  let target = savePath ?? getLastSavedPath()
  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [{ name: 'CapJul Project', extensions: ['cjp'] }],
      defaultPath: 'untitled.cjp',
    })
    if (result.canceled || !result.filePath) return fail('E_CANCELLED', 'save cancelled')
    target = result.filePath
  }
  return writeProjectFile(target, project)
})

// IPC: open project. Parse, migrate and validate in main so untrusted file
// content never crosses the boundary as a raw string.
ipcMain.handle(IPC.projectOpen, async (): Promise<IpcResult<Project>> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'CapJul Project', extensions: ['cjp'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return fail('E_CANCELLED', 'open cancelled')
  return readProjectFile(result.filePaths[0])
})

// IPC: autosave slot and crash recovery. The slot lives in userData and is
// never the user's document.
ipcMain.handle(IPC.projectAutosave, async (_, project: Project): Promise<IpcResult<{ at: number }>> => {
  return writeAutosave(project)
})

ipcMain.handle(IPC.projectRecovery, async (): Promise<IpcResult<RecoveryInfo | null>> => {
  return recoveryInfo()
})

ipcMain.handle(IPC.projectRestore, async (): Promise<IpcResult<Project>> => {
  return restoreAutosave()
})

// IPC: probe media info with ffprobe.
// Arguments go to execFile as an array, never through a shell — paths arrive
// from drag-and-drop and may contain $(...), backticks or quotes.
ipcMain.handle(IPC.mediaProbe, async (_, filePath: string): Promise<IpcResult<FfprobeResult>> => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return fail('E_VALIDATION', 'probe requires a non-empty path')
  }
  try {
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) return fail('E_VALIDATION', 'path is not a regular file')
  } catch (err) {
    const mapped = mapFsError(err)
    return fail(mapped.code, mapped.message)
  }
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams', '-show_format',
      filePath,
    ], { encoding: 'utf-8', maxBuffer: FFPROBE_MAX_BUFFER })
    const parsed = FfprobeResultSchema.safeParse(JSON.parse(stdout))
    if (!parsed.success) return fail('E_CORRUPT', 'ffprobe output did not match the expected shape')
    return ok(parsed.data)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return fail('E_FFMPEG_MISSING', 'ffprobe was not found; install FFmpeg and put it on PATH')
    }
    console.error('[ffprobe] failed for', filePath, err instanceof Error ? err.message : err)
    return fail('E_CORRUPT', 'ffprobe could not read this file')
  }
})

// ffprobe just enough to know whether a file carries an audio stream. A clip
// from an audio-less file must not be wired into the mix, or the filtergraph
// references a stream that does not exist and the whole encode fails.
async function probeHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-print_format', 'json',
      filePath,
    ], { encoding: 'utf-8' })
    const parsed = JSON.parse(stdout) as { streams?: unknown[] }
    return Array.isArray(parsed.streams) && parsed.streams.length > 0
  } catch {
    return false
  }
}

// IPC: export video with FFmpeg from a compiled RenderPlan.
ipcMain.handle(IPC.mediaExport, async (_, payload: ExportPayload): Promise<IpcResult<string>> => {
  const validated = ExportPayloadSchema.safeParse(payload)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    return fail('E_VALIDATION', `export payload invalid at "${issue.path.join('.')}"`)
  }
  const render = validated.data.plan as RenderPlan
  const overlayImages = validated.data.overlayImages
  if (overlayImages.length !== render.overlays.length) {
    return fail('E_VALIDATION', 'overlay image count does not match the plan')
  }

  // Rasterized text layers arrive as base64 and become temp PNG inputs.
  const tmpDir = path.join(os.tmpdir(), `capjul-export-${process.pid}-${Date.now()}`)
  const cleanupTmp = () => {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
  try {
    if (overlayImages.length) {
      await fs.promises.mkdir(tmpDir, { recursive: true })
      for (let i = 0; i < overlayImages.length; i++) {
        const file = path.join(tmpDir, `overlay-${i}.png`)
        await fs.promises.writeFile(file, Buffer.from(overlayImages[i], 'base64'))
        render.overlays[i] = { ...render.overlays[i], png: file }
      }
    }
  } catch (err) {
    cleanupTmp()
    const mapped = mapFsError(err)
    return fail(mapped.code, mapped.message)
  }

  for (const input of render.inputs) {
    input.hasAudio = await probeHasAudio(input.path)
  }

  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'MOV Video', extensions: ['mov'] },
      { name: 'WebM Video', extensions: ['webm'] },
    ],
    defaultPath: `export_${Date.now()}.${render.output.format}`,
  })
  if (result.canceled || !result.filePath) {
    cleanupTmp()
    return fail('E_CANCELLED', 'export cancelled')
  }
  const outputPath = result.filePath

  return new Promise<IpcResult<string>>((resolve) => {
    const proc = spawn('ffmpeg', buildRenderArgs(render, outputPath))

    proc.stderr.on('data', (data: Buffer) => {
      const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (!timeMatch) return
      const secs = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3]
      const percent = render.duration > 0
        ? Math.min(99, Math.round((secs / render.duration) * 100))
        : 0
      mainWindow?.webContents.send(IPC.exportProgress, percent)
    })

    proc.on('error', (err) => {
      cleanupTmp()
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      resolve(fail(missing ? 'E_FFMPEG_MISSING' : 'E_EXPORT_FAILED', err.message))
    })

    proc.on('close', (code: number) => {
      cleanupTmp()
      if (code === 0) {
        mainWindow?.webContents.send(IPC.exportProgress, 100)
        resolve(ok(outputPath))
      } else {
        resolve(fail('E_EXPORT_FAILED', `ffmpeg exited with code ${code}`))
      }
    })
  })
})
