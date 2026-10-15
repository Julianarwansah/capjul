import { buildCssFilter, colorAdjustFactors } from './color-adjust'
import { interpolate } from './keyframe-interpolate'
import { paintOrder } from './paint-order'
import type { Clip, Keyframe, Project, StickerClip, TextClip } from './project-schema'

// The Phase 2 scene model: a DOM-independent description of what the compositor
// must draw, in paint order. Both consumers of stacking order go through
// paintOrder() in ./paint-order, so the compositor and the preview cannot
// disagree about which clip is on top. No DOM types here so it stays testable in
// node.

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

export function compileScene(project: Project): Scene {
  const layers = paintOrder(project).map((item): SceneLayer => {
    const start = item.clip.startTime
    const end = start + item.clip.duration
    if (item.kind === 'text') return { kind: 'text', clip: item.clip, start, end }
    if (item.kind === 'sticker') return { kind: 'sticker', clip: item.clip, start, end }

    const clip = item.clip
    const base: SceneLayerBase = {
      mediaId: item.media.id,
      start,
      end,
      transform: {
        x: clip.x, y: clip.y,
        scaleX: clip.scaleX, scaleY: clip.scaleY,
        rotation: clip.rotation,
        opacity: clip.opacity,
      },
      keyframes: clip.keyframes ?? [],
      filter: [clip.filter ?? '', buildCssFilter(colorAdjustFactors(clip))].filter(Boolean).join(' '),
    }
    return item.media.type === 'image'
      ? { kind: 'image', ...base }
      : { kind: 'video', ...base, mediaStart: clip.mediaStart, speed: clip.speed || 1 }
  })

  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    duration: project.duration,
    background: project.backgroundColor,
    layers,
  }
}

/**
 * The one source-time formula. Every consumer resolves a clip's source position
 * through here, because the preview used to compute `t - start + mediaStart` by
 * hand in three places and drop the speed factor each time, while the compositor
 * multiplied by it - so a clip set to 2x played at normal speed in the preview
 * and exported at double speed (tech debt D22).
 */
function sourceTimeAt(mediaStart: number, start: number, speed: number, t: number): number {
  return mediaStart + (t - start) * speed
}

/** Source time a video layer must show at timeline time t. */
export function mediaTimeAt(layer: SceneVideoLayer, t: number): number {
  return sourceTimeAt(layer.mediaStart, layer.start, layer.speed, t)
}

/**
 * Source time a clip must show at timeline time t, before it has been compiled
 * into a layer. This is what the preview seeks with, and `compileScene` builds
 * `SceneVideoLayer.speed` with the same `|| 1` guard, so the two agree for every
 * clip including a degenerate speed of 0.
 */
export function clipMediaTimeAt(clip: Clip, t: number): number {
  return sourceTimeAt(clip.mediaStart, clip.startTime, clip.speed || 1, t)
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
 * The order a resolved pose's operations must be applied. Shared by the
 * preview's CSS transform string and the compositor's canvas call sequence,
 * which is `ctx.translate`, `ctx.rotate`, `ctx.scale` in `drawMediaLayer` and
 * `drawText` alike.
 *
 * This order is load-bearing. Rotation and non-uniform scale do not commute, so
 * composing them the other way round on one side makes the two disagree whenever
 * scaleX !== scaleY and rotation !== 0 - and agree exactly when the scale is
 * uniform, which is why the mismatch once went unnoticed. See
 * docs/tech-debt.md, D18 (resolved).
 */
export const POSE_TRANSFORM_ORDER = ['translate', 'rotate', 'scale'] as const

/**
 * CSS transform string for a media layer pose, in POSE_TRANSFORM_ORDER.
 *
 * A CSS transform list composes left to right, so emitting the operations in
 * this order yields the same T·R·S matrix the canvas builds from the same call
 * sequence. The translate percentages are relative to the element's own box, and
 * that box fills the canvas, so they are canvas fractions in exactly the sense
 * the compositor means by `tr.x * W`.
 */
export function poseTransformCss(tf: SceneTransform): string {
  return `translate(${tf.x * 100}%, ${tf.y * 100}%) rotate(${tf.rotation}deg) scale(${tf.scaleX}, ${tf.scaleY})`
}

/**
 * Pose of a media clip at timeline time t. A media layer's x/y are offsets from
 * the canvas centre, unlike text and stickers whose x/y are absolute fractions.
 * A null clip resolves to the identity pose so callers can render a placeholder
 * without a special case.
 */
export function clipTransformAt(clip: Clip | null, t: number): SceneTransform {
  if (!clip) return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  return transformAt(clip.keyframes ?? [], {
    x: clip.x, y: clip.y,
    scaleX: clip.scaleX, scaleY: clip.scaleY,
    rotation: clip.rotation, opacity: clip.opacity,
  }, t)
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