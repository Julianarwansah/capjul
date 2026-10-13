// Animation model for TextClip, shared by the preview and the compositor.
// Offsets are fractions of canvas height and scale is a multiplier about the
// box centre, so both backends derive identical motion at any resolution -
// pixel offsets would slide a 4K export a different relative distance than the
// preview shows.

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

export interface AnimState {
  opacity: number
  /** Horizontal offset as a fraction of canvas height. */
  dx: number
  /** Vertical offset as a fraction of canvas height. */
  dy: number
  /** Multiplier about the box centre. */
  scale: number
}

const NONE: AnimState = { opacity: 1, dx: 0, dy: 0, scale: 1 }

const SLIDE_X = 0.08
const SLIDE_Y = 0.06
const BOUNCE_Y = 0.05

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
function easeOut(t: number) { return 1 - (1 - t) ** 2 }
function easeIn(t: number)  { return t * t }

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t
  if (t < 2 / 2.75) { t -= 1.5 / 2.75;  return 7.5625 * t * t + 0.75 }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375 }
  t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375
}

/** In-animation state for elapsed seconds since clip start. */
export function inAnim(name: string | undefined, elapsed: number): AnimState {
  if (!name || name === 'none') return NONE
  const raw = clamp01(elapsed / ANIM_DURATION)
  const t = easeOut(raw)

  switch (name) {
    case 'fade':
      return { ...NONE, opacity: raw }
    case 'slideLeft':
      return { ...NONE, opacity: raw, dx: (1 - t) * -SLIDE_X }
    case 'slideRight':
      return { ...NONE, opacity: raw, dx: (1 - t) * SLIDE_X }
    case 'slideUp':
      return { ...NONE, opacity: raw, dy: (1 - t) * -SLIDE_Y }
    case 'slideDown':
      return { ...NONE, opacity: raw, dy: (1 - t) * SLIDE_Y }
    case 'zoomIn':
      return { ...NONE, opacity: raw, scale: 0.3 + t * 0.7 }
    case 'pop': {
      const pop = raw < 1 ? 1 + Math.sin(raw * Math.PI) * 0.2 : 1
      return { ...NONE, opacity: Math.min(1, raw * 3), scale: (0.3 + t * 0.7) * pop }
    }
    case 'bounce':
      return { ...NONE, opacity: Math.min(1, raw * 3), dy: (1 - bounceOut(raw)) * -BOUNCE_Y }
    default:
      return NONE
  }
}

/** Out-animation state for remaining seconds until clip end. */
export function outAnim(name: string | undefined, remaining: number): AnimState {
  if (!name || name === 'none') return NONE
  const raw = clamp01(remaining / ANIM_DURATION)
  const t = easeIn(raw)

  switch (name) {
    case 'fade':
      return { ...NONE, opacity: raw }
    case 'slideLeft':
      return { ...NONE, opacity: raw, dx: (1 - t) * -SLIDE_X }
    case 'slideRight':
      return { ...NONE, opacity: raw, dx: (1 - t) * SLIDE_X }
    case 'slideUp':
      return { ...NONE, opacity: raw, dy: (1 - t) * SLIDE_Y }
    case 'slideDown':
      return { ...NONE, opacity: raw, dy: (1 - t) * SLIDE_Y }
    case 'zoomOut':
      return { ...NONE, opacity: raw, scale: t }
    default:
      return NONE
  }
}

/** Merge in + out animation state for a clip at the given time. */
export function clipAnim(
  animation: string | undefined,
  outAnimation: string | undefined,
  elapsed: number,
  remaining: number,
): AnimState {
  const inActive  = !!animation    && animation    !== 'none' && elapsed   < ANIM_DURATION
  const outActive = !!outAnimation && outAnimation !== 'none' && remaining < ANIM_DURATION

  if (!inActive && !outActive) return NONE

  // Both phases overlap only in very short clips; out wins.
  if (outActive && (remaining <= elapsed || !inActive)) return outAnim(outAnimation, remaining)
  if (inActive)  return inAnim(animation, elapsed)
  return NONE
}
