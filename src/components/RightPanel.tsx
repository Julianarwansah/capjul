import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import type { TextClip } from '../types'
import { ChevronDown, ChevronRight } from 'lucide-react'

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="panel-section-header w-full"
      >
        <span>{title}</span>
        {open
          ? <ChevronDown size={12} />
          : <ChevronRight size={12} />
        }
      </button>
      {open && <div className="px-3 pt-1 pb-3 animate-fadein">{children}</div>}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between mt-2 mb-1">
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: checked ? 'var(--color-primary)' : '#3a3a3a',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2, left: checked ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white',
          transition: 'left 0.18s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
      />
    </div>
  )
}

export function RightPanel() {
  const { project, selectedClipIds, selectedTextIds, updateClip, updateTextClip } = useEditorStore()

  const selectedClip = selectedClipIds[0]
    ? project.clips.find(c => c.id === selectedClipIds[0])
    : null
  const selectedText = selectedTextIds[0]
    ? project.textClips.find(t => t.id === selectedTextIds[0])
    : null

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ width: 240, borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 shrink-0 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {selectedClip ? 'Clip' : selectedText ? 'Text' : 'Properties'}
        </span>
        {(selectedClip || selectedText) && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)' }}
          >
            Selected
          </span>
        )}
      </div>

      {/* No selection */}
      {!selectedClip && !selectedText && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
          <div style={{ opacity: 0.15, fontSize: 32 }}>✦</div>
          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Select a clip on the timeline to edit its properties
          </p>
        </div>
      )}

      {/* Clip properties */}
      {selectedClip && (
        <>
          <Section title="Transform">
            <Slider label="Opacity" value={Math.round(selectedClip.opacity * 100)} min={0} max={100}
              onChange={v => updateClip(selectedClip.id, { opacity: v / 100 })} />
            <Slider label="Scale X" value={Math.round(selectedClip.scaleX * 100)} min={10} max={300}
              onChange={v => updateClip(selectedClip.id, { scaleX: v / 100 })} />
            <Slider label="Scale Y" value={Math.round(selectedClip.scaleY * 100)} min={10} max={300}
              onChange={v => updateClip(selectedClip.id, { scaleY: v / 100 })} />
            <Slider label="Rotation" value={selectedClip.rotation} min={-180} max={180}
              onChange={v => updateClip(selectedClip.id, { rotation: v })} />
            <Slider label="Position X" value={Math.round(selectedClip.x * 100)} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { x: v / 100 })} />
            <Slider label="Position Y" value={Math.round(selectedClip.y * 100)} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { y: v / 100 })} />
          </Section>

          <Section title="Color & Light">
            <Slider label="Brightness" value={selectedClip.brightness} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { brightness: v })} />
            <Slider label="Contrast" value={selectedClip.contrast} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { contrast: v })} />
            <Slider label="Saturation" value={selectedClip.saturation} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { saturation: v })} />
            <Slider label="Exposure" value={selectedClip.exposure} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { exposure: v })} />
            <Slider label="Highlights" value={selectedClip.highlights} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { highlights: v })} />
            <Slider label="Shadows" value={selectedClip.shadows} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { shadows: v })} />
          </Section>

          <Section title="HSL & Color">
            <Slider label="Temperature" value={selectedClip.temperature} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { temperature: v })} />
            <Slider label="Tint" value={selectedClip.tint} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { tint: v })} />
            <Slider label="Sharpness" value={selectedClip.sharpness} min={0} max={100}
              onChange={v => updateClip(selectedClip.id, { sharpness: v })} />
          </Section>

          <Section title="Playback" defaultOpen={false}>
            <Slider label="Speed" value={selectedClip.speed} min={0.1} max={10} step={0.05}
              onChange={v => updateClip(selectedClip.id, { speed: v })} />
            <Slider label="Volume" value={Math.round(selectedClip.volume * 100)} min={0} max={200}
              onChange={v => updateClip(selectedClip.id, { volume: v / 100 })} />
            <Toggle label="Reverse" checked={selectedClip.reversed} onChange={v => updateClip(selectedClip.id, { reversed: v })} />
            <Toggle label="Mute" checked={selectedClip.muted} onChange={v => updateClip(selectedClip.id, { muted: v })} />
          </Section>

          <Section title="Chroma Key" defaultOpen={false}>
            <Toggle label="Enable" checked={selectedClip.chromaEnabled} onChange={v => updateClip(selectedClip.id, { chromaEnabled: v })} />
            {selectedClip.chromaEnabled && (
              <>
                <div className="mb-2">
                  <span className="text-xs block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Key Color</span>
                  <input
                    type="color" value={selectedClip.chromaColor}
                    onChange={e => updateClip(selectedClip.id, { chromaColor: e.target.value })}
                    style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  />
                </div>
                <Slider label="Tolerance" value={Math.round(selectedClip.chromaTolerance * 100)} min={0} max={100}
                  onChange={v => updateClip(selectedClip.id, { chromaTolerance: v / 100 })} />
              </>
            )}
          </Section>

          <Section title="Stabilization" defaultOpen={false}>
            <Toggle label="Enable Stabilize" checked={selectedClip.stabilize} onChange={v => updateClip(selectedClip.id, { stabilize: v })} />
          </Section>
        </>
      )}

      {/* Text properties */}
      {selectedText && (
        <>
          <Section title="Text">
            <div className="mb-2">
              <span className="text-xs block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Content</span>
              <textarea
                value={selectedText.text}
                onChange={e => updateTextClip(selectedText.id, { text: e.target.value })}
                rows={2}
                className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div className="mb-2">
              <span className="text-xs block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Font Family</span>
              <select
                value={selectedText.fontFamily}
                onChange={e => updateTextClip(selectedText.id, { fontFamily: e.target.value })}
                className="w-full rounded px-2 py-1 text-xs outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                {['Arial', 'Arial Black', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Helvetica'].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <Slider label="Font Size" value={selectedText.fontSize} min={8} max={200}
              onChange={v => updateTextClip(selectedText.id, { fontSize: v })} />
            <div className="mb-2">
              <span className="text-xs block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
              <input type="color" value={selectedText.fontColor}
                onChange={e => updateTextClip(selectedText.id, { fontColor: e.target.value })}
                style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
            </div>
            <div className="flex gap-2 mb-2">
              {[
                { label: 'B', key: 'bold', active: selectedText.bold },
                { label: 'I', key: 'italic', active: selectedText.italic },
                { label: 'U', key: 'underline', active: selectedText.underline },
              ].map(b => (
                <button key={b.key}
                  onClick={() => updateTextClip(selectedText.id, { [b.key as keyof TextClip]: !b.active })}
                  className="flex-1 py-1 rounded text-xs font-bold"
                  style={{ background: b.active ? 'var(--color-primary)' : 'var(--color-bg-surface)', color: b.active ? 'white' : 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
                  {b.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Transform">
            <Slider label="Rotation" value={selectedText.rotation} min={-180} max={180}
              onChange={v => updateTextClip(selectedText.id, { rotation: v })} />
            <Slider label="Scale" value={Math.round(selectedText.scaleX * 100)} min={10} max={300}
              onChange={v => updateTextClip(selectedText.id, { scaleX: v / 100, scaleY: v / 100 })} />
            <Slider label="Letter Spacing" value={selectedText.letterSpacing} min={-10} max={50}
              onChange={v => updateTextClip(selectedText.id, { letterSpacing: v })} />
            <Slider label="Line Height" value={Math.round(selectedText.lineHeight * 10)} min={5} max={30} step={1}
              onChange={v => updateTextClip(selectedText.id, { lineHeight: v / 10 })} />
          </Section>

          <Section title="Shadow & Stroke" defaultOpen={false}>
            <Slider label="Shadow Blur" value={selectedText.shadowBlur} min={0} max={50}
              onChange={v => updateTextClip(selectedText.id, { shadowBlur: v })} />
            <Slider label="Shadow X" value={selectedText.shadowX} min={-20} max={20}
              onChange={v => updateTextClip(selectedText.id, { shadowX: v })} />
            <Slider label="Shadow Y" value={selectedText.shadowY} min={-20} max={20}
              onChange={v => updateTextClip(selectedText.id, { shadowY: v })} />
            <Slider label="Stroke Width" value={selectedText.strokeWidth} min={0} max={20}
              onChange={v => updateTextClip(selectedText.id, { strokeWidth: v })} />
            {selectedText.strokeWidth > 0 && (
              <div className="mb-2">
                <span className="text-xs block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Stroke Color</span>
                <input type="color" value={selectedText.strokeColor !== 'transparent' ? selectedText.strokeColor : '#000000'}
                  onChange={e => updateTextClip(selectedText.id, { strokeColor: e.target.value })}
                  style={{ width: '100%', height: 28, border: 'none', borderRadius: 4 }} />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
