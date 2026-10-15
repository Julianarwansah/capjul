import type {
  AudioClip, Caption, Clip, Project, StickerClip, TextClip,
} from './project-schema'

// Exporting a range: rewrite a project so that [start, end) becomes [0, duration).
//
// Done as a project transform rather than a plan transform on purpose. Both
// export engines compile from a Project - the filtergraph through
// compileProject, the compositor through compileScene - so windowing the project
// gives both engines the feature for free and keeps them in agreement by
// construction, the same argument that put paint order and the source-time
// formula in shared modules.

interface Timed {
  startTime: number
  duration: number
}

/** How a timed item overlaps the window: dropped, kept whole, or trimmed. */
interface Windowed<T> {
  item: T
  /** Seconds trimmed from the front, which is what a media window and the fade
   *  envelope have to absorb. */
  trimmedFront: number
  /** Seconds trimmed from the tail. */
  trimmedBack: number
}

function windowItem<T extends Timed>(item: T, start: number, end: number): Windowed<T> | null {
  const itemEnd = item.startTime + item.duration
  if (itemEnd <= start || item.startTime >= end) return null
  const newStart = Math.max(item.startTime, start)
  const newEnd = Math.min(itemEnd, end)
  return {
    item: {
      ...item,
      startTime: newStart - start,
      duration: newEnd - newStart,
    },
    trimmedFront: newStart - item.startTime,
    trimmedBack: itemEnd - newEnd,
  }
}

/**
 * The project restricted to `[start, end)`, re-based onto zero.
 *
 * Items straddling either edge are trimmed rather than dropped, and everything
 * that hangs off an item's start - media windows, keyframe times, fade envelopes
 * - is adjusted by what the trim removed, so a clip that began before the window
 * still shows the right source frame at the window's first instant and a fade
 * that began before it does not restart at the edge.
 *
 * Transitions need no special handling: they are resolved from clips at compile
 * time, so a transition whose clips survived the window survives with them, and
 * one whose ends were dropped resolves to nothing.
 */
export function windowProject(project: Project, start: number, end: number): Project {
  if (!(end > start)) return project

  const clips: Clip[] = []
  for (const c of project.clips) {
    const w = windowItem(c, start, end)
    if (!w) continue
    clips.push({
      ...w.item,
      mediaStart: c.mediaStart + w.trimmedFront * (c.speed || 1),
      mediaEnd: c.mediaEnd - w.trimmedBack * (c.speed || 1),
      keyframes: shiftKeyframes(c, start),
    })
  }

  const textClips: TextClip[] = keep(project.textClips, start, end, c => ({ keyframes: shiftKeyframes(c, start) }))
  const stickerClips: StickerClip[] = keep(project.stickerClips, start, end, c => ({ keyframes: shiftKeyframes(c, start) }))

  const audioClips: AudioClip[] = []
  for (const c of project.audioClips) {
    const w = windowItem(c, start, end)
    if (!w) continue
    audioClips.push({
      ...w.item,
      mediaStart: c.mediaStart + w.trimmedFront * (c.speed || 1),
      mediaEnd: c.mediaEnd - w.trimmedBack * (c.speed || 1),
      // A fade-in that began before the window has partly happened already; what
      // remains is what the export should fade. A fade-out cut short by the
      // window's end completes at the new end instead of running past it.
      fadein: Math.max(0, Math.min(c.fadein - w.trimmedFront, w.item.duration)),
      fadeout: Math.max(0, Math.min(c.fadeout - w.trimmedBack, w.item.duration)),
      keyframes: shiftKeyframes(c, start),
    })
  }

  const captions: Caption[] = []
  for (const c of project.captions) {
    const w = windowItem({ ...c, startTime: c.startTime, duration: c.endTime - c.startTime }, start, end)
    if (!w) continue
    captions.push({ ...c, startTime: w.item.startTime, endTime: w.item.startTime + w.item.duration })
  }

  return {
    ...project,
    duration: end - start,
    clips,
    textClips,
    stickerClips,
    audioClips,
    captions,
    markers: project.markers
      .filter(m => m.time >= start && m.time < end)
      .map(m => ({ ...m, time: m.time - start })),
  }
}

function keep<T extends Timed>(
  list: T[],
  start: number,
  end: number,
  adjust: (item: T) => Partial<T>,
): T[] {
  const out: T[] = []
  for (const item of list) {
    const w = windowItem(item, start, end)
    if (!w) continue
    out.push({ ...w.item, ...adjust(item) })
  }
  return out
}

function shiftKeyframes<T extends { keyframes?: Array<{ time: number }> }>(
  item: T,
  start: number,
): T['keyframes'] {
  return (item.keyframes ?? []).map(k => ({ ...k, time: k.time - start }))
}
