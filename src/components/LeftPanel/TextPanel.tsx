import { useEditorStore } from '../../store/editorStore'
import type { TextClip } from '../../types'
import { Type } from 'lucide-react'

const TEXT_PRESETS = [
  { id: 'title', label: 'Title', fontSize: 72, fontFamily: 'Arial Black', fontColor: '#ffffff', bold: true, style: 'shadow' },
  { id: 'subtitle', label: 'Subtitle', fontSize: 42, fontFamily: 'Arial', fontColor: '#eeeeee', bold: false, style: 'outline' },
  { id: 'caption', label: 'Caption', fontSize: 28, fontFamily: 'Arial', fontColor: '#ffffff', bold: false, style: 'box' },
  { id: 'quote', label: 'Quote', fontSize: 36, fontFamily: 'Georgia', fontColor: '#fff', bold: false, style: 'italic' },
  { id: 'lyric', label: 'Lyric', fontSize: 48, fontFamily: 'Arial', fontColor: '#FFD700', bold: true, style: 'glow' },
  { id: 'credits', label: 'Credits', fontSize: 24, fontFamily: 'Courier', fontColor: '#aaaaaa', bold: false, style: '' },
]

function makeTextClip(overrides: Partial<TextClip> = {}): TextClip {
  return {
    id: crypto.randomUUID(),
    trackId: 'text-default',
    startTime: 0, duration: 5,
    text: 'Add Text',
    fontFamily: 'Arial', fontSize: 48,
    fontColor: '#ffffff', backgroundColor: 'transparent', backgroundOpacity: 0,
    bold: false, italic: false, underline: false,
    align: 'center', x: 0.5, y: 0.5,
    rotation: 0, scaleX: 1, scaleY: 1,
    animation: 'None', outAnimation: 'None', style: '',
    letterSpacing: 0, lineHeight: 1.2,
    strokeColor: 'transparent', strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
    ...overrides,
  }
}

export function TextPanel() {
  const { addTextClip, currentTime, project } = useEditorStore()

  function addText(preset?: typeof TEXT_PRESETS[number]) {
    const track = project.tracks.find(t => t.type === 'text') ?? { id: 'text-default' }
    const clip = makeTextClip({
      trackId: track.id,
      startTime: currentTime,
      text: preset?.label ?? 'Add Text',
      fontFamily: preset?.fontFamily ?? 'Arial',
      fontSize: preset?.fontSize ?? 48,
      fontColor: preset?.fontColor ?? '#ffffff',
      bold: preset?.bold ?? false,
      style: preset?.style ?? '',
    })
    addTextClip(clip)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Default text */}
      <div className="p-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => addText()}
          className="w-full flex items-center justify-center gap-2 h-10 rounded text-sm"
          style={{
            background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)',
            border: '1px dashed var(--color-primary)', cursor: 'pointer',
          }}
        >
          <Type size={16} /> Add Text
        </button>
      </div>

      {/* Presets */}
      <div className="p-3">
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Text Styles</p>
        <div className="flex flex-col gap-2">
          {TEXT_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => addText(p)}
              className="w-full text-left px-3 py-2.5 rounded cursor-pointer transition-all"
              style={{ background: 'var(--color-bg-surface)', border: 'none' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)'}
            >
              <span
                style={{
                  fontFamily: p.fontFamily,
                  fontSize: Math.min(p.fontSize / 3, 18),
                  fontWeight: p.bold ? 'bold' : 'normal',
                  color: '#fff',
                  display: 'block',
                }}
              >
                {p.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {p.fontFamily} · {p.fontSize}px
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto Caption */}
      <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>AI Captions</p>
        <button
          className="w-full h-9 rounded text-xs flex items-center justify-center gap-2"
          style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
        >
          ✨ Auto Generate Captions
        </button>
      </div>
    </div>
  )
}
