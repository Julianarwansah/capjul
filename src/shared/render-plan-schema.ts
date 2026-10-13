import { z } from 'zod'
import { KeyframeSchema, StickerClipSchema, TextClipSchema } from './project-schema'

// Validation for the render plan crossing IPC into main. Kept out of
// ipc-contract.ts and render-plan.ts so neither the preload nor the renderer
// bundle pulls zod in for it.
export const RenderPlanSchema = z.object({
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  duration: z.number(),
  background: z.string(),
  inputs: z.array(z.object({
    id: z.string(),
    path: z.string(),
    hasAudio: z.boolean().optional(),
  })),
  layers: z.array(z.object({
    inputId: z.string(),
    kind: z.enum(['video', 'image']),
    z: z.number(),
    start: z.number(),
    end: z.number(),
    mediaStart: z.number(),
    mediaEnd: z.number(),
    speed: z.number(),
    opacity: z.number(),
    x: z.number(),
    y: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
    brightness: z.number().default(0),
    contrast: z.number().default(0),
    saturation: z.number().default(0),
  })),
  overlays: z.array(z.object({
    png: z.string(),
    z: z.number(),
    start: z.number(),
    end: z.number(),
  })),
  audio: z.array(z.object({
    inputId: z.string(),
    start: z.number(),
    mediaStart: z.number(),
    mediaEnd: z.number(),
    speed: z.number(),
    volume: z.number(),
    fadein: z.number(),
    fadeout: z.number(),
    keyframes: z.array(KeyframeSchema).default([]),
  })),
  output: z.object({
    format: z.enum(['mp4', 'mov', 'webm']),
    videoBitrate: z.string(),
    audioBitrate: z.string(),
  }),
})

export const ExportPayloadSchema = z.object({
  plan: RenderPlanSchema,
  // Base64 PNGs, index-aligned with plan.overlays. Capped: a 1080p mostly
  // transparent layer compresses to well under this.
  overlayImages: z.array(z.string().max(4_000_000)).max(64),
})

const SceneTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotation: z.number(),
  opacity: z.number(),
})

const SceneLayerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('video'),
    mediaId: z.string(), start: z.number(), end: z.number(),
    transform: SceneTransformSchema, filter: z.string(),
    mediaStart: z.number(), speed: z.number(),
    keyframes: z.array(KeyframeSchema).default([]),
  }),
  z.object({
    kind: z.literal('image'),
    mediaId: z.string(), start: z.number(), end: z.number(),
    transform: SceneTransformSchema, filter: z.string(),
    keyframes: z.array(KeyframeSchema).default([]),
  }),
  z.object({ kind: z.literal('text'), clip: TextClipSchema, start: z.number(), end: z.number() }),
  z.object({ kind: z.literal('sticker'), clip: StickerClipSchema, start: z.number(), end: z.number() }),
])

export const SceneSchema = z.object({
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  duration: z.number(),
  background: z.string(),
  layers: z.array(SceneLayerSchema),
})

export const CompositedExportPayloadSchema = z.object({
  scene: SceneSchema,
  inputs: RenderPlanSchema.shape.inputs,
  audio: RenderPlanSchema.shape.audio,
  output: RenderPlanSchema.shape.output,
})
