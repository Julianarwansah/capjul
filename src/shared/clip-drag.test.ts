import { describe, expect, it } from 'vitest'
import {
  MIN_CLIP_SECONDS, draggedStartTime, draggedStartTimeSnapped, trimChanges,
} from './clip-drag'
import type { Project } from './project-schema'

// 100 px/s keeps every pixel delta a clean number of hundredths of a second.
const PX = 100

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 30,
    width: 1920, height: 1080, fps: 30, backgroundColor: '#000',
    media: [], tracks: [],
    clips: [], textClips: [], stickerClips: [], audioClips: [],
    transitions: [], captions: [], markers: [],
    ...over,
  }
}

describe('draggedStartTime', () => {
  it('moves the clip later for a positive delta', () => {
    expect(draggedStartTime(2, 50, PX)).toBe(2.5)
  })

  it('moves the clip earlier for a negative delta', () => {
    // Regression: the delta used to be clamped at zero, so dragging a clip left
    // did nothing at all.
    expect(draggedStartTime(2, -50, PX)).toBe(1.5)
    expect(draggedStartTime(2, -200, PX)).toBe(0)
  })

  it('never lets a clip start before the timeline does', () => {
    expect(draggedStartTime(0.2, -50, PX)).toBe(0)
  })

  it('scales the delta by the current zoom', () => {
    // The same 100px drag is twice as much time when zoomed out.
    expect(draggedStartTime(5, 100, 100)).toBe(6)
    expect(draggedStartTime(5, 100, 50)).toBe(7)
  })
})

describe('draggedStartTimeSnapped', () => {
  const base = { clipStart: 2, pxPerSec: PX, playhead: 20 }

  it('snaps to a nearby clip edge', () => {
    const p = project({
      clips: [{
        id: 'other', mediaId: 'm', trackId: 't0', startTime: 3, duration: 1,
        mediaStart: 0, mediaEnd: 1, speed: 1, volume: 1, muted: false, reversed: false,
        opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
        brightness: 0, contrast: 0, saturation: 0, exposure: 0, highlights: 0,
        shadows: 0, temperature: 0, tint: 0, sharpness: 0,
        chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
        stabilize: false, effects: [], keyframes: [],
      }],
    })
    // Lands on 3.04, well inside the 8px threshold, so it snaps to 3.
    expect(draggedStartTimeSnapped({ ...base, dxPx: 104, project: p, snap: true })).toBe(3)
  })

  it('leaves the time alone when snapping is disabled', () => {
    const p = project()
    expect(draggedStartTimeSnapped({ ...base, dxPx: 104, project: p, snap: false })).toBeCloseTo(3.04)
  })

  it('snaps leftwards too, not just rightwards', () => {
    const p = project()
    // Dragging back to exactly the playhead-relative neighbourhood of zero.
    expect(draggedStartTimeSnapped({ ...base, dxPx: -195, project: p, snap: true })).toBe(0)
  })
})

describe('trimChanges', () => {
  const clip = { startTime: 2, duration: 5, mediaStart: 3 }

  describe('right edge', () => {
    it('grows the duration for a positive delta', () => {
      expect(trimChanges('right', clip, 100, PX)).toEqual({ duration: 6, mediaEnd: 9 })
    })

    it('shrinks the duration for a negative delta', () => {
      // Regression: a negative delta used to be discarded, so a clip could never
      // be trimmed shorter from its tail.
      expect(trimChanges('right', clip, -100, PX)).toEqual({ duration: 4, mediaEnd: 7 })
    })

    it('floors the duration rather than letting it invert', () => {
      expect(trimChanges('right', { ...clip, duration: 0.5 }, -100, PX).duration).toBe(MIN_CLIP_SECONDS)
    })

    it('leaves startTime and mediaStart alone', () => {
      const changes = trimChanges('right', clip, 100, PX)
      expect(changes).not.toHaveProperty('startTime')
      expect(changes).not.toHaveProperty('mediaStart')
    })
  })

  describe('left edge', () => {
    it('moves the start earlier and grows the duration for a negative delta', () => {
      // Regression: extending a clip's head by dragging leftwards did nothing.
      expect(trimChanges('left', clip, -100, PX)).toEqual({ startTime: 1, duration: 6, mediaStart: 2 })
    })

    it('moves the start later and shrinks the duration for a positive delta', () => {
      expect(trimChanges('left', clip, 100, PX)).toEqual({ startTime: 3, duration: 4, mediaStart: 4 })
    })

    it('floors mediaStart at zero, because a negative one is an invalid ffmpeg -ss', () => {
      const changes = trimChanges('left', { ...clip, mediaStart: 0.5 }, -100, PX)
      expect(changes.mediaStart).toBe(0)
    })

    it('floors startTime at zero', () => {
      expect(trimChanges('left', { ...clip, startTime: 0.2 }, -100, PX).startTime).toBe(0)
    })
  })

  describe('clips without a media window', () => {
    const overlay = { startTime: 2, duration: 5 }

    it('never writes media fields for text and sticker clips', () => {
      for (const changes of [trimChanges('left', overlay, -100, PX), trimChanges('right', overlay, -100, PX)]) {
        expect(changes).not.toHaveProperty('mediaStart')
        expect(changes).not.toHaveProperty('mediaEnd')
      }
    })

    it('still trims in both directions', () => {
      expect(trimChanges('left', overlay, -100, PX)).toEqual({ startTime: 1, duration: 6 })
      expect(trimChanges('right', overlay, -100, PX)).toEqual({ duration: 4 })
    })
  })
})
