import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import type { Clip } from '../../types'

const TRANSITIONS = [
  { id: 'none',        name: 'Tanpa',       icon: '⬜' },
  { id: 'fade',        name: 'Fade',        icon: '⬛' },
  { id: 'dissolve',    name: 'Dissolve',    icon: '🔲' },
  { id: 'wipe-left',   name: 'Wipe ←',     icon: '◀' },
  { id: 'wipe-right',  name: 'Wipe →',     icon: '▶' },
  { id: 'wipe-up',     name: 'Wipe ↑',     icon: '▲' },
  { id: 'wipe-down',   name: 'Wipe ↓',     icon: '▼' },
  { id: 'slide-left',  name: 'Slide ←',    icon: '←' },
  { id: 'slide-right', name: 'Slide →',    icon: '→' },
  { id: 'zoom-in',     name: 'Zoom In',    icon: '🔍' },
  { id: 'zoom-out',    name: 'Zoom Out',   icon: '🔎' },
  { id: 'blur',        name: 'Blur',       icon: '🌫' },
  { id: 'flash',       name: 'Flash',      icon: '💫' },
] as const

function nextClipInTrack(clips: Clip[], clip: Clip): Clip | undefined {
  return clips
    .filter(c => c.trackId === clip.trackId && c.startTime > clip.startTime)
    .sort((a, b) => a.startTime - b.startTime)[0]
}

export function TransitionsPanel() {
  const [selected, setSelected] = useState<string>('fade')
  const [duration, setDuration] = useState(0.5)

  const { project, selectedClipIds, addTransition, removeTransition } = useEditorStore()

  function addOrReplace(clipId: string, type: string) {
    const existing = project.transitions.find(t => t.clipId === clipId)
    if (existing) removeTransition(existing.id)
    if (type === 'none') return
    addTransition({ id: crypto.randomUUID(), clipId, type, duration })
  }

  function applyToSelected() {
    selectedClipIds.forEach(clipId => {
      const clip = project.clips.find(c => c.id === clipId)
      if (!clip) return
      if (!nextClipInTrack(project.clips, clip)) return
      addOrReplace(clipId, selected)
    })
  }

  function applyToAll() {
    // Remove all existing transitions first
    ;[...project.transitions].forEach(t => removeTransition(t.id))
    if (selected === 'none') return

    const byTrack = new Map<string, Clip[]>()
    project.clips.forEach(c => {
      const arr = byTrack.get(c.trackId) ?? []
      arr.push(c)
      byTrack.set(c.trackId, arr)
    })
    byTrack.forEach(clips => {
      clips.sort((a, b) => a.startTime - b.startTime)
      for (let i = 0; i < clips.length - 1; i++) {
        addTransition({ id: crypto.randomUUID(), clipId: clips[i].id, type: selected, duration })
      }
    })
  }

  const hasSelection = selectedClipIds.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Duration */}
      <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Durasi</span>
          <span className="text-xs" style={{ color: 'var(--color-primary)' }}>{duration.toFixed(1)}s</span>
        </div>
        <input
          type="range" min={0.1} max={2} step={0.1}
          value={duration}
          onChange={e => setDuration(+e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="flex flex-col items-center gap-1.5 p-2 rounded"
              style={{
                background: selected === t.id ? 'rgba(255,71,87,0.15)' : 'var(--color-bg-surface)',
                border: selected === t.id ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="w-full rounded flex items-center justify-center text-xl"
                style={{ height: 44, background: 'var(--color-bg-panel)' }}
              >
                {t.icon}
              </div>
              <span style={{
                fontSize: 10,
                color: selected === t.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="p-3 shrink-0 flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          className="btn-primary w-full text-sm py-1.5"
          onClick={applyToSelected}
          disabled={!hasSelection}
          style={{ opacity: hasSelection ? 1 : 0.4, cursor: hasSelection ? 'pointer' : 'default' }}
        >
          Terapkan ke Clip Dipilih
        </button>
        <button
          className="w-full text-sm py-1.5 rounded"
          onClick={applyToAll}
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          Terapkan ke Semua
        </button>
      </div>
    </div>
  )
}
