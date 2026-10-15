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

/**
 * Timecode as `M:SS:FF`.
 *
 * The frame component is there because `M:SS` cannot distinguish two markers
 * inside the same second, and marker positions are the one place the UI names an
 * exact frame instead of a span. Deriving all three fields from the frame index
 * rather than from `t` keeps the readout on the same grid `stepFrames` walks, and
 * means the frames field cannot round up to `fps` at a second boundary.
 */
export function formatTimecode(t: number, fps: number): string {
  const framesPerSecond = Math.max(1, Math.round(fps))
  const total = frameIndexAt(t, fps)
  const m = Math.floor(total / (framesPerSecond * 60))
  const s = Math.floor((total / framesPerSecond) % 60)
  const f = total % framesPerSecond
  return `${m}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}
