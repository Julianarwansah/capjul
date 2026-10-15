import type { Project } from './project-schema'

// Snapping a dragged clip to nearby edges. Pure so it can be tested without a
// timeline, and shared by every clip kind's drag handler.

/** Snap radius in pixels, converted to seconds at the current zoom. */
export const SNAP_PX = 8

/**
 * The nearest snap target to `t`, or `t` unchanged when nothing is within
 * SNAP_PX at this zoom.
 *
 * Targets are the playhead, zero, the start and end of every other clip, and
 * every marker. `excludeId` stops the dragged clip snapping to itself.
 *
 * Ties go to whichever target comes first, so the candidate order below is part
 * of the behaviour: playhead, zero, then video, audio, text and sticker clips,
 * then markers. Stickers were added last (tech debt D19) and markers after them,
 * each time appended rather than inserted so the ordering of the targets that
 * already snapped could not change.
 */
export function snapTime(
  project: Project,
  t: number,
  playhead: number,
  pxPerSec: number,
  excludeId?: string,
): number {
  const threshold = SNAP_PX / pxPerSec
  const snaps: number[] = [playhead, 0]
  for (const c of [
    ...project.clips, ...project.audioClips, ...project.textClips, ...project.stickerClips,
  ]) {
    if (c.id === excludeId) continue
    snaps.push(c.startTime, c.startTime + c.duration)
  }
  for (const m of project.markers) snaps.push(m.time)

  let best = t
  let bestDist = threshold
  for (const s of snaps) {
    const dist = Math.abs(t - s)
    if (dist < bestDist) { bestDist = dist; best = s }
  }
  return best
}
