import type { AspectRatio, Project } from '../types'

export const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '2:1': { width: 2160, height: 1080 },
  '2.35:1': { width: 2350, height: 1000 },
  '1.85:1': { width: 1850, height: 1000 },
}

export const HISTORY_LIMIT = 50

// Continuous edits (drag, resize, slider, typing) fire per mousemove/keystroke.
// Snapshots inside this window replace the previous one instead of stacking,
// so one gesture stays one undo step.
export const COALESCE_WINDOW_MS = 500

export function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project
}

export function createDefaultProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    createdAt: Date.now(),
    duration: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#000000',
    media: [],
    tracks: [
      { id: 'main-video', type: 'video', label: 'Main Track', muted: false, locked: false, height: 64 },
      { id: 'main-audio', type: 'audio', label: 'Audio', muted: false, locked: false, height: 48 },
    ],
    clips: [],
    textClips: [],
    stickerClips: [],
    audioClips: [],
    transitions: [],
    captions: [],
  }
}
