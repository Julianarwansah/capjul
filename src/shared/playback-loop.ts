// Playback looping: the arithmetic of where the playhead goes next.
//
// Kept out of the preview component so the wrap rule - including the awkward
// cases, an invalid window and a playhead parked outside it - is testable
// without a requestAnimationFrame loop running.

export interface LoopWindow {
  in: number | null
  out: number | null
  enabled: boolean
}

export interface PlaybackStep {
  time: number
  /** True when playback reached the end of the project and should stop. */
  ended: boolean
}

/** A loop window that playback will actually honour. */
export function validLoop(loop: LoopWindow): { in: number; out: number } | null {
  if (!loop.enabled || loop.in === null || loop.out === null) return null
  if (!(loop.out > loop.in)) return null
  return { in: loop.in, out: loop.out }
}

/**
 * The playhead's next position after `dt` seconds of playback from `t`.
 *
 * Without a loop this is the old behaviour exactly: advance, clamp at the
 * project end, and report ended so the caller can stop. With a valid loop the
 * playhead wraps at the out point, carrying the overshoot into the next pass so
 * a loop does not drift slower than real time by dropping the remainder of the
 * frame that crossed the boundary.
 *
 * A playhead parked outside the window jumps to the in point on the next tick
 * rather than playing past it: a loop the user armed should take effect from the
 * next frame, not wait for the playhead to wander back.
 */
export function nextPlaybackTime(
  t: number,
  dt: number,
  duration: number,
  loop: LoopWindow,
): PlaybackStep {
  const window = validLoop(loop)
  if (!window) {
    const next = Math.min(t + dt, duration)
    return { time: next, ended: next >= duration }
  }
  if (t < window.in || t >= window.out) return { time: window.in, ended: false }
  const next = t + dt
  if (next < window.out) return { time: next, ended: false }
  return { time: window.in + (next - window.out), ended: false }
}
