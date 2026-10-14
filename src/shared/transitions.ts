// Transition styling for the preview. Kept out of the component and free of DOM
// and React types so it stays testable in node, like scene.ts.
//
// NOTE: this is preview-only. Nothing on the export side reads
// project.transitions, so every style here is dropped from the encoded output
// (tech debt D15).

import type { Clip, MediaFile, Project, Transition } from './project-schema'

/** The subset of CSSProperties a transition style is allowed to touch. Narrower
 *  than React.CSSProperties on purpose: it keeps this module framework-free and
 *  makes it obvious that a transition cannot set, say, a layout property. */
export interface TransitionStyle {
  opacity?: number
  transform?: string
  clipPath?: string
  filter?: string
}

/** Every transition type the preview knows how to draw. The panel's picker
 *  offers these plus 'none', which creates no transition at all. */
export const TRANSITION_TYPES = [
  'fade', 'dissolve',
  'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
  'slide-left', 'slide-right',
  'zoom-in', 'zoom-out',
  'blur', 'flash',
] as const

export type TransitionType = typeof TRANSITION_TYPES[number]

/**
 * Styles for the outgoing and incoming clip at `progress` (0 = transition just
 * started, 1 = finished). Index 0 is the clip leaving, index 1 the clip arriving.
 *
 * An unknown type falls back to a crossfade rather than throwing, so a project
 * carrying a type this build does not know still renders something sane.
 */
export function transitionStyles(type: string, progress: number): [TransitionStyle, TransitionStyle] {
  switch (type) {
    case 'wipe-left':
      return [
        { clipPath: `inset(0 ${progress * 100}% 0 0)` },
        { clipPath: `inset(0 0 0 ${(1 - progress) * 100}%)` },
      ]
    case 'wipe-right':
      return [
        { clipPath: `inset(0 0 0 ${progress * 100}%)` },
        { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` },
      ]
    case 'wipe-up':
      return [
        { clipPath: `inset(${progress * 100}% 0 0 0)` },
        { clipPath: `inset(0 0 ${(1 - progress) * 100}% 0)` },
      ]
    case 'wipe-down':
      return [
        { clipPath: `inset(0 0 ${progress * 100}% 0)` },
        { clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` },
      ]
    case 'slide-left':
      return [
        { transform: `translateX(${-progress * 100}%)` },
        { transform: `translateX(${(1 - progress) * 100}%)` },
      ]
    case 'slide-right':
      return [
        { transform: `translateX(${progress * 100}%)` },
        { transform: `translateX(${-(1 - progress) * 100}%)` },
      ]
    case 'zoom-in':
      return [
        { transform: `scale(${1 + progress * 0.5})`, opacity: 1 - progress },
        { opacity: progress },
      ]
    case 'zoom-out':
      return [
        { opacity: 1 - progress },
        { transform: `scale(${2 - progress})`, opacity: progress },
      ]
    case 'blur':
      return [
        { filter: `blur(${progress * 16}px)`, opacity: 1 - progress * 0.5 },
        { filter: `blur(${(1 - progress) * 16}px)`, opacity: progress },
      ]
    case 'flash':
      return [
        { opacity: progress < 0.5 ? 1 - progress * 2 : 0 },
        { opacity: progress > 0.5 ? (progress - 0.5) * 2 : 0 },
      ]
    // 'fade' and 'dissolve' are the same crossfade, and so is the fallback.
    default:
      return [{ opacity: 1 - progress }, { opacity: progress }]
  }
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
 * before that boundary to half after. The incoming clip is the next one on the
 * same track by start time, so a transition on the last clip of a track never
 * activates - there is nothing to blend into.
 */
export function findActiveTransition(project: Project, t: number): ActiveTransition | null {
  for (const transition of project.transitions) {
    const clipA = project.clips.find(c => c.id === transition.clipId)
    if (!clipA) continue

    const boundary = clipA.startTime + clipA.duration
    const start = boundary - transition.duration / 2
    const end = boundary + transition.duration / 2
    if (t < start || t > end) continue

    const trackClips = project.clips
      .filter(c => c.trackId === clipA.trackId)
      .sort((a, b) => a.startTime - b.startTime)
    const indexA = trackClips.findIndex(c => c.id === clipA.id)
    const clipB = indexA >= 0 ? trackClips[indexA + 1] : undefined
    if (!clipB) continue

    return {
      transition,
      clipA,
      clipB,
      mediaA: project.media.find(m => m.id === clipA.mediaId),
      mediaB: project.media.find(m => m.id === clipB.mediaId),
      // A zero-duration transition would divide by zero; clamping keeps it at
      // the end state instead of producing NaN through the styles.
      progress: transition.duration === 0
        ? 1
        : Math.min(1, Math.max(0, (t - start) / transition.duration)),
    }
  }
  return null
}
