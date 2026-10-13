import { describe, expect, it } from 'vitest'
import { ANIM_DURATION, clipAnim, inAnim, outAnim } from './text-animation'

const IDENTITY = { opacity: 1, dx: 0, dy: 0, scale: 1 }

describe('clipAnim', () => {
  it('is identity outside both phase windows', () => {
    expect(clipAnim('fade', 'fade', 1, 1)).toEqual(IDENTITY)
  })

  it('is identity for unknown and "none" names', () => {
    expect(inAnim('nope', 0)).toEqual(IDENTITY)
    expect(inAnim('none', 0)).toEqual(IDENTITY)
  })

  it('ramps opacity across the in window', () => {
    expect(inAnim('fade', 0).opacity).toBe(0)
    expect(inAnim('fade', ANIM_DURATION / 2).opacity).toBeCloseTo(0.5)
    expect(inAnim('fade', ANIM_DURATION).opacity).toBe(1)
  })

  it('expresses slides as canvas-height fractions that settle to zero', () => {
    expect(inAnim('slideRight', 0).dx).toBeCloseTo(0.08)
    expect(inAnim('slideLeft', 0).dx).toBeCloseTo(-0.08)
    expect(inAnim('slideRight', ANIM_DURATION).dx).toBe(0)
  })

  it('zooms from 0.3 to 1 about the box centre', () => {
    expect(inAnim('zoomIn', 0).scale).toBeCloseTo(0.3)
    expect(inAnim('zoomIn', ANIM_DURATION).scale).toBeCloseTo(1)
  })

  it('out slides the opposite way to in for the same name', () => {
    expect(outAnim('slideUp', 0).dy).toBeCloseTo(0.06)
    expect(inAnim('slideUp', 0).dy).toBeCloseTo(-0.06)
  })

  it('lets out win when both phases overlap on a very short clip', () => {
    expect(clipAnim('fade', 'fade', 0.1, 0.05)).toEqual(outAnim('fade', 0.05))
  })
})
