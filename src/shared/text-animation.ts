// CSS animation helpers for TextClip. Called every frame by PreviewPanel,
// so all functions are pure and allocation-free.

export const TEXT_IN_ANIMATIONS = [
  { id: 'none',       label: 'Tanpa' },
  { id: 'fade',       label: 'Fade' },
  { id: 'slideLeft',  label: '← Kiri' },
  { id: 'slideRight', label: '→ Kanan' },
  { id: 'slideUp',    label: '↑ Atas' },
  { id: 'slideDown',  label: '↓ Bawah' },
  { id: 'zoomIn',     label: 'Zoom' },
  { id: 'pop',        label: 'Pop' },
  { id: 'bounce',     label: 'Bounce' },
] as const

export const TEXT_OUT_ANIMATIONS = [
  { id: 'none',       label: 'Tanpa' },
  { id: 'fade',       label: 'Fade' },
  { id: 'slideLeft',  label: '← Kiri' },
  { id: 'slideRight', label: '→ Kanan' },
  { id: 'slideUp',    label: '↑ Atas' },
  { id: 'slideDown',  label: '↓ Bawah' },
  { id: 'zoomOut',    label: 'Zoom' },
] as const

export const ANIM_DURATION = 0.4 // seconds per phase

export interface AnimCss {
  opacity: number
  extraTransform: string
}

const NONE: AnimCss = { opacity: 1, extraTransform: '' }

function easeOut(t: number) { return 1 - (1 - t) ** 2 }
function easeIn(t: number)  { return t * t }

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t
  if (t < 2 / 2.75) { t -= 1.5 / 2.75;  return 7.5625 * t * t + 0.75 }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375 }
  t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375
}

/** In-animation CSS for elapsed seconds since clip start. */
export function inAnimCss(name: string | undefined, elapsed: number): AnimCss {
  if (!name || name === 'none') return NONE
  const raw = Math.min(1, Math.max(0, elapsed / ANIM_DURATION))
  const t = easeOut(raw)

  switch (name) {
    case 'fade':
      return { opacity: raw, extraTransform: '' }
    case 'slideLeft':
      return { opacity: raw, extraTransform: `translateX(${(1 - t) * -80}px)` }
    case 'slideRight':
      return { opacity: raw, extraTransform: `translateX(${(1 - t) * 80}px)` }
    case 'slideUp':
      return { opacity: raw, extraTransform: `translateY(${(1 - t) * 60}px)` }
    case 'slideDown':
      return { opacity: raw, extraTransform: `translateY(${(1 - t) * -60}px)` }
    case 'zoomIn':
      return { opacity: raw, extraTransform: `scale(${0.3 + t * 0.7})` }
    case 'pop': {
      const pop = raw < 1 ? 1 + Math.sin(raw * Math.PI) * 0.2 : 1
      return { opacity: Math.min(1, raw * 3), extraTransform: `scale(${(0.3 + t * 0.7) * pop})` }
    }
    case 'bounce':
      return { opacity: Math.min(1, raw * 3), extraTransform: `translateY(${(1 - bounceOut(raw)) * -40}px)` }
    default:
      return NONE
  }
}

/** Out-animation CSS for remaining seconds until clip end. */
export function outAnimCss(name: string | undefined, remaining: number): AnimCss {
  if (!name || name === 'none') return NONE
  const raw = Math.min(1, Math.max(0, remaining / ANIM_DURATION))
  const t = easeIn(raw)

  switch (name) {
    case 'fade':
      return { opacity: raw, extraTransform: '' }
    case 'slideLeft':
      return { opacity: raw, extraTransform: `translateX(${(1 - t) * -80}px)` }
    case 'slideRight':
      return { opacity: raw, extraTransform: `translateX(${(1 - t) * 80}px)` }
    case 'slideUp':
      return { opacity: raw, extraTransform: `translateY(${(1 - t) * -60}px)` }
    case 'slideDown':
      return { opacity: raw, extraTransform: `translateY(${(1 - t) * 60}px)` }
    case 'zoomOut':
      return { opacity: raw, extraTransform: `scale(${t})` }
    default:
      return NONE
  }
}

/** Merge in + out animation CSS for a clip at the given time. */
export function clipAnimCss(
  animation: string | undefined,
  outAnimation: string | undefined,
  elapsed: number,
  remaining: number,
): AnimCss {
  const inActive  = !!animation    && animation    !== 'none' && elapsed   < ANIM_DURATION
  const outActive = !!outAnimation && outAnimation !== 'none' && remaining < ANIM_DURATION

  if (!inActive && !outActive) return NONE

  // Both phases overlap only in very short clips; out wins.
  if (outActive && (remaining <= elapsed || !inActive)) return outAnimCss(outAnimation, remaining)
  if (inActive)  return inAnimCss(animation, elapsed)
  return NONE
}
