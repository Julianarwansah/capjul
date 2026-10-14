import type { Keyframe } from './project-schema'
import { interpolate } from './keyframe-interpolate'

// Splitting a clip in two. Shared by the store's composite actions and the
// timeline context menu so every entry point cuts identically.

export interface Splittable {
  id: string
  startTime: number
  duration: number
  keyframes?: Keyframe[]
}

/** Clip kinds that address a window of a source file; text and stickers do not. */
export interface MediaWindowed extends Splittable {
  mediaStart: number
  mediaEnd: number
  speed: number
}

function hasMediaWindow(clip: Splittable): clip is MediaWindowed {
  return 'mediaStart' in clip && 'mediaEnd' in clip && 'speed' in clip
}

/**
 * Divides a clip's keyframes between the two halves produced by a cut.
 *
 * Keyframe times are absolute project time and neither the preview nor the
 * export clamps them to the clip that owns them, so each half must carry only
 * its own points. Every animated property also gets a point at the cut itself:
 * without it a half whose keyframes all sit on the other side of the cut would
 * fall back to the clip's static base value and visibly snap.
 */
export function splitKeyframes(keyframes: Keyframe[], splitTime: number): [Keyframe[], Keyframe[]] {
  const first = keyframes.filter(k => k.time < splitTime)
  const second = keyframes.filter(k => k.time > splitTime).map(k => ({ ...k, id: crypto.randomUUID() }))

  // A point exactly on the cut is the first half's end pose and the second
  // half's start pose, so it belongs to both.
  const atCut = keyframes.filter(k => k.time === splitTime)
  first.push(...atCut)
  second.push(...atCut.map(k => ({ ...k, id: crypto.randomUUID() })))

  for (const property of new Set(keyframes.map(k => k.property))) {
    if (atCut.some(k => k.property === property)) continue
    const value = interpolate(keyframes, property, splitTime, 0)
    // The synthesized point opens the tail half's first segment, so it inherits
    // the easing of the keyframe that opened the segment being cut. The curve
    // cannot survive the cut exactly - easing is not affine-invariant over a
    // sub-interval - but inheriting it keeps the character of the move instead of
    // silently flattening it to linear.
    const outgoing = keyframes
      .filter(k => k.property === property && k.time < splitTime)
      .sort((a, b) => a.time - b.time)
      .pop()
    const easing = outgoing?.easing ?? 'linear'
    first.push({ id: crypto.randomUUID(), time: splitTime, property, value, easing })
    second.push({ id: crypto.randomUUID(), time: splitTime, property, value, easing })
  }

  return [first, second]
}

/**
 * Cuts a clip at an absolute project time and returns both halves.
 *
 * Returns null when the time falls outside the clip or on either edge, where a
 * cut would produce a zero-length half.
 */
export function splitClipAt<T extends Splittable>(clip: T, time: number): [T, T] | null {
  if (time <= clip.startTime || time >= clip.startTime + clip.duration) return null

  const elapsed = time - clip.startTime
  const [firstKeyframes, secondKeyframes] = splitKeyframes(clip.keyframes ?? [], time)
  const cutMedia = hasMediaWindow(clip) ? clip.mediaStart + elapsed * clip.speed : null

  const first = {
    ...clip,
    id: crypto.randomUUID(),
    duration: elapsed,
    keyframes: firstKeyframes,
    ...(cutMedia !== null ? { mediaEnd: cutMedia } : null),
  }
  const second = {
    ...clip,
    id: crypto.randomUUID(),
    startTime: time,
    duration: clip.duration - elapsed,
    keyframes: secondKeyframes,
    ...(cutMedia !== null ? { mediaStart: cutMedia } : null),
  }
  return [first as T, second as T]
}

/** True when the playhead sits strictly inside this clip, so a cut is meaningful. */
export function canSplitAt(clip: Splittable, time: number): boolean {
  return time > clip.startTime && time < clip.startTime + clip.duration
}
