import { buildCssFilter, colorAdjustFactors } from './color-adjust'
import type { Project, TextClip, StickerClip } from './project-schema'

// The Phase 2 scene model: a DOM-independent description of what the compositor
// must draw, in paint order. The renderer compositor and (later) the preview
// both consume this, which is what makes parity structural rather than hoped
// for. No DOM types here so it stays testable in node.

export interface SceneTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
}

interface SceneLayerBase {
  mediaId: string
  start: number
  end: number
  transform: SceneTransform
  /** CSS filter string, identical to the preview's, applied via ctx.filter */
  filter: string
}

export interface SceneVideoLayer extends SceneLayerBase {
  kind: 'video'
  mediaStart: number
  speed: number
}

export interface SceneImageLayer extends SceneLayerBase {
  kind: 'image'
}

export interface SceneTextLayer {
  kind: 'text'
  clip: TextClip
  start: number
  end: number
}

export interface SceneStickerLayer {
  kind: 'sticker'
  clip: StickerClip
  start: number
  end: number
}

export type SceneLayer = SceneVideoLayer | SceneImageLayer | SceneTextLayer | SceneStickerLayer

export interface Scene {
  width: number
  height: number
  fps: number
  duration: number
  background: string
  layers: SceneLayer[]
}

// Text and sticker tracks that predate real track creation have ids that are
// not in project.tracks; overlays must still paint above video, so unknown
// tracks sort high rather than to the bottom.
const OVERLAY_Z = 1000

export function compileScene(project: Project): Scene {
  const trackZ = new Map(project.tracks.map((t, i) => [t.id, i]))
  const staged: Array<{ z: number; layer: SceneLayer }> = []

  for (const clip of project.clips) {
    if (clip.duration <= 0) continue
    const media = project.media.find(m => m.id === clip.mediaId)
    if (!media) continue
    const base: SceneLayerBase = {
      mediaId: media.id,
      start: clip.startTime,
      end: clip.startTime + clip.duration,
      transform: {
        x: clip.x, y: clip.y,
        scaleX: clip.scaleX, scaleY: clip.scaleY,
        rotation: clip.rotation,
        opacity: clip.opacity,
      },
      filter: [clip.filter ?? '', buildCssFilter(colorAdjustFactors(clip))].filter(Boolean).join(' '),
    }
    const layer: SceneLayer = media.type === 'image'
      ? { kind: 'image', ...base }
      : { kind: 'video', ...base, mediaStart: clip.mediaStart, speed: clip.speed || 1 }
    staged.push({ z: trackZ.get(clip.trackId) ?? OVERLAY_Z, layer })
  }

  for (const clip of project.textClips) {
    if (clip.duration <= 0) continue
    staged.push({
      z: trackZ.get(clip.trackId) ?? OVERLAY_Z,
      layer: { kind: 'text', clip, start: clip.startTime, end: clip.startTime + clip.duration },
    })
  }

  for (const clip of project.stickerClips) {
    if (clip.duration <= 0) continue
    staged.push({
      z: trackZ.get(clip.trackId) ?? OVERLAY_Z,
      layer: { kind: 'sticker', clip, start: clip.startTime, end: clip.startTime + clip.duration },
    })
  }

  staged.sort((a, b) => a.z - b.z || a.layer.start - b.layer.start)

  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    duration: project.duration,
    background: project.backgroundColor,
    layers: staged.map(s => s.layer),
  }
}

/** Source time a video layer must show at timeline time t. */
export function mediaTimeAt(layer: SceneVideoLayer, t: number): number {
  return layer.mediaStart + (t - layer.start) * layer.speed
}

export function isActiveAt(layer: SceneLayer, t: number): boolean {
  return t >= layer.start && t < layer.end
}
