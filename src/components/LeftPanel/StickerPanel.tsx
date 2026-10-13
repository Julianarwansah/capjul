import { useState } from 'react'
import { Search } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { STICKER_ASSETS } from '../../shared/sticker-assets'
import { stickerDataUrl } from '../../shared/sticker-svgs'

export function StickerPanel() {
  const [search, setSearch] = useState('')
  const { addStickerClip, currentTime, project } = useEditorStore()

  const assets = STICKER_ASSETS.filter(a => a.label.toLowerCase().includes(search.toLowerCase()))

  function addSticker(id: string) {
    const track = project.tracks.find(t => t.type === 'sticker') ?? { id: 'sticker-default' }
    addStickerClip({
      id: crypto.randomUUID(),
      trackId: track.id,
      startTime: currentTime,
      duration: 3,
      src: id,
      x: 0.5, y: 0.5,
      scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    })
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

      {/* Sticker grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <p className="text-xs p-3" style={{ color: 'var(--color-text-muted)' }}>No stickers match.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {assets.map(a => (
              <button
                key={a.id}
                onClick={() => addSticker(a.id)}
                title={a.label}
                className="flex flex-col items-center justify-center gap-1 rounded cursor-pointer"
                style={{
                  height: 72, background: 'var(--color-bg-surface)', border: 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.transform = 'scale(1.08)'}
                onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.transform = 'scale(1)'}
              >
                <img src={stickerDataUrl(a.id) ?? ''} alt="" style={{ width: 36, height: 36 }} />
                <span className="text-xs truncate px-1" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
