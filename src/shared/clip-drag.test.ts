import { describe, expect, it } from 'vitest'
import {
  MIN_CLIP_SECONDS, captureMoveOrigins, draggedStartTime, draggedStartTimeSnapped,
  movedStartTimes, snappedTrimDxPx, trimChanges,
} from './clip-drag'
import type { Clip, Project } from './project-schema'

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

describe('snappedTrimDxPx', () => {
  // 8px at 100px/s: a raw edge within 0.08s of a target snaps to it.
  const clip = { id: 'c', startTime: 2, duration: 5, mediaStart: 3 }
  const opts = (over: Partial<Parameters<typeof snappedTrimDxPx>[0]> = {}) => ({
    side: 'right' as const,
    clip,
    dxPx: 45,
    pxPerSec: PX,
    project: project(),
    playhead: 20,
    snap: true,
    ...over,
  })

  it('passes the delta through untouched when snapping is off', () => {
    expect(snappedTrimDxPx(opts({ snap: false }))).toBe(45)
  })

  it('leaves the delta alone when no target is in range', () => {
    expect(snappedTrimDxPx(opts())).toBe(45)
  })

  it('snaps the right edge to a marker', () => {
    // Raw end 7.45, marker at 7.5: the corrected delta puts the edge exactly on
    // the marker, and trimChanges then derives duration and mediaEnd from it.
    const o = opts({ project: project({ markers: [{ id: 'k', time: 7.5 }] }) })
    expect(snappedTrimDxPx(o)).toBe(50)
  })

  it('snaps the right edge to the playhead', () => {
    expect(snappedTrimDxPx(opts({ playhead: 7.5 }))).toBe(50)
  })

  it('snaps the left edge', () => {
    const o = opts({
      side: 'left',
      project: project({ markers: [{ id: 'k', time: 2.5 }] }),
    })
    expect(snappedTrimDxPx(o)).toBe(50)
  })

  it('lets the left edge snap to zero', () => {
    const o = opts({
      side: 'left',
      dxPx: -195,
      project: project({ markers: [{ id: 'k', time: 0 }] }),
    })
    expect(snappedTrimDxPx(o)).toBe(-200)
  })

  // A trim must not snap to the other end of the clip being trimmed, or dragging
  // an edge near it would collapse the clip onto its own boundary.
  it('excludes the trimmed clip\'s own edges', () => {
    // Raw end 6.95 is within range of the clip's own end at 7; with the id
    // excluded there is nothing to snap to and the delta survives.
    expect(snappedTrimDxPx(opts({ dxPx: -5 }))).toBe(-5)
  })

  it('composes with trimChanges so the clamps still apply', () => {
    const dx = snappedTrimDxPx(opts({ project: project({ markers: [{ id: 'k', time: 7.5 }] }) }))
    expect(trimChanges('right', clip, dx, PX)).toEqual({ duration: 5.5, mediaEnd: 8.5 })
  })
})

describe('group move', () => {
  const track = (id: string, locked = false) =>
    ({ id, type: 'video' as const, label: id, muted: false, locked, height: 64 })
  const p = project({
    tracks: [track('t0'), track('t1'), track('locked', true)],
    clips: [
      { ...clipFixture('a', 't0', 1), },
      clipFixture('b', 't1', 5),
      clipFixture('c', 'locked', 3),
      clipFixture('d', 't0', 9),
    ],
  })
  const selection = { clips: ['a', 'b'], texts: [], stickers: [], audios: [] }
  const withLocked = { ...selection, clips: ['a', 'b', 'c'] }

  it('captures the start times at mousedown, not during the drag', () => {
    const origins = captureMoveOrigins(p, withLocked)
    expect([...origins.clips.entries()]).toEqual([['a', 1], ['b', 5], ['c', 3]])
  })

  it('ignores selected ids that are not in the project', () => {
    const origins = captureMoveOrigins(p, { ...selection, clips: ['a', 'ghost'] })
    expect([...origins.clips.keys()]).toEqual(['a'])
  })

  it('applies one delta to every captured clip', () => {
    const moved = movedStartTimes(p, captureMoveOrigins(p, selection), 2)
    expect([...moved.clips.entries()]).toEqual([['a', 3], ['b', 7]])
  })

  it('clamps each clip at zero on its own, without tearing the group', () => {
    // a is 1s in, so a 2s leftward drag stops it at 0 while b and c keep the
    // full delta: the group compresses rather than inverting or jumping.
    const moved = movedStartTimes(p, captureMoveOrigins(p, selection), -2)
    expect(moved.clips.get('a')).toBe(0)
    expect(moved.clips.get('b')).toBe(3)
  })

  it('leaves clips on locked tracks out of the result entirely', () => {
    const moved = movedStartTimes(p, captureMoveOrigins(p, withLocked), 2)
    expect(moved.clips.has('c')).toBe(false)
  })

  it('leaves unselected clips out of the result', () => {
    const moved = movedStartTimes(p, captureMoveOrigins(p, selection), 2)
    expect(moved.clips.has('d')).toBe(false)
  })

  it('keeps the whole selection out of the snap candidates', () => {
    // b starts at 5; dragging a (at 1) rightwards by ~4s must not snap to b's
    // edge, because b is moving with the group and its edge is not a target.
    const snapped = draggedStartTimeSnapped({
      clipStart: 1,
      dxPx: 395,
      pxPerSec: PX,
      project: p,
      playhead: 20,
      excludeIds: ['a', 'b', 'c'],
      snap: true,
    })
    expect(snapped).toBe(4.95)
    // With only the dragged clip excluded, b's edge at 5 is a live target and
    // 4.95 is within the 8px threshold, so it snaps.
    const snappedAlone = draggedStartTimeSnapped({
      clipStart: 1,
      dxPx: 395,
      pxPerSec: PX,
      project: p,
      playhead: 20,
      excludeIds: ['a'],
      snap: true,
    })
    expect(snappedAlone).toBe(5)
  })
})

function clipFixture(id: string, trackId: string, startTime: number): Clip {
  return {
    id, mediaId: 'm', trackId, startTime, duration: 2,
    mediaStart: 0, mediaEnd: 2,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false, effects: [], keyframes: [],
  }
}
