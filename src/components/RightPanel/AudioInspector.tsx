import { useEditorStore } from '../../store/editorStore'
import { keyframeAt } from '../../shared/keyframe-interpolate'
import { KfControl, Section, Slider, Toggle } from './controls'
import { SPEED_PRESETS } from './constants'
import type { AudioClip, Easing, Keyframe } from '../../types'

// Inspector for an audio clip.

export function AudioInspector({ clip }: { clip: AudioClip }) {
  const { currentTime, updateAudioClip, addAudioKeyframe, removeAudioKeyframe } = useEditorStore()

  const kfs = clip.keyframes ?? []
  const toggleKf = (prop: string, fallback: number) => {
    const existing = keyframeAt(kfs, prop, currentTime)
    if (existing) {
      removeAudioKeyframe(clip.id, existing.id)
    } else {
      // Seed the new keyframe from the nearest one for this property so adding a
      // point mid-curve does not jump the volume to the clip's base value.
      const nearest = [...kfs]
        .filter(k => k.property === prop)
        .sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime))[0]
      addAudioKeyframe(clip.id, {
        id: crypto.randomUUID(), time: currentTime, property: prop,
        value: nearest?.value ?? fallback, easing: 'linear',
      })
    }
  }
  const setKfEasing = (kf: Keyframe, easing: Easing) => addAudioKeyframe(clip.id, { ...kf, easing })

  return (
    <>
      <Section title="Volume & Playback">
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <Slider label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200}
              onChange={v => updateAudioClip(clip.id, { volume: v / 100 })} />
          </div>
          <KfControl kfs={kfs} property="volume" value={clip.volume} onToggle={toggleKf} onEasing={setKfEasing} />
        </div>
        <div className="mb-1">
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Speed</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{clip.speed}x</span>
          </div>
          <div className="flex gap-1 mb-2">
            {SPEED_PRESETS.map(s => (
              <button
                key={s}
                onClick={() => updateAudioClip(clip.id, { speed: s })}
                aria-label={`Kecepatan audio ${s}x`}
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
            type="range" min={0.1} max={4} step={0.05} value={clip.speed}
            aria-label="Kecepatan audio"
            onChange={e => updateAudioClip(clip.id, { speed: +e.target.value })}
          />
        </div>
        <Toggle label="Mute" checked={clip.muted} onChange={v => updateAudioClip(clip.id, { muted: v })} />
      </Section>
      <Section title="Fade" defaultOpen={false}>
        <Slider label="Fade In" value={Math.round(clip.fadein * 10) / 10} min={0} max={5} step={0.1}
          onChange={v => updateAudioClip(clip.id, { fadein: v })} />
        <Slider label="Fade Out" value={Math.round(clip.fadeout * 10) / 10} min={0} max={5} step={0.1}
          onChange={v => updateAudioClip(clip.id, { fadeout: v })} />
      </Section>
      <Section title="Pitch" defaultOpen={false}>
        {/* Disabled rather than left live: pitch is stored and read by nothing.
            useAudioClips never sets it and render-plan emits no asetrate or
            equivalent, so the slider moved a number and changed no sound in
            either the preview or the export. Same treatment as the six grading
            fields (tech debt D7) - a control that cannot do what it says is
            worse than one that admits it cannot. */}
        <Slider label="Pitch Shift" value={clip.pitch} min={-12} max={12} step={1}
          onChange={v => updateAudioClip(clip.id, { pitch: v })}
          disabled
          hint="Not applied yet — neither the preview nor the export shifts pitch" />
      </Section>
    </>
  )
}
