import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, CheckCircle } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { compileProject } from '../shared/render-plan'
import { rasterizeStickerClip, rasterizeTextClip } from '../shared/text-rasterizer'
import { compileScene } from '../shared/scene'
import { prepareScene, type PreparedScene } from '../shared/compositor'
import { pumpPrepared } from '../shared/export-pump'

type Api = NonNullable<Window['electronAPI']>

const RESOLUTIONS = [
  { label: '4K', width: 3840, height: 2160, bitrate: '20M' },
  { label: '2K', width: 2560, height: 1440, bitrate: '12M' },
  { label: '1080p', width: 1920, height: 1080, bitrate: '8M' },
  { label: '720p', width: 1280, height: 720, bitrate: '5M' },
  { label: '480p', width: 854, height: 480, bitrate: '2.5M' },
  { label: '360p', width: 640, height: 360, bitrate: '1M' },
]

const FPS_OPTIONS = [24, 25, 30, 50, 60]
const FORMATS = ['mp4', 'mov', 'webm'] as const
type ExportFormat = (typeof FORMATS)[number]
const AUDIO_BITRATES = ['128k', '192k', '256k', '320k']

export function ExportDialog() {
  const { project, setShowExportDialog, isExporting, exportProgress, setIsExporting, setExportProgress } = useEditorStore()
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState(30)
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [audioBitrate, setAudioBitrate] = useState('192k')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [engine, setEngine] = useState<'compositor' | 'filtergraph'>('compositor')

  const res = RESOLUTIONS.find(r => r.label === resolution)!

  function handleClose() {
    if (!isExporting) setShowExportDialog(false)
  }

  async function handleExport() {
    const api = window.electronAPI
    if (!api) {
      setError('Export needs the desktop app — the Electron bridge is unavailable.')
      return
    }

    if (project.clips.length === 0 && project.audioClips.length === 0) {
      setError('Nothing to export. Add a clip to the timeline first.')
      return
    }

    setError(null)
    setWarning(null)
    setDone(false)
    setExportProgress(0)
    setIsExporting(true)

    const cleanup = api.onExportProgress(setExportProgress)

    try {
      if (engine === 'compositor') {
        const outcome = await runComposited(api)
        if (outcome === 'fallback') {
          setWarning('The compositor could not start, so this export used the filtergraph engine. Text and stickers are included; per-clip filters may differ slightly from the preview.')
          await runFiltergraph(api)
        }
      } else {
        await runFiltergraph(api)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setIsExporting(false)
      cleanup?.()
    }
  }

  // The compositor draws every frame exactly as the preview does, so this is
  // the parity-exact engine. If it cannot even prepare (undecodable media, no
  // canvas), fall back rather than failing the export outright.
  async function runComposited(api: Api): Promise<'done' | 'fallback'> {
    const scene = compileScene(project)
    scene.width = res.width
    scene.height = res.height
    scene.fps = fps

    let prepared: PreparedScene
    try {
      prepared = await prepareScene(scene, project.media, p => `media://${p}`)
    } catch {
      return 'fallback'
    }

    const plan = compileProject(project, { format, videoBitrate: res.bitrate, audioBitrate })
    const finished = api.exportVideoComposited({
      scene,
      inputs: plan.inputs,
      audio: plan.audio,
      output: plan.output,
    })

    let sent = 0
    try {
      await pumpPrepared(prepared, scene, {
        sendFrame: b => api.sendExportFrame(b),
        onProgress: f => { sent = f },
      })
      api.endExportFrames()
    } catch (err) {
      prepared.dispose()
      api.endExportFrames()
      finished.catch(() => {})
      // Nothing reached the encoder yet, so the other engine can still save it.
      if (sent === 0) return 'fallback'
      setError(err instanceof Error ? err.message : 'The compositor failed mid-export.')
      return 'done'
    }
    prepared.dispose()

    const exported = await finished
    if (!exported.ok) {
      if (exported.error.code !== 'E_CANCELLED') setError(exported.error.message)
    } else {
      setExportProgress(100)
      setDone(true)
    }
    return 'done'
  }

  async function runFiltergraph(api: Api) {
    const plan = compileProject(project, { format, videoBitrate: res.bitrate, audioBitrate })
    // The dialog's resolution/fps choices override the project's own.
    plan.width = res.width
    plan.height = res.height
    plan.fps = fps

    // Text and stickers are rasterized here, in the renderer: system FFmpeg
    // has no drawtext, and sticker vectors draw natively on canvas whereas
    // emoji fonts do not (design doc F4).
    const textClips = project.textClips.filter(t => t.duration > 0)
    const stickerClips = project.stickerClips.filter(s => s.duration > 0)
    const overlayImages: string[] = textClips.map(t => rasterizeTextClip(t, plan.width, plan.height))
    plan.overlays = textClips.map((t, i) => ({
      png: '',
      z: 1000 + i,
      start: t.startTime,
      end: t.startTime + t.duration,
    }))
    for (const s of stickerClips) {
      const png = await rasterizeStickerClip(s, plan.width, plan.height)
      if (!png) continue
      plan.overlays.push({
        png: '',
        z: 2000 + plan.overlays.length,
        start: s.startTime,
        end: s.startTime + s.duration,
      })
      overlayImages.push(png)
    }

    const exported = await api.exportVideo({ plan, overlayImages })
    if (!exported.ok) {
      // Dismissing the save dialog is a choice, not a failure.
      if (exported.error.code !== 'E_CANCELLED') setError(exported.error.message)
    } else {
      setExportProgress(100)
      setDone(true)
    }
  }

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 dialog-overlay"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        />
        <Dialog.Content
          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          aria-describedby={undefined}
          onEscapeKeyDown={handleClose}
        >
          <div
            className="rounded-xl overflow-hidden shadow-2xl pointer-events-auto dialog-panel"
            style={{ width: 480, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Download size={18} style={{ color: 'var(--color-primary)' }} />
                <Dialog.Title
                  className="font-medium"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Export Video
                </Dialog.Title>
              </div>
              <Dialog.Close
                onClick={handleClose}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                aria-label="Close export dialog"
              >
                <X size={18} />
              </Dialog.Close>
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col gap-4">
              {/* Resolution */}
              <div>
                <label className="text-xs block mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Resolution</label>
                <div className="grid grid-cols-3 gap-2">
                  {RESOLUTIONS.map(r => (
                    <button
                      key={r.label}
                      onClick={() => setResolution(r.label)}
                      aria-pressed={resolution === r.label}
                      className="py-2 rounded text-xs"
                      style={{
                        background: resolution === r.label ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                        color: resolution === r.label ? 'white' : 'var(--color-text-secondary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      <div className="font-bold">{r.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{r.width}×{r.height}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* FPS + Format */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs block mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Frame Rate</label>
                  <div className="flex gap-1.5">
                    {FPS_OPTIONS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFps(f)}
                        aria-pressed={fps === f}
                        className="flex-1 py-1.5 rounded text-xs"
                        style={{
                          background: fps === f ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                          color: fps === f ? 'white' : 'var(--color-text-secondary)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs block mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Format</label>
                  <div className="flex gap-1.5">
                    {FORMATS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        aria-pressed={format === f}
                        className="flex-1 py-1.5 rounded text-xs uppercase"
                        style={{
                          background: format === f ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                          color: format === f ? 'white' : 'var(--color-text-secondary)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Engine */}
              <div>
                <label className="text-xs block mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Render Engine
                </label>
                <div className="flex gap-1.5">
                  {([['compositor', 'Exact (matches preview)'], ['filtergraph', 'Fast (filtergraph)']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setEngine(id)}
                      aria-pressed={engine === id}
                      className="flex-1 py-1.5 rounded text-xs"
                      style={{
                        background: engine === id ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                        color: engine === id ? 'white' : 'var(--color-text-secondary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio bitrate */}
              <div>
                <label className="text-xs block mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Audio Quality</label>
                <div className="flex gap-1.5">
                  {AUDIO_BITRATES.map(b => (
                    <button
                      key={b}
                      onClick={() => setAudioBitrate(b)}
                      aria-pressed={audioBitrate === b}
                      className="flex-1 py-1.5 rounded text-xs"
                      style={{
                        background: audioBitrate === b ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                        color: audioBitrate === b ? 'white' : 'var(--color-text-secondary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="p-3 rounded" style={{ background: 'var(--color-bg-surface)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {res.width}×{res.height} · {fps}fps · {format.toUpperCase()} · {res.bitrate} video · {audioBitrate} audio
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Duration: {Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, '0')}
                </p>
              </div>

              {/* Progress */}
              {(isExporting || done) && (
                <div role="status" aria-live="polite">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-hover)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress}%`, background: 'var(--color-primary)' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {done ? 'Export complete!' : `Exporting... ${exportProgress}%`}
                    </span>
                    {done && <CheckCircle size={14} style={{ color: '#4ade80' }} />}
                  </div>
                </div>
              )}

              {/* Warning */}
              {warning && (
                <p
                  className="text-xs p-3 rounded"
                  style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}
                >
                  {warning}
                </p>
              )}

              {/* Error */}
              {error && (
                <p
                  role="alert"
                  className="text-xs p-3 rounded"
                  style={{ background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)' }}
                >
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                className="btn-secondary"
                onClick={handleClose}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleExport}
                disabled={isExporting}
              >
                <Download size={15} />
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
