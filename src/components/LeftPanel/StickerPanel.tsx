import { useState } from 'react'
import { Search } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { StickerClip } from '../../types'

const STICKER_CATEGORIES = [
  { name: 'Trending', emoji: ['🔥', '💯', '✨', '💫', '⭐', '🌟', '💥', '🎉', '🥳', '❤️', '💕', '💖', '😍', '🤩', '😎', '🙌'] },
  { name: 'Emojis', emoji: ['😀', '😂', '🥰', '😎', '🤔', '😤', '🥺', '😱', '🤯', '😴', '🤑', '🥳', '😇', '🤪', '😋', '🤭'] },
  { name: 'Arrows', emoji: ['➡️', '⬅️', '⬆️', '⬇️', '↩️', '↪️', '🔄', '🔃', '↕️', '↔️', '↗️', '↘️', '↙️', '↖️', '🔁', '🔂'] },
  { name: 'Shapes', emoji: ['⭕', '❌', '🔴', '🔵', '🟢', '🟡', '🟠', '🟣', '⬛', '⬜', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻'] },
  { name: 'Nature', emoji: ['🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🍃', '🌱', '🌲', '🌳', '🌴', '🌵', '🎋', '🎍', '🍁'] },
  { name: 'Food', emoji: ['🍕', '🍔', '🍟', '🌮', '🌯', '🍜', '🍣', '🍱', '🍦', '🎂', '🍰', '☕', '🧋', '🍵', '🥤', '🧃'] },
]

export function StickerPanel() {
  const [activeCategory, setActiveCategory] = useState('Trending')
  const [search, setSearch] = useState('')
  const { addStickerClip, currentTime, project } = useEditorStore()

  const current = STICKER_CATEGORIES.find(c => c.name === activeCategory)!

  function addSticker(emoji: string) {
    const track = project.tracks.find(t => t.type === 'sticker') ?? { id: 'sticker-default' }
    const clip: StickerClip = {
      id: crypto.randomUUID(), trackId: track.id,
      startTime: currentTime, duration: 3,
      src: emoji, x: 0.5, y: 0.5,
      scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
      animation: 'bounce',
    }
    addStickerClip(clip)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 rounded px-2 h-7" style={{ background: 'var(--color-bg-surface)' }}>
          <Search size={13} style={{ color: 'var(--color-text-muted)' }} />
          <input
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--color-text-primary)' }}
            placeholder="Search stickers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex overflow-x-auto shrink-0 p-2 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {STICKER_CATEGORIES.map(cat => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(cat.name)}
            className="text-xs px-2 py-1 rounded whitespace-nowrap"
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

      {/* Sticker grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-2">
          {current.emoji.map((e, i) => (
            <button
              key={i}
              onClick={() => addSticker(e)}
              className="flex items-center justify-center rounded cursor-pointer text-3xl"
              style={{
                height: 56, background: 'var(--color-bg-surface)', border: 'none',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.transform = 'scale(1.15)'}
              onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.transform = 'scale(1)'}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
