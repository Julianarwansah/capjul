import { describe, expect, it } from 'vitest'
import { audioSpan, fadeGain } from './audio-fade'

describe('audioSpan', () => {
  it('is the source length at speed 1', () => {
    expect(audioSpan(0, 4, 1)).toBe(4)
  })

  it('halves under double tempo, which is the span the afade chain times against', () => {
    expect(audioSpan(0, 4, 2)).toBe(2)
  })

  it('measures from the trim point, not from zero', () => {
    expect(audioSpan(6, 10, 1)).toBe(4)
  })

  it('treats a degenerate speed of 0 as 1, matching the render plan', () => {
    expect(audioSpan(0, 4, 0)).toBe(4)
  })
})

describe('fadeGain', () => {
  it('is 1 everywhere with no fades', () => {
    for (const t of [-1, 0, 1, 2, 4, 5]) expect(fadeGain(0, 4, 0, 0, t)).toBe(1)
  })

  it('ramps in linearly over the fade-in', () => {
    expect(fadeGain(0, 4, 2, 0, 0)).toBe(0)
    expect(fadeGain(0, 4, 2, 0, 0.5)).toBe(0.25)
    expect(fadeGain(0, 4, 2, 0, 1)).toBe(0.5)
    expect(fadeGain(0, 4, 2, 0, 2)).toBe(1)
    expect(fadeGain(0, 4, 2, 0, 3)).toBe(1)
  })

  it('ramps out linearly over the fade-out', () => {
    expect(fadeGain(0, 4, 0, 2, 2)).toBe(1)
    expect(fadeGain(0, 4, 0, 2, 3)).toBe(0.5)
    expect(fadeGain(0, 4, 0, 2, 4)).toBe(0)
  })

  it('holds at zero outside the audible span', () => {
    expect(fadeGain(1, 4, 1, 1, 0.5)).toBe(0)
    expect(fadeGain(1, 4, 1, 1, 5.5)).toBe(0)
  })

  // afade in and afade out run in series, and series filters multiply. Where the
  // two ramps overlap the gain is therefore the product, not the lower of the
  // two - a clip faded over its whole length is at a quarter at the midpoint.
  it('multiplies the ramps where they overlap', () => {
    expect(fadeGain(0, 4, 4, 4, 2)).toBe(0.25)
    // in 0.25, out 0.75: the product, where min() would have said 0.25.
    expect(fadeGain(0, 4, 4, 4, 1)).toBe(0.1875)
  })

  it('times the ramps from the clip start, not from zero', () => {
    expect(fadeGain(10, 4, 2, 0, 11)).toBe(0.5)
    expect(fadeGain(10, 4, 2, 0, 9)).toBe(0)
  })

  it('shrinks the fade window with tempo, as the afade chain does', () => {
    // span 2 at speed 2: a 1s fade-out covers the second half of the clip.
    expect(fadeGain(0, audioSpan(0, 4, 2), 0, 1, 1)).toBe(1)
    expect(fadeGain(0, audioSpan(0, 4, 2), 0, 1, 1.5)).toBe(0.5)
    expect(fadeGain(0, audioSpan(0, 4, 2), 0, 1, 2)).toBe(0)
  })
})
