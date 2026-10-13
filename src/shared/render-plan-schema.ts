import { z } from 'zod'

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
