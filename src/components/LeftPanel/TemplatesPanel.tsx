// Aspect ratios derived from REA analysis: video_template_ratio.json
// [9:16, 16:9, 1:1, 4:3, 2:1, 5.8", 2.35:1, 3:4, 1.85:1]
import { useState } from 'react'
import { Search } from 'lucide-react'

const TEMPLATE_CATEGORIES = ['Trending', 'Travel', 'Food', 'Fashion', 'Sports', 'Wedding', 'Business']

const TEMPLATES = [
  { id: 't1', name: 'Cinematic Intro', category: 'Trending', duration: '15s', ratio: '16:9', color: '#1a1a2e' },
  { id: 't2', name: 'Story Vlog', category: 'Travel', duration: '30s', ratio: '9:16', color: '#16213e' },
  { id: 't3', name: 'Food Reel', category: 'Food', duration: '20s', ratio: '9:16', color: '#0f3460' },
  { id: 't4', name: 'Fashion Look', category: 'Fashion', duration: '25s', ratio: '4:5', color: '#533483' },
  { id: 't5', name: 'Sports Highlights', category: 'Sports', duration: '60s', ratio: '16:9', color: '#e94560' },
  { id: 't6', name: 'Wedding Film', category: 'Wedding', duration: '120s', ratio: '16:9', color: '#f5a7a7' },
  { id: 't7', name: 'Product Ad', category: 'Business', duration: '15s', ratio: '1:1', color: '#2d6a4f' },
  { id: 't8', name: 'Travel Montage', category: 'Travel', duration: '45s', ratio: '16:9', color: '#1b4332' },
  { id: 't9', name: 'Lyric Video', category: 'Trending', duration: '30s', ratio: '9:16', color: '#370617' },
  { id: 't10', name: 'Birthday Wish', category: 'Trending', duration: '15s', ratio: '9:16', color: '#4a0e8f' },
]

export function TemplatesPanel() {
  const [activeCategory, setActiveCategory] = useState('Trending')
  const [search, setSearch] = useState('')

  const filtered = TEMPLATES.filter(t =>
    (activeCategory === 'Trending' || t.category === activeCategory) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 rounded px-2 h-7" style={{ background: 'var(--color-bg-surface)' }}>
          <Search size={13} style={{ color: 'var(--color-text-muted)' }} />
          <input
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--color-text-primary)' }}
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex overflow-x-auto shrink-0 p-2 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="text-xs px-2.5 py-1 rounded whitespace-nowrap"
            style={{
              background: activeCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-surface)',
              color: activeCategory === cat ? 'white' : 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(t => (
            <button
              key={t.id}
              className="flex flex-col rounded overflow-hidden cursor-pointer transition-transform text-left"
              style={{ background: 'var(--color-bg-surface)', border: 'none' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
            >
              <div
                style={{
                  height: 80, background: t.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{t.ratio}</span>
              </div>
              <div className="p-2">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{t.name}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{t.duration} · {t.ratio}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
