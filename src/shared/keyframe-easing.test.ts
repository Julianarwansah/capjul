import { describe, expect, it } from 'vitest'
import { EASINGS, ease, easeFfmpeg } from './keyframe-easing'
import { evalFfmpegExpression } from './ffmpeg-expr'
import { interpolate } from './keyframe-interpolate'
import type { Keyframe } from './project-schema'

// Sampling grid shared by the curve-shape and cross-backend tests.
const US = Array.from({ length: 101 }, (_, i) => i / 100)

describe('ease', () => {
  it('starts every curve at 0 and ends it at 1', () => {
    for (const easing of EASINGS) {
      expect(ease(easing, 0)).toBeCloseTo(0, 12)
      expect(ease(easing, 1)).toBeCloseTo(1, 12)
    }
  })

  it('is the identity for linear', () => {
    for (const u of US) expect(ease('linear', u)).toBeCloseTo(u, 12)
  })

  it('lags behind linear in the middle for ease-in', () => {
    expect(ease('ease-in', 0.5)).toBeLessThan(0.5)
  })

  it('leads linear in the middle for ease-out', () => {
    expect(ease('ease-out', 0.5)).toBeGreaterThan(0.5)
  })

  it('passes through the midpoint for ease-in-out, which is symmetric', () => {
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5, 12)
    // Symmetry: the curve at u and at 1-u are equally far from the diagonal.
    for (const u of [0.1, 0.25, 0.4]) {
      expect(ease('ease-in-out', u) + ease('ease-in-out', 1 - u)).toBeCloseTo(1, 12)
    }
  })

  it('never runs backwards or overshoots', () => {
    for (const easing of EASINGS) {
      let previous = -Infinity
      for (const u of US) {
        const v = ease(easing, u)
        expect(v).toBeGreaterThanOrEqual(previous)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        previous = v
      }
    }
  })

  it('gives the three curved easings genuinely different shapes', () => {
    // Guards against a copy-paste that made two curves identical.
    const at = (e: typeof EASINGS[number]) => ease(e, 0.3)
    expect(at('ease-in')).not.toBeCloseTo(at('ease-out'), 6)
    expect(at('ease-in')).not.toBeCloseTo(at('ease-in-out'), 6)
    expect(at('ease-out')).not.toBeCloseTo(at('ease-in-out'), 6)
  })
})

describe('easeFfmpeg', () => {
  it('leaves linear as the bare expression, so pre-v4 output is unchanged', () => {
    expect(easeFfmpeg('linear', '(t-1)/2')).toBe('(t-1)/2')
  })

  it('evaluates to the same curve as ease() for every easing', () => {
    // This is the actual parity guarantee: the string handed to ffmpeg and the
    // arithmetic the preview runs must describe one curve, not two that were
    // meant to match.
    for (const easing of EASINGS) {
      const expression = easeFfmpeg(easing, 'u')
      for (const u of US) {
        const fromFfmpeg = evalFfmpegExpression(expression, { u })
        expect(fromFfmpeg).toBeCloseTo(ease(easing, u), 9)
      }
    }
  })

  it('survives being substituted with a real expression rather than a variable', () => {
    // render-plan substitutes `(t-a)/(b-a)`, so the emitted text has to stay
    // correctly parenthesised under ffmpeg's precedence.
    const easing = 'ease-in-out'
    const a = 1, b = 4
    const expression = easeFfmpeg(easing, `(t-${a})/(${b}-${a})`)
    for (const t of [1, 1.75, 2.5, 3.25, 4]) {
      const u = (t - a) / (b - a)
      expect(evalFfmpegExpression(expression, { t })).toBeCloseTo(ease(easing, u), 9)
    }
  })
})

describe('interpolate and easing ownership', () => {
  it('takes the curve from the keyframe that starts the segment', () => {
    // The convention: a keyframe owns the shape of the interval leaving it, so
    // adding a keyframe cannot silently change the segment before it.
    const kfs: Keyframe[] = [
      { id: 'a', time: 0, property: 'x', value: 0, easing: 'ease-in' },
      { id: 'b', time: 2, property: 'x', value: 1, easing: 'ease-out' },
    ]
    expect(interpolate(kfs, 'x', 1, 0)).toBeCloseTo(ease('ease-in', 0.5), 12)
    expect(interpolate(kfs, 'x', 1, 0)).toBeLessThan(0.5)
  })

  it('ignores the easing of the final keyframe, which starts no segment', () => {
    const kfs: Keyframe[] = [
      { id: 'a', time: 0, property: 'x', value: 0, easing: 'linear' },
      { id: 'b', time: 2, property: 'x', value: 1, easing: 'ease-in-out' },
    ]
    expect(interpolate(kfs, 'x', 1, 0)).toBeCloseTo(0.5, 12)
  })

  it('holds the last value past the end rather than extrapolating the curve', () => {
    const kfs: Keyframe[] = [
      { id: 'a', time: 0, property: 'x', value: 0, easing: 'ease-in-out' },
      { id: 'b', time: 2, property: 'x', value: 1, easing: 'ease-in-out' },
    ]
    expect(interpolate(kfs, 'x', 5, 0)).toBe(1)
    expect(interpolate(kfs, 'x', -3, 0)).toBe(0)
  })
})
