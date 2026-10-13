import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { EFFECTS } from '../../shared/effects'

const EFFECT_CATEGORIES = [
  { name: 'Basic', ids: ['blur', 'glow', 'sharpen', 'vignette'] },
  { name: 'Style', ids: ['chromatic', 'noir', 'vivid', 'matte'] },
  { name: 'Color', ids: ['warm', 'cool', 'grain', 'letterbox'] },
]

const EFFECT_ICONS: Record<string, string> = {
  blur: '🌫', glow: '✨', sharpen: '🔆', vignette: '⚫',
  grain: '📷', letterbox: '🎬', chromatic: '🔴', noir: '🎞',
  warm: '🌅', cool: '🧊', vivid: '💥', matte: '🌫',
}

export function EffectsPanel() {
  const { selectedClipIds, project, updateClip } = useEditorStore()
  const [activeCategory, setActiveCategory] = useState('Basic')
  const [intensities, setIntensities] = useState<Record<string, number>>({})

  const selectedClip = selectedClipIds[0]
    ? project.clips.find(c => c.id === selectedClipIds[0])
    : null

  const activeEffects = new Set((selectedClip?.effects ?? []).map(e => e.id))

  function toggleEffect(effectId: string) {
    if (!selectedClip) return
    const current = selectedClip.effects ?? []
    const isActive = current.some(e => e.id === effectId)
    if (isActive) {
      updateClip(selectedClip.id, { effects: current.filter(e => e.id !== effectId) })
    } else {
      const intensity = intensities[effectId] ?? 0.5
      updateClip(selectedClip.id, { effects: [...current, { id: effectId, intensity }] })
    }
  }

  function setIntensity(effectId: string, value: number) {
    setIntensities(prev => ({ ...prev, [effectId]: value }))
    if (!selectedClip) return
    const current = selectedClip.effects ?? []
    if (current.some(e => e.id === effectId)) {
      updateClip(selectedClip.id, { effects: current.map(e => e.id === effectId ? { ...e, intensity: value } : e) })
    }
  }

  const currentCategory = EFFECT_CATEGORIES.find(c => c.name === activeCategory)!
  const effectsInCategory = currentCategory.ids.map(id => EFFECTS.find(e => e.id === id)).filter(Boolean) as typeof EFFECTS

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

      {!selectedClip && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            Pilih video clip di timeline untuk menambahkan efek
          </p>
        </div>
      )}

      {selectedClip && (
        <>
          {/* Effects grid */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-3 gap-2">
              {effectsInCategory.map(e => {
                const isActive = activeEffects.has(e.id)
                return (
                  <button
                    key={e.id}
                    onClick={() => toggleEffect(e.id)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded"
                    style={{
                      background: isActive ? 'rgba(255,71,87,0.15)' : 'var(--color-bg-surface)',
                      border: isActive ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 26 }}>{EFFECT_ICONS[e.id] ?? '🎨'}</div>
                    <span style={{ fontSize: 10, color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                      {e.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active effect intensity controls */}
          {(selectedClip.effects ?? []).length > 0 && (
            <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>Intensitas</p>
              {(selectedClip.effects ?? []).map(e => {
                const def = EFFECTS.find(d => d.id === e.id)
                return (
                  <div key={e.id} className="mb-2">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{def?.name ?? e.id}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{Math.round(e.intensity * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.01} value={e.intensity}
                      onChange={ev => setIntensity(e.id, +ev.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
