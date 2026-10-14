import { describe, expect, it } from 'vitest'
import { canSplitAt, splitClipAt, splitKeyframes } from './clip-split'
import { interpolate } from './keyframe-interpolate'
import type { Keyframe } from './project-schema'

function kf(property: string, time: number, value: number, id = `${property}-${time}`): Keyframe {
  return { id, property, time, value }
}

/** A clip kind with no media window, like text or a sticker. */
const overlay = (over: Partial<{ id: string; startTime: number; duration: number; keyframes: Keyframe[] }> = {}) => ({
  id: 'overlay-1', startTime: 0, duration: 10, keyframes: [], ...over,
})

/** A clip kind that addresses a window of a source file, like video or audio. */
const windowed = (over: Partial<ReturnType<typeof overlay> & {
  mediaStart: number; mediaEnd: number; speed: number
}> = {}) => ({
  id: 'clip-1', startTime: 0, duration: 10, keyframes: [],
  mediaStart: 4, mediaEnd: 24, speed: 2, ...over,
})

describe('canSplitAt', () => {
  it('is false on both edges, where a cut would leave an empty half', () => {
    const c = overlay({ startTime: 2, duration: 6 })
    expect(canSplitAt(c, 2)).toBe(false)
    expect(canSplitAt(c, 8)).toBe(false)
  })

  it('is false outside the clip', () => {
    const c = overlay({ startTime: 2, duration: 6 })
    expect(canSplitAt(c, 0)).toBe(false)
    expect(canSplitAt(c, 20)).toBe(false)
  })

  it('is true strictly inside the clip', () => {
    expect(canSplitAt(overlay({ startTime: 2, duration: 6 }), 5)).toBe(true)
  })
})

describe('splitClipAt', () => {
  it('returns null when the time cannot produce two non-empty halves', () => {
    expect(splitClipAt(overlay({ startTime: 0, duration: 10 }), 0)).toBeNull()
    expect(splitClipAt(overlay({ startTime: 0, duration: 10 }), 10)).toBeNull()
    expect(splitClipAt(overlay({ startTime: 0, duration: 10 }), 11)).toBeNull()
  })

  it('gives each half a fresh id and complementary timing', () => {
    const [first, second] = splitClipAt(overlay({ id: 'orig', startTime: 2, duration: 10 }), 6)!
    expect(first.id).not.toBe('orig')
    expect(second.id).not.toBe('orig')
    expect(first.id).not.toBe(second.id)

    expect(first).toMatchObject({ startTime: 2, duration: 4 })
    expect(second).toMatchObject({ startTime: 6, duration: 6 })
  })

  it('cuts the media window at the same point, honouring speed', () => {
    // Source runs at 2x, so 3s of timeline consumes 6s of source.
    const [first, second] = splitClipAt(windowed({ startTime: 0, duration: 10, mediaStart: 4, mediaEnd: 24, speed: 2 }), 3)!
    expect(first).toMatchObject({ mediaStart: 4, mediaEnd: 10 })
    expect(second).toMatchObject({ mediaStart: 10, mediaEnd: 24 })
  })

  it('leaves clips with no media window untouched apart from timing', () => {
    const [first] = splitClipAt(overlay({ startTime: 0, duration: 10 }), 5)!
    expect('mediaStart' in first).toBe(false)
    expect('mediaEnd' in first).toBe(false)
  })
})

describe('splitKeyframes', () => {
  it('gives each half only its own points, plus one at the cut', () => {
    const [first, second] = splitKeyframes([kf('x', 0, 0), kf('x', 9, 90)], 5)

    // The point at 9 belongs to the tail half and the point at 0 to the head
    // half; leaking either would make that half animate toward a pose it should
    // never reach. Both also carry the synthesized cut point.
    expect(first.map(k => k.time).sort((a, b) => a - b)).toEqual([0, 5])
    expect(second.map(k => k.time).sort((a, b) => a - b)).toEqual([5, 9])
  })

  it('inserts a point at the cut so motion stays continuous', () => {
    const keyframes = [kf('x', 0, 0), kf('x', 10, 100)]
    const [first, second] = splitKeyframes(keyframes, 5)

    // Without the synthesized point the first half would interpolate toward a
    // keyframe it no longer contains and play the wrong half of the move.
    expect(interpolate(first, 'x', 2.5, -1)).toBe(25)
    expect(interpolate(second, 'x', 7.5, -1)).toBe(75)
  })

  it('holds the last pose in the half that has no keyframes of its own', () => {
    const [first, second] = splitKeyframes([kf('opacity', 0, 0), kf('opacity', 2, 0.8)], 5)

    expect(interpolate(first, 'opacity', 4, -1)).toBe(0.8)
    // The tail half has only the synthesized cut point, so it stays at the pose
    // the first half ended on instead of snapping back to the clip's base value.
    expect(second.map(k => k.time)).toEqual([5])
    expect(interpolate(second, 'opacity', 9, -1)).toBe(0.8)
  })

  it('puts a keyframe exactly on the cut in both halves', () => {
    const [first, second] = splitKeyframes([kf('x', 5, 50)], 5)
    expect(first.map(k => k.time)).toEqual([5])
    expect(second.map(k => k.time)).toEqual([5])
  })

  it('does not add a second point when one already sits on the cut', () => {
    const [first] = splitKeyframes([kf('x', 0, 0), kf('x', 5, 50), kf('x', 10, 100)], 5)
    expect(first.filter(k => k.time === 5)).toHaveLength(1)
  })

  it('treats each property independently', () => {
    const [first, second] = splitKeyframes([
      kf('x', 0, 0), kf('x', 10, 100),
      kf('rotation', 0, 0), kf('rotation', 4, 90),
    ], 5)

    expect(first.filter(k => k.property === 'x').map(k => k.time)).toEqual([0, 5])
    expect(first.filter(k => k.property === 'rotation').map(k => k.time)).toEqual([0, 4, 5])
    expect(second.filter(k => k.property === 'rotation').map(k => k.time)).toEqual([5])
  })

  it('gives the second half fresh keyframe ids so no id is shared', () => {
    const keyframes = [kf('x', 0, 0), kf('x', 10, 100)]
    const [first, second] = splitKeyframes(keyframes, 5)
    const firstIds = new Set(first.map(k => k.id))
    expect(second.every(k => !firstIds.has(k.id))).toBe(true)
  })

  it('returns two empty lists for a clip with no keyframes', () => {
    expect(splitKeyframes([], 5)).toEqual([[], []])
  })

  it('preserves keyframes through a clip split', () => {
    const [first, second] = splitClipAt(
      overlay({ startTime: 0, duration: 10, keyframes: [kf('x', 0, 0), kf('x', 10, 100)] }),
      5,
    )!
    expect(interpolate(first.keyframes, 'x', 2.5, -1)).toBe(25)
    expect(interpolate(second.keyframes, 'x', 7.5, -1)).toBe(75)
  })
})
