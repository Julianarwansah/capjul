import { useEditorStore } from '../../store/editorStore'
import { keyframeAt } from '../../shared/keyframe-interpolate'
import { KfControl, Section, Slider } from './controls'
import type { Easing, Keyframe, StickerClip } from '../../types'

// Inspector for a sticker clip. Scale is a single slider driving both axes, which
// is why stickers cannot reach the non-uniform scale that video clips can.

export function StickerInspector({ clip }: { clip: StickerClip }) {
  const { currentTime, updateStickerClip, addStickerKeyframe, removeStickerKeyframe } = useEditorStore()

  const kfs = clip.keyframes ?? []
  const toggleKf = (prop: string, value: number) => {
    const atTime = keyframeAt(kfs, prop, currentTime)
    if (atTime) removeStickerKeyframe(clip.id, atTime.id)
    else addStickerKeyframe(clip.id, { id: crypto.randomUUID(), time: currentTime, property: prop, value, easing: 'linear' })
  }
  const setKfEasing = (kf: Keyframe, easing: Easing) => addStickerKeyframe(clip.id, { ...kf, easing })

  return (
    <Section title="Transform">
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1"><Slider label="Opacity" value={Math.round(clip.opacity * 100)} min={0} max={100}
          onChange={v => updateStickerClip(clip.id, { opacity: v / 100 })} /></div>
        <KfControl kfs={kfs} property="opacity" value={clip.opacity} onToggle={toggleKf} onEasing={setKfEasing} />
      </div>
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1"><Slider label="Scale" value={Math.round(clip.scaleX * 100)} min={10} max={400}
          onChange={v => updateStickerClip(clip.id, { scaleX: v / 100, scaleY: v / 100 })} /></div>
        <KfControl kfs={kfs} property="scaleX" value={clip.scaleX} onToggle={toggleKf} onEasing={setKfEasing} />
      </div>
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1"><Slider label="Rotation" value={clip.rotation} min={-180} max={180}
          onChange={v => updateStickerClip(clip.id, { rotation: v })} /></div>
        <KfControl kfs={kfs} property="rotation" value={clip.rotation} onToggle={toggleKf} onEasing={setKfEasing} />
      </div>
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1"><Slider label="Position X" value={Math.round(clip.x * 100)} min={-100} max={100}
          onChange={v => updateStickerClip(clip.id, { x: v / 100 })} /></div>
        <KfControl kfs={kfs} property="x" value={clip.x} onToggle={toggleKf} onEasing={setKfEasing} />
      </div>
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1"><Slider label="Position Y" value={Math.round(clip.y * 100)} min={-100} max={100}
          onChange={v => updateStickerClip(clip.id, { y: v / 100 })} /></div>
        <KfControl kfs={kfs} property="y" value={clip.y} onToggle={toggleKf} onEasing={setKfEasing} />
      </div>
    </Section>
  )
}
