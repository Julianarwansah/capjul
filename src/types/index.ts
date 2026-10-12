export type MediaType = 'video' | 'audio' | 'image'

export interface MediaFile {
  id: string
  path: string
  name: string
  type: MediaType
  duration: number
  width?: number
  height?: number
  thumbnail?: string
  size: number
}

export interface Clip {
  id: string
  mediaId: string
  trackId: string
  startTime: number      // position on timeline (seconds)
  duration: number       // clip duration on timeline
  mediaStart: number     // trim start from source
  mediaEnd: number       // trim end from source
  speed: number          // 0.1 - 10
  volume: number         // 0 - 1
  muted: boolean
  reversed: boolean
  opacity: number        // 0 - 1
  // Transform
  x: number; y: number
  scaleX: number; scaleY: number
  rotation: number
  // Color/Filter
  filter?: string
  brightness: number; contrast: number; saturation: number
  exposure: number; highlights: number; shadows: number
  temperature: number; tint: number; sharpness: number
  // Chroma key
  chromaEnabled: boolean; chromaColor: string; chromaTolerance: number
  // Stabilization
  stabilize: boolean
}

export interface TextClip {
  id: string
  trackId: string
  startTime: number
  duration: number
  text: string
  fontFamily: string
  fontSize: number
  fontColor: string
  backgroundColor: string
  backgroundOpacity: number
  bold: boolean; italic: boolean; underline: boolean
  align: 'left' | 'center' | 'right'
  x: number; y: number
  rotation: number
  scaleX: number; scaleY: number
  animation?: string
  outAnimation?: string
  style?: string          // preset style id
  letterSpacing: number
  lineHeight: number
  strokeColor: string; strokeWidth: number
  shadowColor: string; shadowBlur: number; shadowX: number; shadowY: number
}

export interface StickerClip {
  id: string
  trackId: string
  startTime: number
  duration: number
  src: string
  x: number; y: number
  scaleX: number; scaleY: number
  rotation: number
  opacity: number
  animation?: string
}

export interface AudioClip {
  id: string
  trackId: string
  mediaId: string
  startTime: number
  duration: number
  mediaStart: number
  mediaEnd: number
  volume: number
  muted: boolean
  fadein: number
  fadeout: number
  speed: number
  pitch: number
}

export type Track = {
  id: string
  type: 'video' | 'audio' | 'text' | 'sticker' | 'fx'
  label: string
  muted: boolean
  locked: boolean
  height: number
}

export interface Transition {
  id: string
  clipId: string           // clip after which transition plays
  type: string
  duration: number
}

export interface Caption {
  id: string
  startTime: number
  endTime: number
  text: string
  language?: string
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  duration: number
  width: number
  height: number
  fps: number
  backgroundColor: string
  media: MediaFile[]
  tracks: Track[]
  clips: Clip[]
  textClips: TextClip[]
  stickerClips: StickerClip[]
  audioClips: AudioClip[]
  transitions: Transition[]
  captions: Caption[]
}

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '2:1' | '2.35:1' | '1.85:1'

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm'
  resolution: '4K' | '2K' | '1080p' | '720p' | '480p' | '360p'
  fps: 24 | 25 | 30 | 50 | 60
  videoBitrate: string
  audioBitrate: string
}

export type LeftPanelTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'filters' | 'transitions' | 'ai' | 'templates'

export interface FfprobeStream {
  codec_type: 'video' | 'audio' | 'data' | string
  width?: number
  height?: number
  r_frame_rate?: string
  duration?: string
  codec_name?: string
}

export interface FfprobeResult {
  streams: FfprobeStream[]
  format: {
    duration?: string
    size?: string
    bit_rate?: string
    filename?: string
  }
}

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
