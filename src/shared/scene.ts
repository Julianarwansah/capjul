import { buildCssFilter, colorAdjustFactors } from './color-adjust'
import { interpolate } from './keyframe-interpolate'
import type { Keyframe, Project, TextClip, StickerClip } from './project-schema'

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
  /** Static base pose; `keyframes` overrides individual properties over time. */
  transform: SceneTransform
  keyframes: Keyframe[]
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
      keyframes: clip.keyframes ?? [],
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

/** The pose a layer draws with at timeline time t. The compositor and the
 *  preview both resolve transforms here, which is what keeps them in parity. */
export function transformAt(keyframes: Keyframe[], base: SceneTransform, t: number): SceneTransform {
  if (keyframes.length === 0) return base
  return {
    x:        interpolate(keyframes, 'x',        t, base.x),
    y:        interpolate(keyframes, 'y',        t, base.y),
    scaleX:   interpolate(keyframes, 'scaleX',   t, base.scaleX),
    scaleY:   interpolate(keyframes, 'scaleY',   t, base.scaleY),
    rotation: interpolate(keyframes, 'rotation', t, base.rotation),
    opacity:  interpolate(keyframes, 'opacity',  t, base.opacity),
  }
}

/**
 * Pose of a text clip at timeline time t. Text x/y are absolute canvas
 * fractions with the box centred on the point, whereas a media layer's x/y are
 * offsets from the canvas centre - so text resolves through its own helper.
 * TextClip carries no opacity field; it starts at 1 and can be keyframed.
 */
export function textTransformAt(clip: TextClip, t: number): SceneTransform {
  return transformAt(clip.keyframes ?? [], {
    x: clip.x, y: clip.y,
    scaleX: clip.scaleX, scaleY: clip.scaleY,
    rotation: clip.rotation, opacity: 1,
  }, t)
}

/** Pose of a sticker at timeline time t. Same absolute-fraction convention as
 *  text: x/y place the asset's centre on the canvas. */
export function stickerTransformAt(clip: StickerClip, t: number): SceneTransform {
  return transformAt(clip.keyframes ?? [], {
    x: clip.x, y: clip.y,
    scaleX: clip.scaleX, scaleY: clip.scaleY,
    rotation: clip.rotation, opacity: clip.opacity,
  }, t)
}

export function isActiveAt(layer: SceneLayer, t: number): boolean {
  return t >= layer.start && t < layer.end
}