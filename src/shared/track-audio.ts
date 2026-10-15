import type { Project, Track } from './project-schema'

// Track-level audio routing, in one place so the preview and both export engines
// cannot disagree about it.
//
// A muted track is silent everywhere and never hidden. Hiding is what a track
// visibility control would do, and the timeline has none - its speaker icon sits
// next to the audio track's own, and useAudioClips has always read it as
// silence. Until this module existed, though, only the preview honoured it: the
// export mixed a muted track's audio into the file anyway (tech debt D24).

/** The track a clip sits on, if the project still has it. */
export function trackOf(project: Project, trackId: string): Track | undefined {
  return project.tracks.find(t => t.id === trackId)
}

/**
 * Whether a clip's track silences it.
 *
 * A clip on a track that no longer exists is audible: removing a track is not a
 * mute, and what happens to orphaned clips visually is paintOrder's decision,
 * not this one.
 */
export function trackMuted(project: Project, trackId: string): boolean {
  return trackOf(project, trackId)?.muted ?? false
}
