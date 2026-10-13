import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, CheckCircle } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'

const RESOLUTIONS = [
  { label: '4K', width: 3840, height: 2160, bitrate: '20M' },
  { label: '2K', width: 2560, height: 1440, bitrate: '12M' },
  { label: '1080p', width: 1920, height: 1080, bitrate: '8M' },
  { label: '720p', width: 1280, height: 720, bitrate: '5M' },
  { label: '480p', width: 854, height: 480, bitrate: '2.5M' },
  { label: '360p', width: 640, height: 360, bitrate: '1M' },
]

const FPS_OPTIONS = [24, 25, 30, 50, 60]
const FORMATS = ['mp4', 'mov', 'webm']
const AUDIO_BITRATES = ['128k', '192k', '256k', '320k']

export function ExportDialog() {
  const { project, setShowExportDialog, isExporting, exportProgress, setIsExporting, setExportProgress } = useEditorStore()
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState(30)
  const [format, setFormat] = useState('mp4')
  const [audioBitrate, setAudioBitrate] = useState('192k')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    const inputs = project.clips.map(c => {
      const media = project.media.find(m => m.id === c.mediaId)
      return { path: media?.path ?? '', start: c.mediaStart, end: c.mediaEnd }
    }).filter(i => i.path)

    if (inputs.length === 0) {
      setError('Nothing to export. Add a video clip to the timeline first.')
      return
    }

    setError(null)
    setDone(false)
    setExportProgress(0)
    setIsExporting(true)

    const cleanup = api.onExportProgress(setExportProgress)

    try {
      const outputPath = await api.exportVideo({
        inputs,
        duration: project.duration,
        width: res.width,
        height: res.height,
        fps,
        videoBitrate: res.bitrate,
        audioBitrate,
        format,
      })
      // A null path means the save dialog was dismissed, which is not a failure.
      if (outputPath) {
        setExportProgress(100)
        setDone(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setIsExporting(false)
      cleanup?.()
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
