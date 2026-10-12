import { useState } from 'react'

const EFFECT_CATEGORIES = [
  {
    name: 'Basic',
    effects: [
      { id: 'blur', name: 'Blur', icon: '🌫' },
      { id: 'glow', name: 'Glow', icon: '✨' },
      { id: 'sharpen', name: 'Sharpen', icon: '🔆' },
      { id: 'vignette', name: 'Vignette', icon: '⚫' },
      { id: 'grain', name: 'Film Grain', icon: '📷' },
      { id: 'noise', name: 'Noise', icon: '📺' },
    ]
  },
  {
    name: 'Cinematic',
    effects: [
      { id: 'letterbox', name: 'Letterbox', icon: '🎬' },
      { id: 'lens-flare', name: 'Lens Flare', icon: '🌟' },
      { id: 'bokeh', name: 'Bokeh', icon: '⭕' },
      { id: 'light-leak', name: 'Light Leak', icon: '🌈' },
      { id: 'anamorphic', name: 'Anamorphic', icon: '📽' },
      { id: 'chromatic', name: 'Chromatic', icon: '🔴' },
    ]
  },
  {
    name: 'Glitch',
    effects: [
      { id: 'glitch1', name: 'Glitch I', icon: '⚡' },
      { id: 'glitch2', name: 'Glitch II', icon: '💫' },
      { id: 'rgb-split', name: 'RGB Split', icon: '🔵' },
      { id: 'scan-lines', name: 'Scanlines', icon: '📻' },
      { id: 'vhs', name: 'VHS', icon: '📼' },
      { id: 'distort', name: 'Distort', icon: '🌀' },
    ]
  },
  {
    name: 'Nature',
    effects: [
      { id: 'rain', name: 'Rain', icon: '🌧' },
      { id: 'snow', name: 'Snow', icon: '❄️' },
      { id: 'fire', name: 'Fire', icon: '🔥' },
      { id: 'smoke', name: 'Smoke', icon: '💨' },
      { id: 'stars', name: 'Stars', icon: '⭐' },
      { id: 'leaves', name: 'Leaves', icon: '🍃' },
    ]
  },
]

export function EffectsPanel() {
  const [activeCategory, setActiveCategory] = useState('Basic')
  const [activeEffect, setActiveEffect] = useState<string | null>(null)

  const currentCategory = EFFECT_CATEGORIES.find(c => c.name === activeCategory)!

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex overflow-x-auto shrink-0 p-2 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {EFFECT_CATEGORIES.map(cat => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(cat.name)}
            className="text-xs px-2.5 py-1 rounded whitespace-nowrap"
            style={{
              background: activeCategory === cat.name ? 'var(--color-primary)' : 'var(--color-bg-surface)',
              color: activeCategory === cat.name ? 'white' : 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Effects grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-3 gap-2">
          {currentCategory.effects.map(e => (
            <button
              key={e.id}
              onClick={() => setActiveEffect(e.id === activeEffect ? null : e.id)}
              className="flex flex-col items-center gap-1.5 p-2 rounded"
              style={{
                background: activeEffect === e.id ? 'rgba(255,71,87,0.15)' : 'var(--color-bg-surface)',
                border: activeEffect === e.id ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div className="text-3xl">{e.icon}</div>
              <span style={{ fontSize: 10, color: activeEffect === e.id ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                {e.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Intensity */}
      {activeEffect && (
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Intensity</span>
            <span className="text-xs" style={{ color: 'var(--color-primary)' }}>70%</span>
          </div>
          <input type="range" min={0} max={100} defaultValue={70} />
          <button className="btn-primary w-full mt-2 text-sm">Apply Effect</button>
        </div>
      )}
    </div>
  )
}
