import { describe, expect, it } from 'vitest'
import { formatTimecode, frameIndexAt, stepFrames } from './frame-time'

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

describe('formatTimecode', () => {
  it('renders minutes, seconds and frames', () => {
    expect(formatTimecode(0, 30)).toBe('0:00:00')
    expect(formatTimecode(1, 30)).toBe('0:01:00')
    expect(formatTimecode(2.5, 30)).toBe('0:02:15')
    expect(formatTimecode(61, 30)).toBe('1:01:00')
  })

  // Two markers inside one second have to be distinguishable, which is the whole
  // reason the frame field exists.
  it('tells two times inside the same second apart', () => {
    expect(formatTimecode(1, 30)).not.toBe(formatTimecode(1 + 1 / 30, 30))
    expect(formatTimecode(1 + 1 / 30, 30)).toBe('0:01:01')
  })

  it('reads a drifted second as the second it is on, not the one below', () => {
    // The accumulation stepFrames exists to prevent, arriving from somewhere
    // else: 1.11e-16 short of a second must not display as frame 29.
    expect(formatTimecode(0.9999999999999999, 30)).toBe('0:01:00')
  })

  it('never lets the frame field reach the frame rate', () => {
    // Swept rather than spot-checked: picking times by hand is how a value like
    // 59/60 ends up in a test, and at 30fps that is frame 29.5, which rounds to
    // the next second rather than staying inside this one.
    for (const fps of [24, 25, 30, 60]) {
      for (let frame = 0; frame < fps * 3; frame++) {
        const fields = formatTimecode(frame / fps, fps).split(':').map(Number)
        expect(fields[2], `fps ${fps} frame ${frame}`).toBe(frame % fps)
        expect(fields[2], `fps ${fps} frame ${frame}`).toBeLessThan(fps)
      }
    }
  })

  it('rounds the frame field for a non-integer frame rate', () => {
    // 2400 frames at 23.976fps, the same value frameIndexAt is tested against.
    expect(formatTimecode(2400 / 23.976, 23.976)).toBe('1:40:00')
  })

  it('degrades to whole seconds for a nonsensical frame rate', () => {
    expect(formatTimecode(4, 0)).toBe('0:00:00')
  })
})
