import { describe, expect, it } from 'vitest'
import { frameIndexAt, stepFrames } from './frame-time'

describe('stepFrames', () => {
  it('returns to an exact second after a whole second of frame steps', () => {
    // The drift this exists to prevent: thirty naive additions of 1/30 land on
    // 0.9999999999999999, which a truncating timecode renders as "0:00".
    let t = 0
    for (let i = 0; i < 30; i++) t = stepFrames(t, 30, 1)
    expect(t).toBe(1)
  })

  it('stays on the frame grid over many steps, in both directions', () => {
    let t = 0
    for (let i = 0; i < 3000; i++) t = stepFrames(t, 30, 1)
    expect(t).toBe(100)
    for (let i = 0; i < 3000; i++) t = stepFrames(t, 30, -1)
    expect(t).toBe(0)
  })

  it('steps backwards with a negative frame count', () => {
    expect(stepFrames(2, 30, -1)).toBeCloseTo(2 - 1 / 30, 12)
  })

  it('moves a whole number of frames for a shift-step of five seconds', () => {
    expect(stepFrames(0, 30, 150)).toBe(5)
    expect(stepFrames(10, 25, -125)).toBe(5)
  })

  it('snaps an off-grid time onto the grid, so a click-seek then a step is exact', () => {
    // 1.23456 at 30fps is frame 37.0368; stepping forward from it should land on
    // frame 38 rather than carrying the fraction along forever.
    expect(stepFrames(1.23456, 30, 1)).toBeCloseTo(38 / 30, 12)
    expect(frameIndexAt(1.23456, 30)).toBe(37)
  })

  it('works at frame rates that are not exact in binary', () => {
    // 23.976 is where naive accumulation drifts worst. The invariant is the
    // frame index, not a round number of seconds: 2400 frames at 23.976 is
    // 100.1s, not 100s.
    let t = 0
    for (let i = 0; i < 2400; i++) t = stepFrames(t, 23.976, 1)
    expect(frameIndexAt(t, 23.976)).toBe(2400)
    expect(t).toBeCloseTo(2400 / 23.976, 12)
  })

  it('leaves the time alone for a nonsensical frame rate', () => {
    expect(stepFrames(4, 0, 1)).toBe(4)
    expect(stepFrames(4, -30, 1)).toBe(4)
    expect(frameIndexAt(4, 0)).toBe(0)
  })
})
