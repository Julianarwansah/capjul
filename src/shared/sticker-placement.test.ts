import { describe, expect, it } from 'vitest'
import { stickerPlacement } from './text-rasterizer'
import { STICKER_BASE_RATIO, isKnownSticker, stickerLabel } from './sticker-assets'
import type { StickerClip } from './project-schema'

function clip(over: Partial<StickerClip> = {}): StickerClip {
  return {
    id: 's1', trackId: 'st', startTime: 0, duration: 3, src: 'star',
    x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    ...over,
  }
}

describe('stickerPlacement', () => {
  it('sizes from a fixed fraction of canvas height', () => {
    const p = stickerPlacement(clip(), 1280, 720)
    expect(p.h).toBeCloseTo(720 * STICKER_BASE_RATIO)
    expect(p.w).toBeCloseTo(720 * STICKER_BASE_RATIO)
  })

  it('applies clip scale to the base size', () => {
    const p = stickerPlacement(clip({ scaleX: 2, scaleY: 0.5 }), 1280, 720)
    expect(p.w).toBeCloseTo(720 * STICKER_BASE_RATIO * 2)
    expect(p.h).toBeCloseTo(720 * STICKER_BASE_RATIO * 0.5)
  })

  it('centres on (x, y) as canvas fractions', () => {
    const p = stickerPlacement(clip({ x: 0.25, y: 0.75 }), 1280, 720)
    expect(p.cx).toBe(320)
    expect(p.cy).toBe(540)
  })

  it('passes rotation through in degrees', () => {
    expect(stickerPlacement(clip({ rotation: 45 }), 1280, 720).rotationDeg).toBe(45)
  })
})

describe('sticker registry', () => {
  it('knows bundled assets and rejects legacy emoji sources', () => {
    expect(isKnownSticker('star')).toBe(true)
    expect(isKnownSticker('arrow-up')).toBe(true)
    expect(isKnownSticker('⭐')).toBe(false)
    expect(isKnownSticker('')).toBe(false)
  })

  it('falls back to the raw source as a label', () => {
    expect(stickerLabel('heart')).toBe('Heart')
    expect(stickerLabel('mystery')).toBe('mystery')
  })
})
