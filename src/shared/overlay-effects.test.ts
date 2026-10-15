import { describe, expect, it } from 'vitest'
import { VIGNETTE_RADIUS_FRACTIONS, letterboxFraction, vignetteStops } from './overlay-effects'

describe('letterboxFraction', () => {
  it('is 12% of the canvas height per bar at full intensity', () => {
    expect(letterboxFraction(1)).toBeCloseTo(0.12, 12)
    expect(letterboxFraction(0.5)).toBeCloseTo(0.06, 12)
  })

  it('vanishes at zero intensity', () => {
    expect(letterboxFraction(0)).toBe(0)
  })
})

describe('vignetteStops', () => {
  it('widens the transparent centre as intensity falls', () => {
    expect(vignetteStops(1).inner).toBeCloseTo(0.3, 12)
    expect(vignetteStops(0.5).inner).toBeCloseTo(0.5, 12)
    expect(vignetteStops(0).inner).toBeCloseTo(0.7, 12)
  })

  it('dims the rim with intensity', () => {
    expect(vignetteStops(1).rim).toBe('rgba(0,0,0,0.85)')
    expect(vignetteStops(0).rim).toBe('rgba(0,0,0,0)')
  })
})

describe('VIGNETTE_RADIUS_FRACTIONS', () => {
  it('is the CSS farthest-corner ellipse for a centred box', () => {
    // The centred ellipse whose axis ratio matches the box and which passes
    // through its corner: sqrt(2)/2 of each axis. Both engines state it from
    // here, so neither can drift into its own idea of the shape.
    const { rx, ry } = VIGNETTE_RADIUS_FRACTIONS
    expect(rx).toBeCloseTo(Math.SQRT2 / 2, 12)
    expect(ry).toBeCloseTo(Math.SQRT2 / 2, 12)
    // And it really passes through the corner of a unit half-box.
    expect(Math.pow(0.5 / rx, 2) + Math.pow(0.5 / ry, 2)).toBeCloseTo(1, 12)
  })
})
