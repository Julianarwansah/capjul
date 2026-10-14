// Stepping the playhead in whole frames.
//
// Adding 1/fps repeatedly does not return to an exact second: thirty steps at
// 30fps land on 0.9999999999999999, which is 1.11e-16 short of 1.0. Because the
// timecode display truncates rather than rounds - correctly, for a timecode -
// that value renders as "0:00" instead of "0:01". Snapping to the frame index
// removes the drift instead of papering over it in the formatter.

/**
 * The time `frames` whole frames away from `t`, on the frame grid.
 *
 * `t` is first rounded to the nearest frame, so stepping from a time that came
 * from a click-seek (an arbitrary fraction) also lands on the grid. Frames may
 * be negative to step backwards, and fractional frame counts are not meaningful.
 */
export function stepFrames(t: number, fps: number, frames: number): number {
  if (!(fps > 0)) return t
  return (Math.round(t * fps) + frames) / fps
}

/** The frame index nearest to `t`. */
export function frameIndexAt(t: number, fps: number): number {
  return fps > 0 ? Math.round(t * fps) : 0
}
