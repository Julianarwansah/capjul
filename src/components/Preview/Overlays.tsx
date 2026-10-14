import { STICKER_BASE_RATIO } from '../../shared/sticker-assets'
import { stickerDataUrl } from '../../shared/sticker-svgs'
import { clipAnim } from '../../shared/text-animation'
import { stickerTransformAt, textTransformAt } from '../../shared/scene'
import type { Caption, Clip, StickerClip, TextClip } from '../../types'

// Presentational overlays painted inside the preview canvas. Every one of them
// sizes in `cqh` so it tracks the rendered canvas height rather than the root
// font-size, which is what keeps the preview and the export rasterizer in
// agreement (see parity.test.ts). Dragging stays with the parent because it
// needs the canvas element's bounding rect.

interface TextOverlayProps {
  clip: TextClip
  currentTime: number
  canvasH: number
  onMouseDown: (e: React.MouseEvent) => void
}

export function TextOverlay({ clip: t, currentTime, canvasH, onMouseDown }: TextOverlayProps) {
  const elapsed = currentTime - t.startTime
  const remaining = t.startTime + t.duration - currentTime
  const anim = clipAnim(t.animation, t.outAnimation, elapsed, remaining)
  const tf = textTransformAt(t, currentTime)
  const baseTransform = `translate(-50%, -50%) rotate(${tf.rotation}deg) scale(${tf.scaleX}, ${tf.scaleY})`
  const animTransform = anim.dx !== 0 || anim.dy !== 0 || anim.scale !== 1
    ? `translate(${anim.dx * 100}cqh, ${anim.dy * 100}cqh) scale(${anim.scale})`
    : ''

  return (
    <div
      className="absolute"
      style={{
        left: `${tf.x * 100}%`,
        top: `${tf.y * 100}%`,
        transform: animTransform ? `${baseTransform} ${animTransform}` : baseTransform,
        opacity: anim.opacity,
        fontFamily: t.fontFamily,
        fontSize: `${(t.fontSize / canvasH) * 100}cqh`,
        color: t.fontColor,
        fontWeight: t.bold ? 'bold' : 'normal',
        fontStyle: t.italic ? 'italic' : 'normal',
        textDecoration: t.underline ? 'underline' : 'none',
        textAlign: t.align,
        textShadow: `${(t.shadowX / canvasH) * 100}cqh ${(t.shadowY / canvasH) * 100}cqh ${(t.shadowBlur / canvasH) * 100}cqh ${t.shadowColor}`,
        WebkitTextStroke: t.strokeWidth ? `${(t.strokeWidth / canvasH) * 100}cqh ${t.strokeColor}` : undefined,
        letterSpacing: `${(t.letterSpacing / canvasH) * 100}cqh`,
        whiteSpace: 'pre-wrap',
        userSelect: 'none',
        cursor: 'move',
        padding: '4px 8px',
        background: t.backgroundColor !== 'transparent' ? t.backgroundColor : undefined,
      }}
      onMouseDown={onMouseDown}
    >
      {t.text}
    </div>
  )
}

interface StickerOverlayProps {
  clip: StickerClip
  currentTime: number
  onMouseDown: (e: React.MouseEvent) => void
}

/** Returns null for a sticker asset that no longer resolves, matching the
 *  previous inline behaviour of skipping it rather than rendering a broken img. */
export function StickerOverlay({ clip: s, currentTime, onMouseDown }: StickerOverlayProps) {
  const url = stickerDataUrl(s.src)
  if (!url) return null
  const st = stickerTransformAt(s, currentTime)
  return (
    <img
      src={url}
      alt=""
      className="absolute"
      style={{
        left: `${st.x * 100}%`,
        top: `${st.y * 100}%`,
        width: `${STICKER_BASE_RATIO * 100 * st.scaleX}cqh`,
        transform: `translate(-50%, -50%) rotate(${st.rotation}deg)`,
        opacity: st.opacity,
        cursor: 'move',
      }}
      onMouseDown={onMouseDown}
    />
  )
}

export function CaptionOverlay({ caption: c, canvasH }: { caption: Caption; canvasH: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        bottom: '8%',
        left: '10%',
        right: '10%',
        textAlign: 'center',
        fontSize: `${(32 / canvasH) * 100}cqh`,
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
        WebkitTextStroke: '1px rgba(0,0,0,0.6)',
        userSelect: 'none',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.3,
      }}
    >
      {c.text}
    </div>
  )
}

// Inline SVG turbulence, URL-encoded because it goes through a CSS url().
const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

/** The effects that are pure CSS layers rather than filters on the media
 *  element: vignette, grain and letterbox. Unknown ids render nothing. */
export function EffectOverlays({ effects }: { effects: Clip['effects'] }) {
  return (
    <>
      {effects.map(e => {
        if (e.id === 'vignette') return (
          <div
            key="vignette"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, transparent ${30 + (1 - e.intensity) * 40}%, rgba(0,0,0,${e.intensity * 0.85}) 100%)`,
            }}
          />
        )
        if (e.id === 'grain') return (
          <div
            key="grain"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: GRAIN_SVG,
              opacity: e.intensity * 0.3,
              mixBlendMode: 'overlay',
            }}
          />
        )
        if (e.id === 'letterbox') return (
          <>
            <div key="lb-top" className="absolute pointer-events-none" style={{ top: 0, left: 0, right: 0, height: `${e.intensity * 12}%`, background: 'black' }} />
            <div key="lb-bot" className="absolute pointer-events-none" style={{ bottom: 0, left: 0, right: 0, height: `${e.intensity * 12}%`, background: 'black' }} />
          </>
        )
        return null
      })}
    </>
  )
}

/** Rule-of-thirds grid and title/action safe zones. Editing aids only, so they
 *  never intercept pointer events. */
export function GuideOverlays({ showGrid, showSafeZone }: { showGrid: boolean; showSafeZone: boolean }) {
  if (!showGrid && !showSafeZone) return null
  return (
    <>
      {showSafeZone && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute" style={{ inset: '10%', border: '1px dashed rgba(255,255,255,0.3)' }} />
          <div className="absolute" style={{ inset: '20%', border: '1px dashed rgba(255,255,255,0.15)' }} />
        </div>
      )}
      {showGrid && (
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '33.33% 33.33%',
        }} />
      )}
    </>
  )
}
