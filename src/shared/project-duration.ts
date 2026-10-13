import type { Project } from './project-schema'

/** True timeline length: the latest end time across every timed element. */
export function computeDuration(p: Project): number {
  let end = 0
  for (const c of p.clips) end = Math.max(end, c.startTime + c.duration)
  for (const c of p.textClips) end = Math.max(end, c.startTime + c.duration)
  for (const c of p.stickerClips) end = Math.max(end, c.startTime + c.duration)
  for (const c of p.audioClips) end = Math.max(end, c.startTime + c.duration)
  for (const c of p.captions) end = Math.max(end, c.endTime)
  return end
}
