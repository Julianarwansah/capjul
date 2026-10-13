import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import type { TextClip } from '../types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TEXT_IN_ANIMATIONS, TEXT_OUT_ANIMATIONS } from '../shared/text-animation'
import { hasKeyframes } from '../shared/keyframe-interpolate'

const SPEED_PRESETS = [0.3, 0.5, 1, 1.5, 2, 4]

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

// These adjustments are stored on the clip but rendered by neither the preview
// nor the export; CSS has no equivalent of curves, white balance or unsharp.
// They belong to the Phase 2 compositor (tech debt D7). A slider that changes
// nothing visible is worse than no slider, so they are disabled and say so.
const NOT_RENDERED_HINT = 'Not rendered yet — needs the Phase 2 compositor'

function KfBtn({ active, onClick, disabled, disabledHint }: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledHint : active ? 'Hapus keyframe' : 'Tambah keyframe di sini'}
      style={{
        width: 14, height: 14, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 0,
        background: 'transparent', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 8, height: 8,
        transform: 'rotate(45deg)',
        background: active ? '#f59e0b' : 'transparent',
        border: `1.5px solid ${disabled ? '#3a3a3a' : active ? '#f59e0b' : '#555'}`,
        borderRadius: 1,
      }} />
    </button>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, disabled, hint }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="mb-2" style={disabled ? { opacity: 0.45 } : undefined}>
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(+e.target.value)}
      />
      {disabled && hint && (
        <p className="mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>{hint}</p>
      )}
    </div>
  )
}

export function RightPanel() {
  const {
    project, currentTime,
    selectedClipIds, selectedTextIds, selectedAudioIds, selectedStickerIds,
    updateClip, updateTextClip, updateAudioClip, updateStickerClip,
    addClipKeyframe, removeClipKeyframe, addTextKeyframe, removeTextKeyframe,
    addAudioKeyframe, removeAudioKeyframe, addStickerKeyframe, removeStickerKeyframe,
  } = useEditorStore()

  const selectedClip = selectedClipIds[0]
    ? project.clips.find(c => c.id === selectedClipIds[0])
    : null
  const selectedText = selectedTextIds[0]
    ? project.textClips.find(t => t.id === selectedTextIds[0])
    : null
  const selectedAudio = selectedAudioIds[0]
    ? project.audioClips.find(c => c.id === selectedAudioIds[0])
    : null
  const selectedSticker = selectedStickerIds[0]
    ? project.stickerClips.find(c => c.id === selectedStickerIds[0])
    : null

  const hasSelection = !!(selectedClip || selectedText || selectedAudio || selectedSticker)

  const panelTitle = selectedClip ? 'Video Clip'
    : selectedText ? 'Teks'
    : selectedAudio ? 'Audio'
    : selectedSticker ? 'Stiker'
    : 'Properties'

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
          {panelTitle}
        </span>
        {hasSelection && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)' }}
          >
            Selected
          </span>
        )}
      </div>

      {/* No selection */}
      {!hasSelection && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
          <div style={{ opacity: 0.15, fontSize: 32 }}>✦</div>
          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Select a clip on the timeline to edit its properties
          </p>
        </div>
      )}

      {/* Clip properties */}
      {selectedClip && (() => {
        // Hoisted to the whole clip branch so Transform and Playback share one
        // keyframe helper instead of each defining their own.
        const kfs = selectedClip.keyframes ?? []
        const toggleKf = (prop: string, value: number) => {
          const atTime = kfs.find(k => k.property === prop && Math.abs(k.time - currentTime) < 0.05)
          if (atTime) removeClipKeyframe(selectedClip.id, atTime.id)
          else addClipKeyframe(selectedClip.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value })
        }
        return (
        <>
          <Section title="Transform">
                <>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Opacity" value={Math.round(selectedClip.opacity * 100)} min={0} max={100} onChange={v => updateClip(selectedClip.id, { opacity: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'opacity')} onClick={() => toggleKf('opacity', selectedClip.opacity)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Scale X" value={Math.round(selectedClip.scaleX * 100)} min={10} max={300} onChange={v => updateClip(selectedClip.id, { scaleX: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'scaleX')} onClick={() => toggleKf('scaleX', selectedClip.scaleX)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Scale Y" value={Math.round(selectedClip.scaleY * 100)} min={10} max={300} onChange={v => updateClip(selectedClip.id, { scaleY: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'scaleY')} onClick={() => toggleKf('scaleY', selectedClip.scaleY)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Rotation" value={selectedClip.rotation} min={-180} max={180} onChange={v => updateClip(selectedClip.id, { rotation: v })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'rotation')} onClick={() => toggleKf('rotation', selectedClip.rotation)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Position X" value={Math.round(selectedClip.x * 100)} min={-100} max={100} onChange={v => updateClip(selectedClip.id, { x: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'x')} onClick={() => toggleKf('x', selectedClip.x)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Position Y" value={Math.round(selectedClip.y * 100)} min={-100} max={100} onChange={v => updateClip(selectedClip.id, { y: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'y')} onClick={() => toggleKf('y', selectedClip.y)} />
                  </div>
                </>
          </Section>

          <Section title="Color & Light">
            <Slider label="Brightness" value={selectedClip.brightness} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { brightness: v })} />
            <Slider label="Contrast" value={selectedClip.contrast} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { contrast: v })} />
            <Slider label="Saturation" value={selectedClip.saturation} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { saturation: v })} />
            <Slider label="Exposure" value={selectedClip.exposure} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { exposure: v })}
              disabled hint={NOT_RENDERED_HINT} />
            <Slider label="Highlights" value={selectedClip.highlights} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { highlights: v })}
              disabled hint={NOT_RENDERED_HINT} />
            <Slider label="Shadows" value={selectedClip.shadows} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { shadows: v })}
              disabled hint={NOT_RENDERED_HINT} />
          </Section>

          <Section title="HSL & Color">
            <Slider label="Temperature" value={selectedClip.temperature} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { temperature: v })}
              disabled hint={NOT_RENDERED_HINT} />
            <Slider label="Tint" value={selectedClip.tint} min={-100} max={100}
              onChange={v => updateClip(selectedClip.id, { tint: v })}
              disabled hint={NOT_RENDERED_HINT} />
            <Slider label="Sharpness" value={selectedClip.sharpness} min={0} max={100}
              onChange={v => updateClip(selectedClip.id, { sharpness: v })}
              disabled hint={NOT_RENDERED_HINT} />
          </Section>

          <Section title="Playback">
            <div className="mb-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Speed</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedClip.speed}x</span>
                  <KfBtn
                    active={false}
                    disabled
                    disabledHint="Keyframe kecepatan belum didukung: speed ramp butuh integrasi kecepatan terhadap waktu"
                    onClick={() => {}}
                  />
                </div>
              </div>
              <div className="flex gap-1 mb-2">
                {SPEED_PRESETS.map(s => (
                  <button
                    key={s}
                    onClick={() => updateClip(selectedClip.id, { speed: s })}
                    style={{
                      flex: 1, fontSize: 9, padding: '3px 0', borderRadius: 4, border: 'none',
                      cursor: 'pointer',
                      background: selectedClip.speed === s ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                      color: selectedClip.speed === s ? 'white' : 'var(--color-text-secondary)',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <input
                type="range" min={0.1} max={10} step={0.05} value={selectedClip.speed}
                onChange={e => updateClip(selectedClip.id, { speed: +e.target.value })}
              />
              <p className="mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>
                Speed berubah instan; keyframe kecepatan belum didukung
              </p>
            </div>
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
        )
      })()}

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
            {(() => {
              const kfs = selectedText.keyframes ?? []
              const toggleKf = (prop: string, value: number) => {
                const atTime = kfs.find(k => k.property === prop && Math.abs(k.time - currentTime) < 0.05)
                if (atTime) removeTextKeyframe(selectedText.id, atTime.id)
                else addTextKeyframe(selectedText.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value })
              }
              return (
                <>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Rotation" value={selectedText.rotation} min={-180} max={180} onChange={v => updateTextClip(selectedText.id, { rotation: v })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'rotation')} onClick={() => toggleKf('rotation', selectedText.rotation)} />
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1"><Slider label="Scale" value={Math.round(selectedText.scaleX * 100)} min={10} max={300} onChange={v => updateTextClip(selectedText.id, { scaleX: v / 100, scaleY: v / 100 })} /></div>
                    <KfBtn active={hasKeyframes(kfs, 'scaleX')} onClick={() => toggleKf('scaleX', selectedText.scaleX)} />
                  </div>
                  <Slider label="Letter Spacing" value={selectedText.letterSpacing} min={-10} max={50}
                    onChange={v => updateTextClip(selectedText.id, { letterSpacing: v })} />
                  <Slider label="Line Height" value={Math.round(selectedText.lineHeight * 10)} min={5} max={30} step={1}
                    onChange={v => updateTextClip(selectedText.id, { lineHeight: v / 10 })} />
                </>
              )
            })()}
          </Section>

          <Section title="Animasi">
            <div className="mb-3">
              <span className="text-xs block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Masuk</span>
              <div className="grid grid-cols-3 gap-1">
                {TEXT_IN_ANIMATIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => updateTextClip(selectedText.id, { animation: a.id === 'none' ? undefined : a.id })}
                    style={{
                      fontSize: 9, padding: '4px 2px', borderRadius: 4, border: 'none',
                      cursor: 'pointer', textAlign: 'center',
                      background: (selectedText.animation ?? 'none') === a.id
                        ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                      color: (selectedText.animation ?? 'none') === a.id
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
                    onClick={() => updateTextClip(selectedText.id, { outAnimation: a.id === 'none' ? undefined : a.id })}
                    style={{
                      fontSize: 9, padding: '4px 2px', borderRadius: 4, border: 'none',
                      cursor: 'pointer', textAlign: 'center',
                      background: (selectedText.outAnimation ?? 'none') === a.id
                        ? '#7c3aed' : 'var(--color-bg-surface)',
                      color: (selectedText.outAnimation ?? 'none') === a.id
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

      {/* Audio clip properties */}
      {selectedAudio && (() => {
        const audioKfs = selectedAudio.keyframes ?? []
        const toggleAudioKf = (prop: string, fallback: number) => {
          const existing = audioKfs.find(k => k.property === prop && Math.abs(k.time - currentTime) < 0.05)
          if (existing) {
            removeAudioKeyframe(selectedAudio.id, existing.id)
          } else {
            const nearest = [...audioKfs].filter(k => k.property === prop).sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime))[0]
            addAudioKeyframe(selectedAudio.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value: nearest?.value ?? fallback })
          }
        }
        return (
        <>
          <Section title="Volume & Playback">
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <Slider label="Volume" value={Math.round(selectedAudio.volume * 100)} min={0} max={200}
                  onChange={v => updateAudioClip(selectedAudio.id, { volume: v / 100 })} />
              </div>
              <KfBtn active={hasKeyframes(audioKfs, 'volume')} onClick={() => toggleAudioKf('volume', selectedAudio.volume)} />
            </div>
            <div className="mb-1">
              <div className="flex justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Speed</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedAudio.speed}x</span>
              </div>
              <div className="flex gap-1 mb-2">
                {SPEED_PRESETS.map(s => (
                  <button
                    key={s}
                    onClick={() => updateAudioClip(selectedAudio.id, { speed: s })}
                    style={{
                      flex: 1, fontSize: 9, padding: '3px 0', borderRadius: 4, border: 'none',
                      cursor: 'pointer',
                      background: selectedAudio.speed === s ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                      color: selectedAudio.speed === s ? 'white' : 'var(--color-text-secondary)',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <input
                type="range" min={0.1} max={4} step={0.05} value={selectedAudio.speed}
                onChange={e => updateAudioClip(selectedAudio.id, { speed: +e.target.value })}
              />
            </div>
            <Toggle label="Mute" checked={selectedAudio.muted} onChange={v => updateAudioClip(selectedAudio.id, { muted: v })} />
          </Section>
          <Section title="Fade" defaultOpen={false}>
            <Slider label="Fade In" value={Math.round(selectedAudio.fadein * 10) / 10} min={0} max={5} step={0.1}
              onChange={v => updateAudioClip(selectedAudio.id, { fadein: v })} />
            <Slider label="Fade Out" value={Math.round(selectedAudio.fadeout * 10) / 10} min={0} max={5} step={0.1}
              onChange={v => updateAudioClip(selectedAudio.id, { fadeout: v })} />
          </Section>
          <Section title="Pitch" defaultOpen={false}>
            <Slider label="Pitch Shift" value={selectedAudio.pitch} min={-12} max={12} step={1}
              onChange={v => updateAudioClip(selectedAudio.id, { pitch: v })} />
          </Section>
        </>
        )
      })()}

      {/* Sticker clip properties */}
      {selectedSticker && (() => {
        const kfs = selectedSticker.keyframes ?? []
        const toggleKf = (prop: string, value: number) => {
          const atTime = kfs.find(k => k.property === prop && Math.abs(k.time - currentTime) < 0.05)
          if (atTime) removeStickerKeyframe(selectedSticker.id, atTime.id)
          else addStickerKeyframe(selectedSticker.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value })
        }
        return (
        <>
          <Section title="Transform">
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Slider label="Opacity" value={Math.round(selectedSticker.opacity * 100)} min={0} max={100}
                onChange={v => updateStickerClip(selectedSticker.id, { opacity: v / 100 })} /></div>
              <KfBtn active={hasKeyframes(kfs, 'opacity')} onClick={() => toggleKf('opacity', selectedSticker.opacity)} />
            </div>
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Slider label="Scale" value={Math.round(selectedSticker.scaleX * 100)} min={10} max={400}
                onChange={v => updateStickerClip(selectedSticker.id, { scaleX: v / 100, scaleY: v / 100 })} /></div>
              <KfBtn active={hasKeyframes(kfs, 'scaleX')} onClick={() => toggleKf('scaleX', selectedSticker.scaleX)} />
            </div>
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Slider label="Rotation" value={selectedSticker.rotation} min={-180} max={180}
                onChange={v => updateStickerClip(selectedSticker.id, { rotation: v })} /></div>
              <KfBtn active={hasKeyframes(kfs, 'rotation')} onClick={() => toggleKf('rotation', selectedSticker.rotation)} />
            </div>
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Slider label="Position X" value={Math.round(selectedSticker.x * 100)} min={-100} max={100}
                onChange={v => updateStickerClip(selectedSticker.id, { x: v / 100 })} /></div>
              <KfBtn active={hasKeyframes(kfs, 'x')} onClick={() => toggleKf('x', selectedSticker.x)} />
            </div>
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Slider label="Position Y" value={Math.round(selectedSticker.y * 100)} min={-100} max={100}
                onChange={v => updateStickerClip(selectedSticker.id, { y: v / 100 })} /></div>
              <KfBtn active={hasKeyframes(kfs, 'y')} onClick={() => toggleKf('y', selectedSticker.y)} />
            </div>
          </Section>
        </>
        )
      })()}
    </div>
  )
}
