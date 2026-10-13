// The data model lives in src/shared/project-schema.ts as zod schemas so that
// validation and TypeScript types cannot drift. This module re-exports those
// types for existing import sites and keeps the UI-only types.
export type {
  MediaType,
  MediaFile,
  Clip,
  TextClip,
  StickerClip,
  AudioClip,
  Track,
  Transition,
  Caption,
  Project,
  ProjectFile,
  Keyframe,
} from '../shared/project-schema'
export type { FfprobeStream, FfprobeResult } from '../shared/ffprobe'

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '2:1' | '2.35:1' | '1.85:1'

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm'
  resolution: '4K' | '2K' | '1080p' | '720p' | '480p' | '360p'
  fps: 24 | 25 | 30 | 50 | 60
  videoBitrate: string
  audioBitrate: string
}

export type LeftPanelTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'filters' | 'transitions' | 'ai' | 'templates'

// Superseded by ExportRequest in src/shared/ipc-contract.ts; removed when the
// export channel moves onto the typed contract.
export interface ExportOptions {
  inputs: Array<{ path: string; start: number; end: number }>
  duration: number
  width: number
  height: number
  fps: number
  videoBitrate: string
  audioBitrate: string
  format: string
}
