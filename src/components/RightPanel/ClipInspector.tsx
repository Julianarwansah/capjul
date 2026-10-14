import { useEditorStore } from '../../store/editorStore'
import { keyframeAt } from '../../shared/keyframe-interpolate'
import { KfBtn, KfControl, Section, Slider, Toggle } from './controls'
import { SPEED_PRESETS } from './constants'
import type { Clip, Easing, Keyframe } from '../../types'

// These adjustments are stored on the clip but rendered by neither the preview
// nor the export; CSS has no equivalent of curves, white balance or unsharp.
// They belong to the Phase 2 compositor (tech debt D7). A slider that changes
// nothing visible is worse than no slider, so they are disabled and say so.
const NOT_RENDERED_HINT = 'Not rendered yet — needs the Phase 2 compositor'

// Inspector for a video or image clip. Reads the store itself so the caller only
// has to say which clip; the panel above decides that.

export function ClipInspector({ clip }: { clip: Clip }) {
  const { currentTime, updateClip, addClipKeyframe, removeClipKeyframe } = useEditorStore()

  // Hoisted to the whole inspector so Transform and Playback share one keyframe
  // helper instead of each defining their own.
  const kfs = clip.keyframes ?? []
  const toggleKf = (prop: string, value: number) => {
    const atTime = keyframeAt(kfs, prop, currentTime)
    if (atTime) removeClipKeyframe(clip.id, atTime.id)
    else addClipKeyframe(clip.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value, easing: 'linear' })
  }
  // addClipKeyframe replaces any keyframe for the same property at the same
  // instant, so re-adding the existing one with a new curve rewrites it in place
  // and stays a single undo step.
  const setKfEasing = (kf: Keyframe, easing: Easing) => addClipKeyframe(clip.id, { ...kf, easing })

  return (
    <>
      <Section title="Transform">
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Opacity" value={Math.round(clip.opacity * 100)} min={0} max={100} onChange={v => updateClip(clip.id, { opacity: v / 100 })} /></div>
          <KfControl kfs={kfs} property="opacity" value={clip.opacity} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Scale X" value={Math.round(clip.scaleX * 100)} min={10} max={300} onChange={v => updateClip(clip.id, { scaleX: v / 100 })} /></div>
          <KfControl kfs={kfs} property="scaleX" value={clip.scaleX} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Scale Y" value={Math.round(clip.scaleY * 100)} min={10} max={300} onChange={v => updateClip(clip.id, { scaleY: v / 100 })} /></div>
          <KfControl kfs={kfs} property="scaleY" value={clip.scaleY} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Rotation" value={clip.rotation} min={-180} max={180} onChange={v => updateClip(clip.id, { rotation: v })} /></div>
          <KfControl kfs={kfs} property="rotation" value={clip.rotation} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Position X" value={Math.round(clip.x * 100)} min={-100} max={100} onChange={v => updateClip(clip.id, { x: v / 100 })} /></div>
          <KfControl kfs={kfs} property="x" value={clip.x} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1"><Slider label="Position Y" value={Math.round(clip.y * 100)} min={-100} max={100} onChange={v => updateClip(clip.id, { y: v / 100 })} /></div>
          <KfControl kfs={kfs} property="y" value={clip.y} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
      </Section>

      <Section title="Color & Light">
        <Slider label="Brightness" value={clip.brightness} min={-100} max={100}
          onChange={v => updateClip(clip.id, { brightness: v })} />
        <Slider label="Contrast" value={clip.contrast} min={-100} max={100}
          onChange={v => updateClip(clip.id, { contrast: v })} />
        <Slider label="Saturation" value={clip.saturation} min={-100} max={100}
          onChange={v => updateClip(clip.id, { saturation: v })} />
        <Slider label="Exposure" value={clip.exposure} min={-100} max={100}
          onChange={v => updateClip(clip.id, { exposure: v })}
          disabled hint={NOT_RENDERED_HINT} />
        <Slider label="Highlights" value={clip.highlights} min={-100} max={100}
          onChange={v => updateClip(clip.id, { highlights: v })}
          disabled hint={NOT_RENDERED_HINT} />
        <Slider label="Shadows" value={clip.shadows} min={-100} max={100}
          onChange={v => updateClip(clip.id, { shadows: v })}
          disabled hint={NOT_RENDERED_HINT} />
      </Section>

      <Section title="HSL & Color">
        <Slider label="Temperature" value={clip.temperature} min={-100} max={100}
          onChange={v => updateClip(clip.id, { temperature: v })}
          disabled hint={NOT_RENDERED_HINT} />
        <Slider label="Tint" value={clip.tint} min={-100} max={100}
          onChange={v => updateClip(clip.id, { tint: v })}
          disabled hint={NOT_RENDERED_HINT} />
        <Slider label="Sharpness" value={clip.sharpness} min={0} max={100}
          onChange={v => updateClip(clip.id, { sharpness: v })}
          disabled hint={NOT_RENDERED_HINT} />
      </Section>

      <Section title="Playback">
        <div className="mb-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Speed</span>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{clip.speed}x</span>
              <KfBtn
                atPlayhead={false}
                animated={false}
                property="speed"
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
                onClick={() => updateClip(clip.id, { speed: s })}
                aria-label={`Kecepatan ${s}x`}
                style={{
                  flex: 1, fontSize: 9, padding: '3px 0', borderRadius: 4, border: 'none',
                  cursor: 'pointer',
                  background: clip.speed === s ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: clip.speed === s ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {s}x
              </button>
            ))}
          </div>
          <input
            type="range" min={0.1} max={10} step={0.05} value={clip.speed}
            aria-label="Kecepatan clip"
            onChange={e => updateClip(clip.id, { speed: +e.target.value })}
          />
          <p className="mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>
            Speed berubah instan; keyframe kecepatan belum didukung
          </p>
        </div>
        <Slider label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200}
          onChange={v => updateClip(clip.id, { volume: v / 100 })} />
        <Toggle label="Reverse" checked={clip.reversed} onChange={v => updateClip(clip.id, { reversed: v })} />
        <Toggle label="Mute" checked={clip.muted} onChange={v => updateClip(clip.id, { muted: v })} />
      </Section>

      <Section title="Chroma Key" defaultOpen={false}>
        <Toggle label="Enable" checked={clip.chromaEnabled} onChange={v => updateClip(clip.id, { chromaEnabled: v })} />
        {clip.chromaEnabled && (
          <>
            <div className="mb-2">
              <label className="text-xs block mb-1" htmlFor="chroma-color" style={{ color: 'var(--color-text-secondary)' }}>Key Color</label>
              <input
                id="chroma-color"
                type="color" value={clip.chromaColor}
                onChange={e => updateClip(clip.id, { chromaColor: e.target.value })}
                style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }}
              />
            </div>
            <Slider label="Tolerance" value={Math.round(clip.chromaTolerance * 100)} min={0} max={100}
              onChange={v => updateClip(clip.id, { chromaTolerance: v / 100 })} />
          </>
        )}
      </Section>

      <Section title="Stabilization" defaultOpen={false}>
        <Toggle label="Enable Stabilize" checked={clip.stabilize} onChange={v => updateClip(clip.id, { stabilize: v })} />
      </Section>
    </>
  )
}
