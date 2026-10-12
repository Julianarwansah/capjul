import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'

// Filters derived from CapCut's LUT-based system (from REA analysis: lut/, lut-filter.webp)
const FILTER_CATEGORIES = [
  {
    name: 'Popular',
    filters: [
      { id: 'none', name: 'Original', css: '' },
      { id: 'bright', name: 'Bright', css: 'brightness(1.2) contrast(1.05)' },
      { id: 'vivid', name: 'Vivid', css: 'saturate(1.5) contrast(1.1)' },
      { id: 'matte', name: 'Matte', css: 'contrast(0.9) saturate(0.85) brightness(1.05)' },
      { id: 'fade', name: 'Fade', css: 'contrast(0.85) saturate(0.8) brightness(1.1)' },
      { id: 'vintage', name: 'Vintage', css: 'sepia(0.4) contrast(1.1) brightness(0.95)' },
    ]
  },
  {
    name: 'Natural',
    filters: [
      { id: 'fresh', name: 'Fresh', css: 'hue-rotate(-10deg) saturate(1.3) brightness(1.05)' },
      { id: 'warm', name: 'Warm', css: 'sepia(0.2) saturate(1.2) brightness(1.05)' },
      { id: 'cool', name: 'Cool', css: 'hue-rotate(15deg) saturate(1.1) brightness(1.05)' },
      { id: 'pure', name: 'Pure', css: 'saturate(0.95) brightness(1.08) contrast(0.97)' },
      { id: 'soft', name: 'Soft', css: 'saturate(0.85) brightness(1.05) contrast(0.92) blur(0.3px)' },
      { id: 'dewy', name: 'Dewy', css: 'brightness(1.1) saturate(0.9) contrast(0.95)' },
    ]
  },
  {
    name: 'Film',
    filters: [
      { id: 'film1', name: 'Film I', css: 'sepia(0.3) contrast(1.15) saturate(0.75) brightness(0.95)' },
      { id: 'film2', name: 'Film II', css: 'sepia(0.5) contrast(1.05) brightness(0.9) saturate(0.7)' },
      { id: 'kodak', name: 'Kodak', css: 'sepia(0.15) saturate(1.3) contrast(1.1) brightness(1.02)' },
      { id: 'fuji', name: 'Fuji', css: 'hue-rotate(5deg) saturate(1.15) contrast(1.05) brightness(1.02)' },
      { id: 'polaroid', name: 'Polaroid', css: 'sepia(0.3) brightness(1.1) contrast(1.05) saturate(0.8)' },
      { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.2) brightness(0.95)' },
    ]
  },
  {
    name: 'Moody',
    filters: [
      { id: 'dark', name: 'Dark', css: 'brightness(0.85) contrast(1.1)' },
      { id: 'moody', name: 'Moody', css: 'brightness(0.9) contrast(1.15) saturate(0.8) sepia(0.15)' },
      { id: 'dramatic', name: 'Dramatic', css: 'contrast(1.3) brightness(0.9) saturate(1.2)' },
      { id: 'shadow', name: 'Shadow', css: 'brightness(0.8) contrast(1.2) saturate(0.9)' },
      { id: 'cinematic', name: 'Cinematic', css: 'contrast(1.2) saturate(0.9) brightness(0.9) sepia(0.1)' },
      { id: 'mystery', name: 'Mystery', css: 'hue-rotate(200deg) saturate(0.5) brightness(0.8) contrast(1.2)' },
    ]
  },
]

export function FiltersPanel() {
  const { selectedClipIds, updateClip } = useEditorStore()
  const [activeCategory, setActiveCategory] = useState('Popular')
  const [activeFilter, setActiveFilter] = useState('none')

  function applyFilter(filterId: string, css: string) {
    setActiveFilter(filterId)
    selectedClipIds.forEach(id => updateClip(id, { filter: css }))
  }

  const currentCategory = FILTER_CATEGORIES.find(c => c.name === activeCategory)!

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div
        className="flex overflow-x-auto shrink-0 p-2 gap-1"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {FILTER_CATEGORIES.map(cat => (
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

      {/* Intensity slider */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Intensity</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>100%</span>
        </div>
        <input type="range" min={0} max={100} defaultValue={100} />
      </div>

      {/* Filter grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-3 gap-2">
          {currentCategory.filters.map(f => (
            <button
              key={f.id}
              onClick={() => applyFilter(f.id, f.css)}
              className="flex flex-col items-center gap-1 p-1 rounded transition-all"
              style={{
                background: activeFilter === f.id ? 'rgba(255,71,87,0.15)' : 'transparent',
                border: activeFilter === f.id ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="w-full rounded overflow-hidden"
                style={{ aspectRatio: '4/3', background: '#1a1a2e', filter: f.css }}
              >
                <div className="w-full h-full" style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2, #f093fb)',
                  filter: f.css,
                }} />
              </div>
              <span className="text-xs text-center" style={{
                color: activeFilter === f.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontSize: 10,
              }}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedClipIds.length === 0 && (
        <div className="p-3 text-center">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Select a clip to apply filters
          </p>
        </div>
      )}
    </div>
  )
}
