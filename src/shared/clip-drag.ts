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

/** The four selection buckets, as the store keeps them. */
export interface SelectionIds {
  clips: string[]
  texts: string[]
  stickers: string[]
  audios: string[]
}

export interface MoveOrigins {
  clips: Map<string, number>
  texts: Map<string, number>
  stickers: Map<string, number>
  audios: Map<string, number>
}

/**
 * The start time of every selected clip at the moment a group drag began.
 *
 * Captured once, at mousedown, because a drag reports deltas: each move recomputes
 * `origin + delta` rather than adding to the current position, so rounding and
 * snapping never accumulate across a gesture.
 */
export function captureMoveOrigins(project: Project, selection: SelectionIds): MoveOrigins {
  const pick = <T extends { id: string; startTime: number }>(list: T[], ids: string[]) => {
    const wanted = new Set(ids)
    return new Map(list.filter(c => wanted.has(c.id)).map(c => [c.id, c.startTime]))
  }
  return {
    clips: pick(project.clips, selection.clips),
    texts: pick(project.textClips, selection.texts),
    stickers: pick(project.stickerClips, selection.stickers),
    audios: pick(project.audioClips, selection.audios),
  }
}

/**
 * The start times a group drag writes, for a delta in seconds from the captured
 * origins.
 *
 * Each clip clamps at timeline zero on its own, so dragging a group left stops
 * the earliest clip at zero without dragging the rest past it or tearing the
 * group apart. Clips on locked tracks are absent from the result entirely: a
 * lock means the track does not move, even when its clip is part of a selection
 * whose other members do.
 */
export function movedStartTimes(
  project: Project,
  origins: MoveOrigins,
  delta: number,
): MoveOrigins {
  const locked = new Set(project.tracks.filter(t => t.locked).map(t => t.id))
  const move = <T extends { id: string; trackId: string }>(list: T[], from: Map<string, number>) => {
    const byId = new Map(list.map(c => [c.id, c]))
    const out = new Map<string, number>()
    for (const [id, origin] of from) {
      const clip = byId.get(id)
      if (!clip || locked.has(clip.trackId)) continue
      out.set(id, Math.max(0, origin + delta))
    }
    return out
  }
  return {
    clips: move(project.clips, origins.clips),
    texts: move(project.textClips, origins.texts),
    stickers: move(project.stickerClips, origins.stickers),
    audios: move(project.audioClips, origins.audios),
  }
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
  excludeIds?: string[]
  snap: boolean
}): number {
  const raw = draggedStartTime(opts.clipStart, opts.dxPx, opts.pxPerSec)
  if (!opts.snap) return raw
  return snapTime(opts.project, raw, opts.playhead, opts.pxPerSec, opts.excludeIds)
}

/**
 * The pixel delta a trim should use once the dragged edge has been snapped.
 *
 * Snapping is expressed as a corrected delta rather than a corrected result so
 * that `trimChanges` stays the single place that knows the clamps: the minimum
 * duration, the floor at timeline zero, and the media window moving with the
 * edge. Feeding it a snapped delta gets all of that for free, and with snapping
 * off the delta passes through untouched.
 *
 * `clip.id` is excluded from the snap targets so an edge cannot snap to the
 * clip's own other edge through itself.
 */
export function snappedTrimDxPx(opts: {
  side: 'left' | 'right'
  clip: DraggableClip & { id: string }
  dxPx: number
  pxPerSec: number
  project: Project
  playhead: number
  snap: boolean
}): number {
  if (!opts.snap) return opts.dxPx
  const dx = opts.dxPx / opts.pxPerSec
  if (opts.side === 'right') {
    const rawEnd = opts.clip.startTime + opts.clip.duration + dx
    const end = snapTime(opts.project, rawEnd, opts.playhead, opts.pxPerSec, [opts.clip.id])
    // snapTime returns its input when nothing is in range; passing the original
    // delta back untouched in that case keeps the no-snap path exact instead of
    // round-tripping it through time and picking up float noise.
    if (end === rawEnd) return opts.dxPx
    return (end - (opts.clip.startTime + opts.clip.duration)) * opts.pxPerSec
  }
  const rawStart = Math.max(0, opts.clip.startTime + dx)
  const start = snapTime(opts.project, rawStart, opts.playhead, opts.pxPerSec, [opts.clip.id])
  if (start === rawStart) return opts.dxPx
  return (start - opts.clip.startTime) * opts.pxPerSec
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
