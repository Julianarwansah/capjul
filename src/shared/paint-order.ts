import type { Clip, MediaFile, Project, StickerClip, TextClip } from './project-schema'

// Text and sticker tracks that predate real track creation have ids that are
// not in project.tracks; overlays must still paint above video, so unknown
// tracks sort high rather than to the bottom.
export const OVERLAY_Z = 1000

/**
 * One paintable clip plus the layer index it paints at. `kind` discriminates
 * which of the three clip arrays it came from, so a consumer can render it
 * without a second lookup.
 *
 * A `clip` item carries the media it resolved to. Both consumers need it — the
 * compositor to tell an image from a video, the preview to pick an element — and
 * resolving it here is what makes "media exists" a guarantee of the type rather
 * than something each caller has to re-check.
 */
export type PaintItem =
  | { kind: 'clip'; z: number; clip: Clip; media: MediaFile }
  | { kind: 'text'; z: number; clip: TextClip }
  | { kind: 'sticker'; z: number; clip: StickerClip }

/**
 * Every paintable clip in the project, in paint order — lowest first, so the
 * last entry is the topmost layer.
 *
 * This is the single source of stacking order. `compileScene` maps it onto
 * canvas layers and the preview maps it onto DOM elements, which is what stops
 * the two from disagreeing about which clip covers which. Before it existed
 * each side derived its own order and could diverge silently: the preview took
 * one clip per video-type track via `find` and always painted all text under all
 * stickers, while the compositor painted every clip on every track and ordered
 * text and stickers by track index. Adding a sticker before any text put them in
 * the opposite order on the two sides.
 *
 * Two kinds of clip are excluded because they cannot be painted at all, and the
 * compositor already skipped them: zero-length clips, and clips whose media is
 * no longer in the project.
 */
export function paintOrder(project: Project): PaintItem[] {
  const trackZ = new Map(project.tracks.map((t, i) => [t.id, i]))
  const zOf = (trackId: string) => trackZ.get(trackId) ?? OVERLAY_Z
  const items: PaintItem[] = []

  for (const clip of project.clips) {
    if (clip.duration <= 0) continue
    const media = project.media.find(m => m.id === clip.mediaId)
    if (!media) continue
    items.push({ kind: 'clip', z: zOf(clip.trackId), clip, media })
  }

  for (const clip of project.textClips) {
    if (clip.duration <= 0) continue
    items.push({ kind: 'text', z: zOf(clip.trackId), clip })
  }

  for (const clip of project.stickerClips) {
    if (clip.duration <= 0) continue
    items.push({ kind: 'sticker', z: zOf(clip.trackId), clip })
  }

  // Ties break on start time so that within one track a later clip paints over an
  // earlier one. Array.prototype.sort is stable in every engine this runs on, so
  // clips that tie on both keep their project order.
  items.sort((a, b) => a.z - b.z || a.clip.startTime - b.clip.startTime)
  return items
}

/**
 * `paintOrder` narrowed to what is on screen at timeline time t, still in paint
 * order. The interval is half-open — a clip ending exactly at t is gone and the
 * one starting at t is present — so adjacent clips on a track never both paint.
 */
export function activePaintAt(project: Project, t: number): PaintItem[] {
  return paintOrder(project).filter(
    item => t >= item.clip.startTime && t < item.clip.startTime + item.clip.duration,
  )
}
