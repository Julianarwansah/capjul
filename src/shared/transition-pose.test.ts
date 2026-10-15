import { describe, expect, it } from 'vitest'
import {
  TRANSITION_BLUR_FRACTION, TRANSITION_TYPES, poseBlurPx, poseClipRect, poseToCss,
  transitionPose,
} from './transition-pose'
import type { SceneTransform } from './scene'

// 0.25 keeps every derived fraction an exact binary fraction, so the string
// assertions below do not depend on float formatting.
const P = 0.25

const identity: SceneTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }

describe('transitionPose', () => {
  it('returns a pose pair for every type it claims to support', () => {
    for (const type of TRANSITION_TYPES) {
      const pair = transitionPose(type, P)
      expect(pair).toHaveLength(2)
      for (const pose of pair) {
        expect(pose.alpha).toBeGreaterThanOrEqual(0)
        expect(pose.alpha).toBeLessThanOrEqual(1)
      }
    }
  })

  it('crossfades so the two alphas always sum to one', () => {
    for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const [a, b] = transitionPose('fade', progress)
      expect(a.alpha + b.alpha).toBeCloseTo(1)
    }
  })

  it('treats dissolve as the same crossfade as fade', () => {
    expect(transitionPose('dissolve', P)).toEqual(transitionPose('fade', P))
  })

  it('starts with the outgoing clip whole and ends with the incoming one', () => {
    const [a0, b0] = transitionPose('fade', 0)
    expect(a0.alpha).toBe(1)
    expect(b0.alpha).toBe(0)
    const [a1, b1] = transitionPose('fade', 1)
    expect(a1.alpha).toBe(0)
    expect(b1.alpha).toBe(1)
  })

  it('is a no-op pose pair nowhere: at progress 0 the incoming clip contributes nothing', () => {
    const [, b0] = transitionPose('wipe-left', 0)
    // Fully clipped away rather than merely transparent, so it cannot catch
    // pointer or paint attention at the start of the blend.
    expect(b0.clip.left).toBe(1)
  })

  it('falls back to a crossfade for a type it does not know', () => {
    // A project saved by a newer build must still render rather than throw.
    expect(transitionPose('sparkle', P)).toEqual(transitionPose('fade', P))
  })

  it('wipes with complementary insets that always cover the frame exactly once', () => {
    for (const progress of [0, 0.25, 0.6, 1]) {
      const [a, b] = transitionPose('wipe-left', progress)
      expect(a.clip.right + b.clip.left).toBeCloseTo(1)
    }
  })

  it('mirrors each wipe direction against its opposite', () => {
    // wipe-left and wipe-right must inset opposite edges, or the two clips
    // would uncover the same side and leave a gap.
    expect(transitionPose('wipe-left', P)[0].clip).toEqual({ top: 0, right: P, bottom: 0, left: 0 })
    expect(translationOf('wipe-right', P)).toEqual({ dx: 0, dy: 0 })
    expect(transitionPose('wipe-right', P)[0].clip).toEqual({ top: 0, right: 0, bottom: 0, left: P })
    expect(transitionPose('wipe-up', P)[0].clip).toEqual({ top: P, right: 0, bottom: 0, left: 0 })
    expect(transitionPose('wipe-down', P)[0].clip).toEqual({ top: 0, right: 0, bottom: P, left: 0 })
  })

  it('slides the two clips in opposite directions by complementary distances', () => {
    const [a, b] = transitionPose('slide-left', P)
    expect(a.dx).toBe(-P)
    expect(b.dx).toBe(1 - P)
    // The pair always spans exactly one canvas width of offset, so no gap opens
    // between them mid-slide.
    expect(b.dx - a.dx).toBeCloseTo(1)

    const [ar, br] = transitionPose('slide-right', P)
    expect(ar.dx).toBe(P)
    expect(br.dx).toBe(-(1 - P))
    expect(ar.dx - br.dx).toBeCloseTo(1)
  })

  it('scales the outgoing clip up while zooming in and the incoming down while zooming out', () => {
    expect(transitionPose('zoom-in', P)[0].scale).toBe(1.125)
    expect(transitionPose('zoom-in', P)[0].alpha).toBe(0.75)
    expect(transitionPose('zoom-out', P)[1].scale).toBe(1.75)
    expect(transitionPose('zoom-out', P)[1].alpha).toBe(0.25)
  })

  it('blurs both sides as a fraction of canvas width, the incoming one more at the start', () => {
    const [a, b] = transitionPose('blur', P)
    expect(a.blur).toBeCloseTo(TRANSITION_BLUR_FRACTION * P, 12)
    expect(b.blur).toBeCloseTo(TRANSITION_BLUR_FRACTION * (1 - P), 12)
    // Blur only dims the outgoing clip halfway, unlike a plain crossfade.
    expect(a.alpha).toBeCloseTo(0.875)
    expect(b.alpha).toBeCloseTo(0.25)
  })

  it('blanks both clips at the midpoint of a flash', () => {
    // The one transition where the alphas deliberately do not sum to one:
    // a flash dips to nothing and comes back.
    const [a, b] = transitionPose('flash', 0.5)
    expect(a.alpha).toBe(0)
    expect(b.alpha).toBe(0)

    expect(transitionPose('flash', P)[0].alpha).toBeCloseTo(0.5)
    expect(transitionPose('flash', P)[1].alpha).toBe(0)
    expect(transitionPose('flash', 0.75)[0].alpha).toBe(0)
    expect(transitionPose('flash', 0.75)[1].alpha).toBeCloseTo(0.5)
  })
})

function translationOf(type: string, progress: number) {
  const [a] = transitionPose(type, progress)
  return { dx: a.dx, dy: a.dy }
}

describe('poseToCss', () => {
  it('multiplies the pose alpha into the layer opacity instead of replacing it', () => {
    const [a] = transitionPose('fade', 0.5)
    const css = poseToCss(a, { ...identity, opacity: 0.6 }, '')
    expect(css.opacity).toBeCloseTo(0.3)
  })

  it('composes the transition transform outside the layer pose, in canvas order', () => {
    const [a] = transitionPose('slide-left', 0.5)
    const css = poseToCss(a, { ...identity, x: 0.1, rotation: 90 }, '')
    // translate, then the layer's own translate/rotate/scale - the same order the
    // compositor applies them to the context.
    expect(css.transform).toBe('translate(-50%, 0%) translate(10%, 0%) rotate(90deg) scale(1, 1)')
  })

  it('emits the clip as an inset in the same fractions the canvas clips with', () => {
    const [a] = transitionPose('wipe-left', P)
    expect(poseToCss(a, identity, '').clipPath).toBe('inset(0% 25% 0% 0%)')
  })

  it('omits clip-path entirely when nothing is clipped', () => {
    expect(poseToCss(transitionPose('fade', P)[0], identity, '')).not.toHaveProperty('clipPath')
  })

  it('expresses blur in container-width units so it tracks the rendered canvas', () => {
    const [a] = transitionPose('blur', 1)
    expect(poseToCss(a, identity, 'brightness(1.2)').filter)
      .toBe(`brightness(1.2) blur(${TRANSITION_BLUR_FRACTION * 100}cqw)`)
  })

  it('leaves an identity pose visually inert', () => {
    const css = poseToCss(transitionPose('fade', 0)[0], identity, 'sepia(0.4)')
    expect(css.opacity).toBe(1)
    expect(css.transform).toBe('translate(0%, 0%) translate(0%, 0%) rotate(0deg) scale(1, 1)')
    expect(css.filter).toBe('sepia(0.4)')
    expect(css).not.toHaveProperty('clipPath')
  })
})

// The two mappings are separate code reading the same pose, which is exactly the
// shape of divergence this codebase keeps hitting (D18). This walks every type at
// five progress values and asserts the CSS string and the canvas geometry describe
// the same rectangle, the same blur radius and the same translation.
describe('the CSS and canvas mappings agree', () => {
  const W = 1280
  const H = 720

  it('for every type at several progress values', () => {
    for (const type of TRANSITION_TYPES) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        for (const pose of transitionPose(type, p)) {
          const where = `${type}@${p}`
          const css = poseToCss(pose, identity, '')
          const rect = poseClipRect(pose, W, H)

          const inset = /inset\(([-\d.]+)% ([-\d.]+)% ([-\d.]+)% ([-\d.]+)%\)/.exec(css.clipPath ?? '')
          if (inset) {
            const [top, right, bottom, left] = inset.slice(1).map(Number)
            expect(rect, where).not.toBeNull()
            expect(top / 100 * H, where).toBeCloseTo(rect!.y, 6)
            expect(right / 100 * W, where).toBeCloseTo(W - rect!.x - rect!.w, 6)
            expect(bottom / 100 * H, where).toBeCloseTo(H - rect!.y - rect!.h, 6)
            expect(left / 100 * W, where).toBeCloseTo(rect!.x, 6)
          } else {
            expect(rect, where).toBeNull()
          }

          const blurCss = /blur\(([-\d.]+)cqw\)/.exec(css.filter)
          if (blurCss) {
            expect(parseFloat(blurCss[1]) / 100 * W, where).toBeCloseTo(poseBlurPx(pose, W), 6)
          } else {
            expect(poseBlurPx(pose, W), where).toBe(0)
          }

          const tm = /^translate\(([-\d.]+)%, ([-\d.]+)%\)/.exec(css.transform)
          expect(tm, where).not.toBeNull()
          expect(parseFloat(tm![1]) / 100, where).toBeCloseTo(pose.dx, 6)
          expect(parseFloat(tm![2]) / 100, where).toBeCloseTo(pose.dy, 6)

          expect(css.opacity, where).toBeCloseTo(pose.alpha, 6)
        }
      }
    }
  })
})
