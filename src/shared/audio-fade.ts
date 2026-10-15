// Audio fades, resolved in timeline (output) time.
//
// The export expresses a fade as two ffmpeg afade filters in series, both timed
// in output seconds measured from the clip's start: in over [0, fadein], out
// over [span - fadeout, span], where span is the audible length after tempo.
// Filters in series multiply, so the gain at any instant is the product of the
// two ramps. The preview resolves that same product here, which is what makes
// the fade heard while editing the fade that exports (tech debt D26).

/**
 * The audible length of a clip in timeline seconds: source length divided by
 * tempo. This is the span the afade chain times its ramps against, so the
 * preview must use it too - a clip at 2x fades over half the timeline distance
 * it would at 1x, in both engines.
 */
export function audioSpan(mediaStart: number, mediaEnd: number, speed: number): number {
  return (mediaEnd - mediaStart) / (speed || 1)
}

function ramp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * The gain a clip's fades apply at timeline time t, in [0, 1].
 *
 * `span` is `audioSpan` of the same clip. With no fades both ramps are 1 and the
 * gain is 1 everywhere, so callers can multiply unconditionally. Outside the
 * audible span the product is 0, matching afade, which holds at zero before the
 * in-ramp starts and after the out-ramp ends.
 */
export function fadeGain(
  start: number,
  span: number,
  fadein: number,
  fadeout: number,
  t: number,
): number {
  const inGain = fadein > 0 ? ramp01((t - start) / fadein) : 1
  const outGain = fadeout > 0 ? ramp01((start + span - t) / fadeout) : 1
  return inGain * outGain
}
