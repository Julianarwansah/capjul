// Transition resolution: which transition covers a given time, and which two
// clips it blends. The *look* of a blend lives in transition-pose.ts, shared with
// the export compositor; this module only answers "is one running, and over what".

import type { Clip, MediaFile, Project, Transition } from './project-schema'

/** Every transition in the project with both of its clips resolved, or dropped
 *  when either end is missing. */
export interface ResolvedTransition {
  transition: Transition
  clipA: Clip
  clipB: Clip
  /** Timeline time where clipA ends and clipB begins. */
  boundary: number
  start: number
  end: number
}

/**
 * Resolves every transition to its clip pair. The incoming clip is the next one
 * on the same track by start time, so a transition on the last clip of a track
 * resolves to nothing - there is no clip to blend into.
 *
 * `compileScene` and `findActiveTransition` both go through here, so the export
 * and the preview cannot disagree about which two clips a transition blends.
 */
export function resolveTransitions(project: Project): ResolvedTransition[] {
  const out: ResolvedTransition[] = []
  for (const transition of project.transitions) {
    const clipA = project.clips.find(c => c.id === transition.clipId)
    if (!clipA) continue
    const trackClips = project.clips
      .filter(c => c.trackId === clipA.trackId)
      .sort((a, b) => a.startTime - b.startTime)
    const indexA = trackClips.findIndex(c => c.id === clipA.id)
    const clipB = indexA >= 0 ? trackClips[indexA + 1] : undefined
    if (!clipB) continue
    const boundary = clipA.startTime + clipA.duration
    const half = transition.duration / 2
    out.push({ transition, clipA, clipB, boundary, start: boundary - half, end: boundary + half })
  }
  return out
}

/** A transition that is running right now, with both clips it blends and how
 *  far through it is. `mediaA`/`mediaB` are undefined when a clip's media entry
 *  is missing, which the caller renders as nothing rather than an error. */
export interface ActiveTransition {
  transition: Transition
  clipA: Clip
  clipB: Clip
  mediaA: MediaFile | undefined
  mediaB: MediaFile | undefined
  /** 0 when the transition has just started, 1 when it has finished. */
  progress: number
}

/**
 * The transition covering `t`, or null.
 *
 * A transition straddles the end of its clip: it runs from half its duration
 * before that boundary to half after.
 */
export function findActiveTransition(project: Project, t: number): ActiveTransition | null {
  for (const r of resolveTransitions(project)) {
    if (t < r.start || t > r.end) continue
    return {
      transition: r.transition,
      clipA: r.clipA,
      clipB: r.clipB,
      mediaA: project.media.find(m => m.id === r.clipA.mediaId),
      mediaB: project.media.find(m => m.id === r.clipB.mediaId),
      // A zero-duration transition would divide by zero; clamping keeps it at
      // the end state instead of producing NaN through the poses.
      progress: r.transition.duration === 0
        ? 1
        : Math.min(1, Math.max(0, (t - r.start) / r.transition.duration)),
    }
  }
  return null
}
