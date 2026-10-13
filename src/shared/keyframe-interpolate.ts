import type { Keyframe } from './project-schema'

/** Linear interpolation between two keyframes for a property at time t. */
export function interpolate(keyframes: Keyframe[], property: string, time: number, fallback: number): number {
  const kfs = keyframes.filter(k => k.property === property).sort((a, b) => a.time - b.time)
  if (kfs.length === 0) return fallback
  if (time <= kfs[0].time) return kfs[0].value
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1]
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time)
      return a.value + (b.value - a.value) * t
    }
  }
  return fallback
}

/** Returns true when at least one keyframe exists for the given property. */
export function hasKeyframes(keyframes: Keyframe[], property: string): boolean {
  return keyframes.some(k => k.property === property)
}
