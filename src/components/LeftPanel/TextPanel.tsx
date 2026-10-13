import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import type { TextClip } from '../../types'
import { Type, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

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
    keyframes: [],
    ...overrides,
  }
}

function parseSrt(content: string): { id: string; startTime: number; endTime: number; text: string }[] {
  const results: { id: string; startTime: number; endTime: number; text: string }[] = []
  function toSec(ts: string) {
    const [h, m, rest] = ts.split(':')
    const [s, ms] = rest.replace(',', '.').split('.')
    return (+h) * 3600 + (+m) * 60 + (+s) + +(ms ?? '0') / 1000
  }
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const timeLine = lines.find(l => l.includes(' --> '))
    if (!timeLine) continue
    const [start, end] = timeLine.split(' --> ')
    const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').replace(/<[^>]+>/g, '')
    if (text.trim()) {
      results.push({ id: crypto.randomUUID(), startTime: toSec(start.trim()), endTime: toSec(end.trim()), text: text.trim() })
    }
  }
  return results
}

export function TextPanel() {
  const { addTextClip, addTrack, currentTime, project, addCaption, updateCaption, removeCaption } = useEditorStore()
  const [captionOpen, setCaptionOpen] = useState(false)

  function addText(preset?: typeof TEXT_PRESETS[number]) {
    // Clips on a track that does not exist would preview and export but never
    // appear on the timeline, so create the track when it is missing.
    const trackId = project.tracks.find(t => t.type === 'text')?.id ?? addTrack('text')
    const clip = makeTextClip({
      trackId,
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

      {/* Caption Editor */}
      <div style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          className="w-full flex items-center justify-between px-3 py-2"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          onClick={() => setCaptionOpen(v => !v)}
        >
          <span className="text-xs font-medium">Caption / Subtitle</span>
          {captionOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {captionOpen && (
          <div className="px-3 pb-3">
            <div className="flex gap-1.5 mb-2">
              <button
                className="flex-1 h-8 rounded text-xs flex items-center justify-center gap-1"
                style={{ background: 'rgba(255,71,87,0.1)', color: 'var(--color-primary)', border: '1px dashed var(--color-primary)', cursor: 'pointer' }}
                onClick={() => addCaption({ id: crypto.randomUUID(), startTime: currentTime, endTime: currentTime + 3, text: 'Caption baru' })}
              >
                <Plus size={11} /> Tambah
              </button>
              <label
                className="flex-1 h-8 rounded text-xs flex items-center justify-center gap-1 cursor-pointer"
                style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                title="Import SRT/VTT file"
              >
                Import SRT
                <input
                  type="file"
                  accept=".srt,.vtt"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      const text = ev.target?.result as string
                      parseSrt(text).forEach(c => addCaption(c))
                    }
                    reader.readAsText(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {project.captions.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-muted)' }}>Belum ada caption</p>
              )}
              {[...project.captions].sort((a, b) => a.startTime - b.startTime).map(c => (
                <div
                  key={c.id}
                  className="rounded p-2"
                  style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
                >
                  <textarea
                    value={c.text}
                    onChange={e => updateCaption(c.id, { text: e.target.value })}
                    rows={2}
                    style={{
                      width: '100%', resize: 'none', background: 'transparent',
                      border: 'none', outline: 'none', fontSize: 11,
                      color: 'var(--color-text-primary)', fontFamily: 'inherit',
                    }}
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number" step={0.1} value={+c.startTime.toFixed(2)}
                      onChange={e => updateCaption(c.id, { startTime: +e.target.value })}
                      style={{ width: 52, fontSize: 10, background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '1px 4px', color: 'var(--color-text-secondary)' }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>→</span>
                    <input
                      type="number" step={0.1} value={+c.endTime.toFixed(2)}
                      onChange={e => updateCaption(c.id, { endTime: +e.target.value })}
                      style={{ width: 52, fontSize: 10, background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '1px 4px', color: 'var(--color-text-secondary)' }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1 }}>s</span>
                    <button
                      onClick={() => removeCaption(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 2 }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
