import type { Keyframe } from './project-schema'
import { ease } from './keyframe-easing'

/**
 * Value of a property at time t, interpolated between the keyframes that bracket
 * it. Returns `fallback` when the property has no keyframes at all.
 *
 * Outside the first and last keyframe the value is held, not extrapolated. The
 * segment's curve comes from the *outgoing* keyframe's easing, so a keyframe
 * owns the shape of the interval it starts.
 */
export function interpolate(keyframes: Keyframe[], property: string, time: number, fallback: number): number {
  const kfs = keyframes.filter(k => k.property === property).sort((a, b) => a.time - b.time)
  if (kfs.length === 0) return fallback
  if (time <= kfs[0].time) return kfs[0].value
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1]
    if (time >= a.time && time <= b.time) {
      const u = (time - a.time) / (b.time - a.time)
      return a.value + (b.value - a.value) * ease(a.easing, u)
    }
  }
  return fallback
}

/** Returns true when at least one keyframe exists for the given property. */
export function hasKeyframes(keyframes: Keyframe[], property: string): boolean {
  return keyframes.some(k => k.property === property)
}

/** The keyframe for a property that is at `time`, within the tolerance the store
 *  uses to treat two keyframes as the same one. Null when there is none. */
export function keyframeAt(keyframes: Keyframe[], property: string, time: number, tolerance = 0.05): Keyframe | null {
  return keyframes.find(k => k.property === property && Math.abs(k.time - time) < tolerance) ?? null
}
