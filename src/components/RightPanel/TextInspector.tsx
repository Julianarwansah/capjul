import { useEditorStore } from '../../store/editorStore'
import { keyframeAt } from '../../shared/keyframe-interpolate'
import { TEXT_IN_ANIMATIONS, TEXT_OUT_ANIMATIONS } from '../../shared/text-animation'
import { KfControl, Section, Slider } from './controls'
import type { Easing, Keyframe, TextClip } from '../../types'

// Inspector for a text clip. Reads the store itself so the caller only has to say
// which clip.

const FONT_FAMILIES = [
  'Arial', 'Arial Black', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Impact', 'Helvetica',
]

export function TextInspector({ clip }: { clip: TextClip }) {
  const { currentTime, updateTextClip, addTextKeyframe, removeTextKeyframe } = useEditorStore()

  const kfs = clip.keyframes ?? []
  const toggleKf = (prop: string, value: number) => {
    const atTime = keyframeAt(kfs, prop, currentTime)
    if (atTime) removeTextKeyframe(clip.id, atTime.id)
    else addTextKeyframe(clip.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value, easing: 'linear' })
  }
  const setKfEasing = (kf: Keyframe, easing: Easing) => addTextKeyframe(clip.id, { ...kf, easing })

  const fieldStyle = {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
  } as const

  return (
    <>
      <Section title="Text">
        <div className="mb-2">
          <label className="text-xs block mb-1" htmlFor="text-content" style={{ color: 'var(--color-text-secondary)' }}>Content</label>
          <textarea
            id="text-content"
            value={clip.text}
            onChange={e => updateTextClip(clip.id, { text: e.target.value })}
            rows={2}
            className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
            style={fieldStyle}
          />
        </div>
        <div className="mb-2">
          <label className="text-xs block mb-1" htmlFor="text-font" style={{ color: 'var(--color-text-secondary)' }}>Font Family</label>
          <select
            id="text-font"
            value={clip.fontFamily}
            onChange={e => updateTextClip(clip.id, { fontFamily: e.target.value })}
            className="w-full rounded px-2 py-1 text-xs outline-none"
            style={fieldStyle}
          >
            {FONT_FAMILIES.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <Slider label="Font Size" value={clip.fontSize} min={8} max={200}
          onChange={v => updateTextClip(clip.id, { fontSize: v })} />
        <div className="mb-2">
          <label className="text-xs block mb-1" htmlFor="text-color" style={{ color: 'var(--color-text-secondary)' }}>Color</label>
          <input id="text-color" type="color" value={clip.fontColor}
            onChange={e => updateTextClip(clip.id, { fontColor: e.target.value })}
            style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
        </div>
        <div className="flex gap-2 mb-2">
          {[
            { label: 'B', key: 'bold', active: clip.bold, name: 'Tebal' },
            { label: 'I', key: 'italic', active: clip.italic, name: 'Miring' },
            { label: 'U', key: 'underline', active: clip.underline, name: 'Garis bawah' },
          ].map(b => (
            <button key={b.key}
              onClick={() => updateTextClip(clip.id, { [b.key as keyof TextClip]: !b.active })}
              className="flex-1 py-1 rounded text-xs font-bold"
              aria-label={b.name}
              aria-pressed={b.active}
              style={{ background: b.active ? 'var(--color-primary)' : 'var(--color-bg-surface)', color: b.active ? 'white' : 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
              {b.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Transform">
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Rotation" value={clip.rotation} min={-180} max={180} onChange={v => updateTextClip(clip.id, { rotation: v })} /></div>
          <KfControl kfs={kfs} property="rotation" value={clip.rotation} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Scale" value={Math.round(clip.scaleX * 100)} min={10} max={300} onChange={v => updateTextClip(clip.id, { scaleX: v / 100, scaleY: v / 100 })} /></div>
          <KfControl kfs={kfs} property="scaleX" value={clip.scaleX} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <Slider label="Letter Spacing" value={clip.letterSpacing} min={-10} max={50}
          onChange={v => updateTextClip(clip.id, { letterSpacing: v })} />
        <Slider label="Line Height" value={Math.round(clip.lineHeight * 10)} min={5} max={30} step={1}
          onChange={v => updateTextClip(clip.id, { lineHeight: v / 10 })} />
      </Section>

      <Section title="Animasi">
        <div className="mb-3">
          <span className="text-xs block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Masuk</span>
          <div className="grid grid-cols-3 gap-1">
            {TEXT_IN_ANIMATIONS.map(a => (
              <button
                key={a.id}
                onClick={() => updateTextClip(clip.id, { animation: a.id === 'none' ? undefined : a.id })}
                aria-pressed={(clip.animation ?? 'none') === a.id}
                style={{
                  fontSize: 9, padding: '4px 2px', borderRadius: 4, border: 'none',
                  cursor: 'pointer', textAlign: 'center',
                  background: (clip.animation ?? 'none') === a.id
                    ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: (clip.animation ?? 'none') === a.id
                    ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Keluar</span>
          <div className="grid grid-cols-3 gap-1">
            {TEXT_OUT_ANIMATIONS.map(a => (
              <button
                key={a.id}
                onClick={() => updateTextClip(clip.id, { outAnimation: a.id === 'none' ? undefined : a.id })}
                aria-pressed={(clip.outAnimation ?? 'none') === a.id}
                style={{
                  fontSize: 9, padding: '4px 2px', borderRadius: 4, border: 'none',
                  cursor: 'pointer', textAlign: 'center',
                  background: (clip.outAnimation ?? 'none') === a.id
                    ? '#7c3aed' : 'var(--color-bg-surface)',
                  color: (clip.outAnimation ?? 'none') === a.id
                    ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Shadow & Stroke" defaultOpen={false}>
        <Slider label="Shadow Blur" value={clip.shadowBlur} min={0} max={50}
          onChange={v => updateTextClip(clip.id, { shadowBlur: v })} />
        <Slider label="Shadow X" value={clip.shadowX} min={-20} max={20}
          onChange={v => updateTextClip(clip.id, { shadowX: v })} />
        <Slider label="Shadow Y" value={clip.shadowY} min={-20} max={20}
          onChange={v => updateTextClip(clip.id, { shadowY: v })} />
        <Slider label="Stroke Width" value={clip.strokeWidth} min={0} max={20}
          onChange={v => updateTextClip(clip.id, { strokeWidth: v })} />
        {clip.strokeWidth > 0 && (
          <div className="mb-2">
            <label className="text-xs block mb-1" htmlFor="text-stroke-color" style={{ color: 'var(--color-text-secondary)' }}>Stroke Color</label>
            <input id="text-stroke-color" type="color" value={clip.strokeColor !== 'transparent' ? clip.strokeColor : '#000000'}
              onChange={e => updateTextClip(clip.id, { strokeColor: e.target.value })}
              style={{ width: '100%', height: 28, border: 'none', borderRadius: 4 }} />
          </div>
        )}
      </Section>
    </>
  )
}
