import * as Dialog from '@radix-ui/react-dialog'
import { X, Settings } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import type { AspectRatio } from '../types'

// Aspect ratios from REA analysis of CapCut: video_template_ratio.json
const ASPECT_RATIOS: { label: string; value: AspectRatio; desc: string }[] = [
  { label: '16:9', value: '16:9', desc: 'Landscape · YouTube, Desktop' },
  { label: '9:16', value: '9:16', desc: 'Portrait · TikTok, Reels, Shorts' },
  { label: '1:1', value: '1:1', desc: 'Square · Instagram feed' },
  { label: '4:3', value: '4:3', desc: 'Classic · Standard' },
  { label: '3:4', value: '3:4', desc: 'Tall portrait' },
  { label: '2:1', value: '2:1', desc: 'Ultra wide' },
  { label: '2.35:1', value: '2.35:1', desc: 'Cinemascope' },
  { label: '1.85:1', value: '1.85:1', desc: 'Flat cinematic' },
]

const FPS_OPTIONS = [24, 25, 30, 50, 60]

export function ProjectSettings() {
  const { project, setShowProjectSettings, setAspectRatio, setFps, setBackgroundColor, setProjectName } = useEditorStore()

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) setShowProjectSettings(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 dialog-overlay"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        />
        <Dialog.Content
          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          aria-describedby={undefined}
          onEscapeKeyDown={() => setShowProjectSettings(false)}
        >
          <div
            className="rounded-xl overflow-hidden shadow-2xl pointer-events-auto dialog-panel"
            style={{ width: 460, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Settings size={18} style={{ color: 'var(--color-primary)' }} />
                <Dialog.Title
                  className="font-medium"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Project Settings
                </Dialog.Title>
              </div>
              <Dialog.Close
                onClick={() => setShowProjectSettings(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                aria-label="Close project settings"
              >
                <X size={18} />
              </Dialog.Close>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Project name */}
              <div>
                <label
                  htmlFor="project-name"
                  className="text-xs block mb-2 font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Project Name
                </label>
                <input
                  id="project-name"
                  value={project.name}
                  onChange={e => setProjectName(e.target.value)}
                  className="w-full px-3 h-9 rounded outline-none text-sm"
                  style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>

              {/* Aspect Ratio */}
              <fieldset>
                <legend
                  className="text-xs mb-2 font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Aspect Ratio · {project.width}×{project.height}
                </legend>
                <div className="grid grid-cols-4 gap-2">
                  {ASPECT_RATIOS.map(r => {
                    const [w, h] = r.value.split(':').map(Number)
                    const isActive = project.width / project.height === w / h
                    return (
                      <button
                        key={r.value}
                        onClick={() => setAspectRatio(r.value)}
                        aria-pressed={isActive}
                        title={r.desc}
                        className="flex flex-col items-center gap-1 p-2 rounded"
                        style={{
                          background: isActive ? 'rgba(255,71,87,0.15)' : 'var(--color-bg-surface)',
                          border: isActive ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          className="rounded"
                          style={{
                            width: Math.min(36, 36 * (w > h ? 1 : w / h)),
                            height: Math.min(24, 24 * (h > w ? 1 : h / w)),
                            background: isActive ? 'var(--color-primary)' : '#444',
                          }}
                        />
                        <span style={{ fontSize: 10, color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                          {r.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* FPS */}
              <fieldset>
                <legend
                  className="text-xs mb-2 font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Frame Rate
                </legend>
                <div className="flex gap-2">
                  {FPS_OPTIONS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      aria-pressed={project.fps === f}
                      className="flex-1 py-2 rounded text-sm"
                      style={{
                        background: project.fps === f ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                        color: project.fps === f ? 'white' : 'var(--color-text-secondary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {f}fps
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Background Color */}
              <div>
                <label
                  htmlFor="bg-color"
                  className="text-xs block mb-2 font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Background Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="bg-color"
                    type="color"
                    value={project.backgroundColor}
                    onChange={e => setBackgroundColor(e.target.value)}
                    style={{ width: 48, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <div className="flex gap-2">
                    {['#000000', '#ffffff', '#1a1a1a', '#0a0a2e', '#2d1b69'].map(c => (
                      <button
                        key={c}
                        onClick={() => setBackgroundColor(c)}
                        aria-label={`Set background to ${c}`}
                        aria-pressed={project.backgroundColor === c}
                        className="w-8 h-8 rounded"
                        style={{ background: c, border: project.backgroundColor === c ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button className="btn-primary" onClick={() => setShowProjectSettings(false)}>Done</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
