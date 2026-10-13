import { z } from 'zod'

// Single source of truth for the project data model. Types everywhere else are
// inferred from these schemas, so validation and TypeScript cannot drift.

export const MediaTypeSchema = z.enum(['video', 'audio', 'image'])

export const MediaFileSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  type: MediaTypeSchema,
  duration: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  thumbnail: z.string().optional(),
  size: z.number(),
})

export const KeyframeSchema = z.object({
  id: z.string(),
  time: z.number(),       // absolute project time in seconds
  property: z.string(),   // 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
  value: z.number(),
})

export const ClipSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  trackId: z.string(),
  startTime: z.number(),
  duration: z.number(),
  mediaStart: z.number(),
  mediaEnd: z.number(),
  speed: z.number(),
  volume: z.number(),
  muted: z.boolean(),
  reversed: z.boolean(),
  opacity: z.number(),
  x: z.number(),
  y: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotation: z.number(),
  filter: z.string().optional(),
  brightness: z.number(),
  contrast: z.number(),
  saturation: z.number(),
  exposure: z.number(),
  highlights: z.number(),
  shadows: z.number(),
  temperature: z.number(),
  tint: z.number(),
  sharpness: z.number(),
  chromaEnabled: z.boolean(),
  chromaColor: z.string(),
  chromaTolerance: z.number(),
  stabilize: z.boolean(),
  effects: z.array(z.object({ id: z.string(), intensity: z.number() })).default([]),
  keyframes: z.array(KeyframeSchema).default([]),
})

export const TextClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  startTime: z.number(),
  duration: z.number(),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontColor: z.string(),
  backgroundColor: z.string(),
  backgroundOpacity: z.number(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  animation: z.string().optional(),
  outAnimation: z.string().optional(),
  style: z.string().optional(),
  letterSpacing: z.number(),
  lineHeight: z.number(),
  strokeColor: z.string(),
  strokeWidth: z.number(),
  shadowColor: z.string(),
  shadowBlur: z.number(),
  shadowX: z.number(),
  shadowY: z.number(),
  keyframes: z.array(KeyframeSchema).default([]),
})

export const StickerClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  startTime: z.number(),
  duration: z.number(),
  src: z.string(),
  x: z.number(),
  y: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotation: z.number(),
  opacity: z.number(),
  animation: z.string().optional(),
})

export const AudioClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  mediaId: z.string(),
  startTime: z.number(),
  duration: z.number(),
  mediaStart: z.number(),
  mediaEnd: z.number(),
  volume: z.number(),
  muted: z.boolean(),
  fadein: z.number(),
  fadeout: z.number(),
  speed: z.number(),
  pitch: z.number(),
  keyframes: z.array(KeyframeSchema).default([]),
})

export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio', 'text', 'sticker', 'fx']),
  label: z.string(),
  muted: z.boolean(),
  locked: z.boolean(),
  height: z.number(),
})

export const TransitionSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  type: z.string(),
  duration: z.number(),
})

export const CaptionSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  language: z.string().optional(),
})

// No updatedAt: it was written once at creation and never maintained. The
// envelope's savedAt is the honest timestamp.
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  backgroundColor: z.string(),
  media: z.array(MediaFileSchema),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema),
  textClips: z.array(TextClipSchema),
  stickerClips: z.array(StickerClipSchema),
  audioClips: z.array(AudioClipSchema),
  transitions: z.array(TransitionSchema),
  captions: z.array(CaptionSchema),
})

export const CURRENT_SCHEMA_VERSION = 3

export const ProjectFileSchema = z.object({
  app: z.literal('capjul'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  savedAt: z.number(),
  appVersion: z.string(),
  project: ProjectSchema,
})

export type Keyframe = z.infer<typeof KeyframeSchema>
export type MediaType = z.infer<typeof MediaTypeSchema>
export type MediaFile = z.infer<typeof MediaFileSchema>
export type Clip = z.infer<typeof ClipSchema>
export type TextClip = z.infer<typeof TextClipSchema>
export type StickerClip = z.infer<typeof StickerClipSchema>
export type AudioClip = z.infer<typeof AudioClipSchema>
export type Track = z.infer<typeof TrackSchema>
export type Transition = z.infer<typeof TransitionSchema>
export type Caption = z.infer<typeof CaptionSchema>
export type Project = z.infer<typeof ProjectSchema>
export type ProjectFile = z.infer<typeof ProjectFileSchema>
