import { describe, expect, it } from 'vitest'
import { nextPlaybackTime, validLoop, type LoopWindow } from './playback-loop'

const off: LoopWindow = { in: null, out: null, enabled: false }
const on = (inPoint: number, outPoint: number): LoopWindow =>
  ({ in: inPoint, out: outPoint, enabled: true })

describe('validLoop', () => {
  it('rejects a disabled loop with points set', () => {
    expect(validLoop({ in: 1, out: 3, enabled: false })).toBeNull()
  })

  it('rejects missing points', () => {
    expect(validLoop({ in: 1, out: null, enabled: true })).toBeNull()
    expect(validLoop({ in: null, out: 3, enabled: true })).toBeNull()
  })

  it('rejects an inverted or zero-length window', () => {
    expect(validLoop(on(3, 1))).toBeNull()
    expect(validLoop(on(2, 2))).toBeNull()
  })

  it('accepts a real window', () => {
    expect(validLoop(on(1, 3))).toEqual({ in: 1, out: 3 })
  })
})

describe('nextPlaybackTime without a loop', () => {
  it('advances by dt', () => {
    expect(nextPlaybackTime(1, 0.5, 10, off)).toEqual({ time: 1.5, ended: false })
  })

  it('clamps at the duration and reports ended', () => {
    expect(nextPlaybackTime(9.8, 0.5, 10, off)).toEqual({ time: 10, ended: true })
  })

  it('reports ended when already at the duration', () => {
    expect(nextPlaybackTime(10, 0.1, 10, off)).toEqual({ time: 10, ended: true })
  })
})

describe('nextPlaybackTime with a loop', () => {
  it('plays normally inside the window', () => {
    expect(nextPlaybackTime(1.5, 0.25, 10, on(1, 3))).toEqual({ time: 1.75, ended: false })
  })

  it('wraps at the out point', () => {
    expect(nextPlaybackTime(2.9, 0.2, 10, on(1, 3))).toEqual({ time: 3.1 - 3 + 1, ended: false })
  })

  it('carries the overshoot so a loop does not run slow', () => {
    // 0.2s past the out point: 0.1 of it belongs to the next pass.
    expect(nextPlaybackTime(2.9, 0.2, 10, on(1, 3)).time).toBeCloseTo(1.1, 12)
  })

  it('never reports ended inside a loop', () => {
    expect(nextPlaybackTime(9.9, 0.5, 10, on(1, 3)).ended).toBe(false)
  })

  it('pulls a playhead parked after the window back to the in point', () => {
    expect(nextPlaybackTime(7, 0.1, 10, on(1, 3))).toEqual({ time: 1, ended: false })
  })

  it('pulls a playhead parked before the window forward to the in point', () => {
    expect(nextPlaybackTime(0.2, 0.1, 10, on(1, 3))).toEqual({ time: 1, ended: false })
  })

  it('behaves like plain playback when the window is invalid', () => {
    expect(nextPlaybackTime(9.8, 0.5, 10, on(3, 1))).toEqual({ time: 10, ended: true })
  })

  it('loops a window that ends at the project duration', () => {
    expect(nextPlaybackTime(9.9, 0.2, 10, on(9, 10)).time).toBeCloseTo(9.1, 12)
  })
})
