import { useState } from 'react'

const TRANSITIONS = [
  { id: 'none', name: 'None', icon: '⬜' },
  { id: 'fade', name: 'Fade', icon: '⬛' },
  { id: 'dissolve', name: 'Dissolve', icon: '🔲' },
  { id: 'wipe-left', name: 'Wipe Left', icon: '◀' },
  { id: 'wipe-right', name: 'Wipe Right', icon: '▶' },
  { id: 'wipe-up', name: 'Wipe Up', icon: '▲' },
  { id: 'wipe-down', name: 'Wipe Down', icon: '▼' },
  { id: 'zoom-in', name: 'Zoom In', icon: '🔍' },
  { id: 'zoom-out', name: 'Zoom Out', icon: '🔎' },
  { id: 'slide-left', name: 'Slide Left', icon: '←' },
  { id: 'slide-right', name: 'Slide Right', icon: '→' },
  { id: 'push-left', name: 'Push Left', icon: '⬅' },
  { id: 'push-right', name: 'Push Right', icon: '➡' },
  { id: 'rotate', name: 'Rotate', icon: '🔄' },
  { id: 'spin', name: 'Spin', icon: '↻' },
  { id: 'flip-h', name: 'Flip H', icon: '↔' },
  { id: 'flip-v', name: 'Flip V', icon: '↕' },
  { id: 'cube', name: 'Cube', icon: '📦' },
  { id: 'glitch', name: 'Glitch', icon: '⚡' },
  { id: 'flash', name: 'Flash', icon: '💫' },
  { id: 'ripple', name: 'Ripple', icon: '🌊' },
  { id: 'pixelate', name: 'Pixelate', icon: '🔳' },
  { id: 'blur', name: 'Blur', icon: '🌫' },
  { id: 'shatter', name: 'Shatter', icon: '💥' },
]

export function TransitionsPanel() {
  const [selected, setSelected] = useState('fade')
  const [duration, setDuration] = useState(0.5)

  return (
    <div className="flex flex-col h-full">
      {/* Duration */}
      <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Duration</span>
          <span className="text-xs" style={{ color: 'var(--color-primary)' }}>{duration.toFixed(1)}s</span>
        </div>
        <input
          type="range" min={0.1} max={3} step={0.1}
          value={duration}
          onChange={e => setDuration(+e.target.value)}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>0.1s</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>3.0s</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-3 gap-2">
          {TRANSITIONS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="flex flex-col items-center gap-1.5 p-2 rounded transition-all"
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

      {/* Apply button */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button className="btn-primary w-full text-sm">
          Apply to All Clips
        </button>
      </div>
    </div>
  )
}
