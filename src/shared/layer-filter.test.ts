import { describe, expect, it } from 'vitest'
import { mediaLayerFilter } from './layer-filter'
import type { Clip } from './project-schema'

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 3, mediaStart: 0, mediaEnd: 3,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
    effects: [], keyframes: [],
    ...over,
  }
}

describe('mediaLayerFilter', () => {
  it('is empty for an untouched clip', () => {
    expect(mediaLayerFilter(clip())).toBe('')
  })

  it('carries the preset alone', () => {
    expect(mediaLayerFilter(clip({ filter: 'sepia(0.4)' }))).toBe('sepia(0.4)')
  })

  it('carries the numeric grading alone', () => {
    expect(mediaLayerFilter(clip({ brightness: 20 }))).toBe('brightness(1.2)')
  })

  it('carries a clip effect, which is what used to stop at the preview', () => {
    expect(mediaLayerFilter(clip({ effects: [{ id: 'blur', intensity: 0.5 }] })))
      .toBe('blur(5px)')
  })

  it('composes preset, grading and effects in the order both engines apply them', () => {
    expect(mediaLayerFilter(clip({
      filter: 'sepia(0.4)',
      brightness: 20,
      effects: [{ id: 'noir', intensity: 1 }],
    }))).toBe('sepia(0.4) brightness(1.2) grayscale(1) contrast(1.2)')
  })

  // Vignette, grain and letterbox produce no filter function; they are DOM
  // overlays in the preview and remain unexported (D23). Asserting they
  // contribute nothing here is what keeps that gap visible rather than silent.
  it('contributes nothing for the overlay-only effects', () => {
    expect(mediaLayerFilter(clip({
      effects: [
        { id: 'vignette', intensity: 1 },
        { id: 'grain', intensity: 1 },
        { id: 'letterbox', intensity: 1 },
      ],
    }))).toBe('')
  })

  it('ignores an effect id it does not know rather than emitting junk', () => {
    expect(mediaLayerFilter(clip({ effects: [{ id: 'nope', intensity: 1 }] }))).toBe('')
  })
})
