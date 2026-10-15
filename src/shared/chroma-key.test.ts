import { describe, expect, it } from 'vitest'
import {
  MAX_RGB_DISTANCE, applyChromaKey, chromaAlphaFactor, parseChromaColor,
} from './chroma-key'

const GREEN: [number, number, number] = [0, 255, 0]

describe('parseChromaColor', () => {
  it('reads hex with or without the hash', () => {
    expect(parseChromaColor('#00ff00')).toEqual([0, 255, 0])
    expect(parseChromaColor('ff0080')).toEqual([255, 0, 128])
  })
})

describe('chromaAlphaFactor', () => {
  it('vanishes at the keyed colour and survives far from it', () => {
    expect(chromaAlphaFactor(0, 255, 0, GREEN, 0.3)).toBe(0)
    expect(chromaAlphaFactor(255, 0, 0, GREEN, 0.3)).toBe(1)
  })

  it('fades with distance instead of cutting, so edges do not alias', () => {
    // Half of the tolerance radius keeps half the alpha.
    const half = MAX_RGB_DISTANCE * 0.3 / 2
    expect(chromaAlphaFactor(0, 255 - half, 0, GREEN, 0.3)).toBeCloseTo(0.5, 12)
  })

  it('keys nothing at zero tolerance', () => {
    expect(chromaAlphaFactor(0, 255, 0, GREEN, 0)).toBe(1)
  })

  // 441 is slightly below the true maximum RGB distance of sqrt(3 * 255^2), so
  // even tolerance 1 leaves the farthest colour pair unkeyed. That is the
  // behaviour the preview has always had; pinning it keeps a "tidy" correction
  // from silently widening every existing key.
  it('leaves the farthest colour pair unkeyed even at tolerance 1', () => {
    expect(chromaAlphaFactor(255, 255, 255, [0, 0, 0], 1)).toBe(1)
  })
})

describe('applyChromaKey', () => {
  const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)

  it('drops keyed pixels and keeps the rest', () => {
    const data = px(0, 255, 0, 255, 200, 30, 40, 255)
    applyChromaKey(data, GREEN, 0.3)
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(255)
  })

  it('multiplies the existing alpha rather than replacing it', () => {
    // A source that already carries transparency keeps it. Replacing would give
    // round(factor * 255); multiplying gives round(factor * 100), and the two
    // differ enough to tell apart.
    const data = px(0, 128, 0, 100)
    const factor = chromaAlphaFactor(0, 128, 0, GREEN, 1)
    expect(factor).toBeLessThan(1)
    applyChromaKey(data, GREEN, 1)
    expect(data[3]).toBe(Math.round(100 * factor))
    expect(data[3]).not.toBe(Math.round(255 * factor))
  })

  it('matches the preview\'s old assignment for opaque frames', () => {
    // The hook used to write round(dist / maxDist * 255) outright. For an opaque
    // source, multiplying by that same factor is the same number, which is what
    // keeps existing previews looking identical after the extraction.
    const dist = MAX_RGB_DISTANCE * 0.3 * 0.25
    const data = px(0, 255 - dist, 0, 255)
    applyChromaKey(data, GREEN, 0.3)
    expect(data[3]).toBe(Math.round(0.25 * 255))
  })

  it('leaves rgb untouched, only alpha moves', () => {
    const data = px(10, 200, 10, 255)
    applyChromaKey(data, GREEN, 0.5)
    expect([data[0], data[1], data[2]]).toEqual([10, 200, 10])
  })
})
