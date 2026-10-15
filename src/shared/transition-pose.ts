import { poseTransformCss, type SceneTransform } from './scene'

// Transition poses: what a blend does to each of its two clips at a given
// progress, expressed in canvas terms rather than in either engine's vocabulary.
//
// This module is the reason a transition can exist in both engines at once. The
// preview maps a pose to CSS and the compositor maps the same pose to canvas
// calls; neither keeps its own idea of what "wipe-left at 40%" means, which is
// the failure this codebase keeps having to fix elsewhere (D16, D18, D22).

/** Every transition type a pose exists for. The panel's picker offers these
 *  plus 'none', which creates no transition at all; an unknown type at load time
 *  falls back to a crossfade in transitionPose rather than throwing. */
export const TRANSITION_TYPES = [
  'fade', 'dissolve',
  'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
  'slide-left', 'slide-right',
  'zoom-in', 'zoom-out',
  'blur', 'flash',
] as const

export type TransitionType = typeof TRANSITION_TYPES[number]

export interface TransitionClipPose {
  /** Multiplied into the layer's own opacity. */
  alpha: number
  /** Translation in canvas fractions: dx of width, dy of height. */
  dx: number
  dy: number
  /** Uniform scale about the canvas centre. */
  scale: number
  /** Blur radius as a fraction of canvas width, so both engines scale it with
   *  resolution instead of disagreeing in pixels. */
  blur: number
  /** Inset clip as canvas fractions cut from each edge. */
  clip: { top: number; right: number; bottom: number; left: number }
}

export type TransitionPose = readonly [TransitionClipPose, TransitionClipPose]

function rest(): TransitionClipPose {
  return { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, clip: { top: 0, right: 0, bottom: 0, left: 0 } }
}

/** 16px on a 1280-wide canvas - the radius the preview used to hard-code - as a
 *  fraction, so a 4K export blurs proportionally rather than identically. */
export const TRANSITION_BLUR_FRACTION = 16 / 1280

/**
 * The poses of the outgoing and incoming clip at `progress` (0 = just started,
 * 1 = finished). Index 0 leaves, index 1 arrives.
 *
 * An unknown type falls back to a crossfade rather than throwing, so a project
 * carrying a type this build does not know still renders something sane - the
 * same promise the old preview-only styling made.
 */
export function transitionPose(type: string, progress: number): TransitionPose {
  const p = progress
  const a = rest()
  const b = rest()
  switch (type) {
    case 'wipe-left':
      a.clip.right = p
      b.clip.left = 1 - p
      break
    case 'wipe-right':
      a.clip.left = p
      b.clip.right = 1 - p
      break
    case 'wipe-up':
      a.clip.top = p
      b.clip.bottom = 1 - p
      break
    case 'wipe-down':
      a.clip.bottom = p
      b.clip.top = 1 - p
      break
    case 'slide-left':
      a.dx = -p
      b.dx = 1 - p
      break
    case 'slide-right':
      a.dx = p
      b.dx = -(1 - p)
      break
    case 'zoom-in':
      a.scale = 1 + p * 0.5
      a.alpha = 1 - p
      b.alpha = p
      break
    case 'zoom-out':
      a.alpha = 1 - p
      b.scale = 2 - p
      b.alpha = p
      break
    case 'blur':
      a.blur = TRANSITION_BLUR_FRACTION * p
      a.alpha = 1 - p * 0.5
      b.blur = TRANSITION_BLUR_FRACTION * (1 - p)
      b.alpha = p
      break
    case 'flash':
      a.alpha = p < 0.5 ? 1 - p * 2 : 0
      b.alpha = p > 0.5 ? (p - 0.5) * 2 : 0
      break
    // 'fade' and 'dissolve' are the same crossfade, and so is the fallback.
    default:
      a.alpha = 1 - p
      b.alpha = p
      break
  }
  return [a, b]
}

export function hasTransitionClip(pose: TransitionClipPose): boolean {
  const c = pose.clip
  return c.top !== 0 || c.right !== 0 || c.bottom !== 0 || c.left !== 0
}

/**
 * The canvas rect a wipe clips to, in canvas pixels, or null when the pose does
 * not clip. The counterpart of the `clipPath` inset poseToCss emits; the parity
 * test between the two lives in transition-pose.test.ts.
 */
export function poseClipRect(
  pose: TransitionClipPose,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!hasTransitionClip(pose)) return null
  const c = pose.clip
  return {
    x: c.left * W,
    y: c.top * H,
    w: W * (1 - c.left - c.right),
    h: H * (1 - c.top - c.bottom),
  }
}

/** The canvas blur radius in pixels for a canvas of width `W`. */
export function poseBlurPx(pose: TransitionClipPose, W: number): number {
  return pose.blur * W
}

/**
 * The preview's half of a pose: CSS for one media layer, composed with the
 * layer's own transform and filter rather than replacing them.
 *
 * The old preview styling replaced both - a clip mid-transition lost its
 * position, rotation and scale, and its grading - because the style object was
 * spread over the top of them. Composing is what lets a moved or graded clip
 * carry that through its own transition.
 */
export function poseToCss(
  pose: TransitionClipPose,
  tf: SceneTransform,
  filter: string,
): { opacity: number; transform: string; filter: string; clipPath?: string } {
  const outer = [`translate(${pose.dx * 100}%, ${pose.dy * 100}%)`]
  if (pose.scale !== 1) outer.push(`scale(${pose.scale})`)
  const composed = [...outer, poseTransformCss(tf)].join(' ')
  const blur = pose.blur > 0 ? `blur(${pose.blur * 100}cqw)` : ''
  return {
    opacity: tf.opacity * pose.alpha,
    transform: composed,
    filter: [filter, blur].filter(Boolean).join(' '),
    ...(hasTransitionClip(pose)
      ? {
          clipPath: `inset(${pose.clip.top * 100}% ${pose.clip.right * 100}% ${pose.clip.bottom * 100}% ${pose.clip.left * 100}%)`,
        }
      : {}),
  }
}
