import type { Project } from './project-schema'
import { snapTime } from './timeline-snap'

// The arithmetic behind dragging and trimming a clip on the timeline. Pure and
// separate from the DOM event handling in Timeline/clip-interaction.ts, because
// this is where the last serious timeline bug lived: the pixel delta was being
// clamped at zero, so every leftward drag and every trim-shorter was a no-op.
// These functions are the regression test for that.

/** Shortest a clip can be trimmed to. */
export const MIN_CLIP_SECONDS = 0.1

/** Fields a trim can write. A subset of the numeric fields every clip kind has,
 *  so it is assignable to Partial<Clip>, Partial<AudioClip> and the rest without
 *  a cast. Text and sticker clips simply never receive the media window fields. */
export interface TrimChanges {
  startTime?: number
  duration?: number
  mediaStart?: number
  mediaEnd?: number
}

/** A clip as far as dragging and trimming are concerned. */
export interface DraggableClip {
  startTime: number
  duration: number
  /** Present on video and audio clips, which address a window of a source file. */
  mediaStart?: number
}

/**
 * Where a clip lands after being dragged `dxPx` pixels.
 *
 * `dxPx` is a signed delta and must stay signed: dragging left is negative. The
 * only clamp is at timeline zero, because a clip cannot start before the
 * project does.
 */
export function draggedStartTime(clipStart: number, dxPx: number, pxPerSec: number): number {
  return Math.max(0, clipStart + dxPx / pxPerSec)
}

/**
 * The same, with snapping applied unless the caller disabled it.
 *
 * Snapping is skipped while shift is held, which is the existing convention for
 * "move this precisely".
 */
export function draggedStartTimeSnapped(opts: {
  clipStart: number
  dxPx: number
  pxPerSec: number
  project: Project
  playhead: number
  excludeId?: string
  snap: boolean
}): number {
  const raw = draggedStartTime(opts.clipStart, opts.dxPx, opts.pxPerSec)
  if (!opts.snap) return raw
  return snapTime(opts.project, raw, opts.playhead, opts.pxPerSec, opts.excludeId)
}

/**
 * What to write when a clip edge is dragged `dxPx` pixels.
 *
 * Dragging the right edge changes only the duration; dragging the left edge
 * moves the start and grows or shrinks the duration in the opposite direction.
 * For clips with a media window the window moves with the trim, and `mediaStart`
 * is floored at zero because a negative value is not merely past the start of the
 * source - it is an invalid `ffmpeg -ss`.
 */
export function trimChanges(
  side: 'left' | 'right',
  clip: DraggableClip,
  dxPx: number,
  pxPerSec: number,
): TrimChanges {
  const dx = dxPx / pxPerSec
  // Destructured to a const so the undefined check narrows it; TS will not
  // narrow a property of a mutable parameter binding.
  const { mediaStart } = clip

  if (side === 'right') {
    const duration = Math.max(MIN_CLIP_SECONDS, clip.duration + dx)
    return mediaStart === undefined
      ? { duration }
      : { duration, mediaEnd: mediaStart + duration }
  }

  const startTime = Math.max(0, clip.startTime + dx)
  const duration = Math.max(MIN_CLIP_SECONDS, clip.duration - dx)
  return mediaStart === undefined
    ? { startTime, duration }
    : { startTime, duration, mediaStart: Math.max(0, mediaStart + dx) }
}
