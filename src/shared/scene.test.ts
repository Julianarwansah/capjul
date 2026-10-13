import { describe, expect, it } from 'vitest'
import { compileScene, isActiveAt, mediaTimeAt } from './scene'
import type { Clip, Project, StickerClip, TextClip } from './project-schema'

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 3, mediaStart: 1, mediaEnd: 4,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
    ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 6,
    width: 1280, height: 720, fps: 30, backgroundColor: '#000000',
    media: [{ id: 'm1', path: '/tmp/a.mp4', name: 'a', type: 'video', duration: 10, size: 1 }],
    tracks: [
      { id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 },
      { id: 't1', type: 'video', label: 'Top', muted: false, locked: false, height: 64 },
    ],
    clips: [], textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [],
    ...over,
  }
}

const text = (over: Partial<TextClip> = {}): TextClip => ({
  id: 'tx1', trackId: 'phantom-text', startTime: 1, duration: 2, text: 'Hi',
  fontFamily: 'Arial', fontSize: 48, fontColor: '#fff',
  backgroundColor: 'transparent', backgroundOpacity: 0,
  bold: false, italic: false, underline: false, align: 'center',
  x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
  letterSpacing: 0, lineHeight: 1.2,
  strokeColor: 'transparent', strokeWidth: 0,
  shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
  ...over,
})

const sticker = (over: Partial<StickerClip> = {}): StickerClip => ({
  id: 'st1', trackId: 'phantom-sticker', startTime: 2, duration: 2, src: 'star',
  x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  ...over,
})

describe('compileScene', () => {
  it('paints video tracks in track order and overlays above unknown tracks', () => {
    const scene = compileScene(project({
      clips: [clip({ trackId: 't1' }), clip({ id: 'c2', trackId: 't0', startTime: 4 })],
      textClips: [text()],
      stickerClips: [sticker()],
    }))
    expect(scene.layers.map(l => l.kind)).toEqual(['video', 'video', 'text', 'sticker'])
  })

  it('skips clips whose media is missing', () => {
    const scene = compileScene(project({ clips: [clip({ mediaId: 'gone' })] }))
    expect(scene.layers).toEqual([])
  })

  it('carries the preview filter string, presets and numeric adjust together', () => {
    const scene = compileScene(project({
      clips: [clip({ filter: 'sepia(0.4)', brightness: 20, contrast: 0, saturation: 0 })],
    }))
    const layer = scene.layers[0]
    expect(layer.kind).toBe('video')
    if (layer.kind === 'video') expect(layer.filter).toBe('sepia(0.4) brightness(1.2)')
  })

  it('keeps image media as image layers', () => {
    const scene = compileScene(project({
      media: [{ id: 'm1', path: '/tmp/a.png', name: 'a', type: 'image', duration: 0, size: 1 }],
      clips: [clip()],
    }))
    expect(scene.layers[0].kind).toBe('image')
  })
})

describe('timing', () => {
  it('maps timeline time through speed into source time', () => {
    const layer = { mediaStart: 10, start: 2, speed: 2 } as const
    expect(mediaTimeAt(layer as never, 3)).toBe(12)
  })

  it('is active on [start, end)', () => {
    const layer = { start: 1, end: 3 } as never
    expect(isActiveAt(layer, 0.99)).toBe(false)
    expect(isActiveAt(layer, 1)).toBe(true)
    expect(isActiveAt(layer, 2.99)).toBe(true)
    expect(isActiveAt(layer, 3)).toBe(false)
  })
})
