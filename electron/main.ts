import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
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
    const filePath = decodeURIComponent(request.url.replace('media://', ''))
    callback({ path: filePath })
  })
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// IPC: Open media files
ipcMain.handle('dialog:openMedia', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] },
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
})

// IPC: Save project
ipcMain.handle('dialog:saveProject', async (_, data: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'CapJul Project', extensions: ['cjp'] }],
    defaultPath: 'untitled.cjp',
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return result.filePath
  }
  return null
})

// IPC: Load project
ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'CapJul Project', extensions: ['cjp'] }],
    properties: ['openFile'],
  })
  if (!result.canceled && result.filePaths[0]) {
    return fs.readFileSync(result.filePaths[0], 'utf-8')
  }
  return null
})

// IPC: Get media info using ffprobe.
// Arguments go to execFile as an array, never through a shell — paths arrive from
// drag-and-drop and may contain $(...), backticks or quotes.
ipcMain.handle('ffmpeg:probe', async (_, filePath: string) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams', '-show_format',
      filePath,
    ], { encoding: 'utf-8', maxBuffer: FFPROBE_MAX_BUFFER })
    return JSON.parse(stdout)
  } catch (err) {
    console.error('[ffprobe] failed for', filePath, err instanceof Error ? err.message : err)
    return null
  }
})

// IPC: Export video with FFmpeg
ipcMain.handle('ffmpeg:export', async (_, options: ExportOptions) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'MOV Video', extensions: ['mov'] },
      { name: 'WebM Video', extensions: ['webm'] },
    ],
    defaultPath: `export_${Date.now()}.mp4`,
  })
  if (result.canceled || !result.filePath) return null

  return new Promise((resolve, reject) => {
    const args = buildFFmpegArgs(options, result.filePath!)
    const proc = spawn('ffmpeg', args)
    let progress = 0

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (timeMatch) {
        const secs = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3]
        progress = options.duration > 0
          ? Math.min(99, Math.round((secs / options.duration) * 100))
          : 0
        mainWindow?.webContents.send('export:progress', progress)
      }
    })

    proc.on('close', (code: number) => {
      if (code === 0) {
        mainWindow?.webContents.send('export:progress', 100)
        resolve(result.filePath)
      } else {
        reject(new Error('FFmpeg export failed'))
      }
    })
  })
})

// IPC: Read file as data URL
ipcMain.handle('fs:readFileAsDataURL', async (_, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', m4a: 'audio/mp4',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
  }
  const mime = mimeTypes[ext] || 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
})

// IPC: Get temp dir
ipcMain.handle('app:getTempDir', () => {
  const dir = path.join(os.tmpdir(), 'capjul')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
})

// IPC: Open in finder
ipcMain.handle('shell:showItemInFolder', (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

interface ExportOptions {
  inputs: Array<{ path: string; start: number; end: number }>
  duration: number
  width: number
  height: number
  fps: number
  videoBitrate: string
  audioBitrate: string
  format: string
}

function buildFFmpegArgs(options: ExportOptions, output: string): string[] {
  const args: string[] = ['-y']
  for (const input of options.inputs) {
    args.push('-ss', String(input.start), '-to', String(input.end), '-i', input.path)
  }
  if (options.inputs.length > 1) {
    const filterInputs = options.inputs.map((_, i) => `[${i}:v][${i}:a]`).join('')
    args.push('-filter_complex', `${filterInputs}concat=n=${options.inputs.length}:v=1:a=1[outv][outa]`)
    args.push('-map', '[outv]', '-map', '[outa]')
  }
  args.push(
    '-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2`,
    '-r', String(options.fps),
    '-b:v', options.videoBitrate,
    '-b:a', options.audioBitrate,
    '-movflags', '+faststart',
    output,
  )
  return args
}
