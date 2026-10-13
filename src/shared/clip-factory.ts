import type { AudioClip, Clip, MediaFile } from './project-schema'

// DataTransfer type used when dragging media from the panel onto the timeline.
export const MEDIA_DRAG_MIME = 'application/x-capjul-media'

// One place that knows how a MediaFile becomes a timeline clip, so the Media
// panel and timeline drag-and-drop cannot drift apart.

export function makeClipFromMedia(media: MediaFile, trackId: string, startTime: number): Clip | null {
  if (media.type === 'audio') return null
  const duration = media.duration || 5
  return {
    id: crypto.randomUUID(),
    mediaId: media.id,
    trackId,
    startTime,
    duration,
    mediaStart: 0,
    mediaEnd: duration,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    filter: undefined,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
  }
}

export function makeAudioClipFromMedia(media: MediaFile, trackId: string, startTime: number): AudioClip | null {
  if (media.type !== 'audio') return null
  const duration = media.duration || 30
  return {
    id: crypto.randomUUID(),
    trackId,
    mediaId: media.id,
    startTime,
    duration,
    mediaStart: 0,
    mediaEnd: duration,
    volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0,
  }
}
