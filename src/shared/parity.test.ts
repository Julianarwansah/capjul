import { describe, expect, it } from 'vitest'
import { buildCssFilter, buildFfmpegColorChain, colorAdjustFactors } from './color-adjust'
import { layoutText } from './text-layout'
import { stickerPlacement } from './text-rasterizer'
import { STICKER_BASE_RATIO } from './sticker-assets'
import { overlayOrigin, type RenderLayer } from './render-plan'
import { clipTransformAt, compileScene, textTransformAt, transformAt } from './scene'
import type { SceneImageLayer, SceneVideoLayer } from './scene'
import type { Clip, MediaFile, Project, StickerClip, TextClip } from './project-schema'

// Parity here is structural, not pixel-level: CSS rasterization and canvas
// rasterization will never be pixel-identical, so a pixel diff would measure
// the wrong thing. What can be pinned is that both sides derive from the same
// numbers and the same geometry. These tests are the harness for that.

const W = 1920
const H = 1080

describe('color parity', () => {
  const source = { brightness: 20, contrast: -10, saturation: 50 }

  it('derives one set of factors for both backends', () => {
    expect(colorAdjustFactors(source)).toEqual({ brightness: 1.2, contrast: 0.9, saturation: 1.5 })
  })

  it('encodes the same numbers as CSS and as ffmpeg', () => {
    const f = colorAdjustFactors(source)
    expect(buildCssFilter(f)).toBe('brightness(1.2) contrast(0.9) saturate(1.5)')
    expect(buildFfmpegColorChain(f)).toEqual([
      'colorchannelmixer=rr=1.2:gg=1.2:bb=1.2',
      'eq=contrast=0.9:saturation=1.5',
    ])
  })

  it('emits nothing on either side when neutral', () => {
    const f = colorAdjustFactors({ brightness: 0, contrast: 0, saturation: 0 })
    expect(buildCssFilter(f)).toBe('')
    expect(buildFfmpegColorChain(f)).toEqual([])
  })
})

describe('text parity', () => {
  const clip: TextClip = {
    id: 't', trackId: 'st', startTime: 0, duration: 5, text: 'Two\nlines',
    fontFamily: 'Arial', fontSize: 72, fontColor: '#fff',
    backgroundColor: 'transparent', backgroundOpacity: 0,
    bold: false, italic: false, underline: false, align: 'center',
    x: 0.3, y: 0.7, rotation: 0, scaleX: 1, scaleY: 1,
    letterSpacing: 0, lineHeight: 1.2,
    strokeColor: 'transparent', strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
    keyframes: [],
  }

  it('centres the block where the preview CSS centres it', () => {
    // Preview: left/top = x/y as canvas percentages with translate(-50%,-50%).
    const layout = layoutText(clip, W, H, t => t.length * clip.fontSize * 0.6)
    expect(layout.boxX + layout.boxW / 2).toBeCloseTo(clip.x * W)
    expect(layout.boxY + layout.boxH / 2).toBeCloseTo(clip.y * H)
  })

  it('draws at the clip font size in canvas pixels, the value the preview expresses as a canvas fraction', () => {
    const layout = layoutText(clip, W, H, t => t.length * clip.fontSize * 0.6)
    expect(layout.fontSize).toBe(clip.fontSize)
    // preview: fontSize/canvasH as cqh; at export resolution that is clip.fontSize px
    expect(layout.fontSize / H).toBeCloseTo(clip.fontSize / H)
  })

  it('lands the text box centre where the preview puts it, keyframes included', () => {
    // rasterizeTextCentred lays out against a zero-sized canvas, which puts the
    // box centre on the origin - that is what makes the raster's own centre the
    // box centre, so drawImage(raster, -w/2, -h/2) is the preview's -50%,-50%.
    const layout = layoutText({ ...clip, x: 0.5, y: 0.5 }, 0, 0, t => t.length * clip.fontSize * 0.6)
    expect(layout.boxX + layout.boxW / 2).toBeCloseTo(0)
    expect(layout.boxY + layout.boxH / 2).toBeCloseTo(0)

    // drawText then translates by (x*W, y*H), so a keyframed x moves the box.
    const kfs = [{ id: 'k', time: 0, property: 'x', value: 0.9 }]
    const tr = textTransformAt({ ...clip, keyframes: kfs }, 0)
    expect(tr.x * W).toBeCloseTo(0.9 * W)
    expect(tr.y * H).toBeCloseTo(clip.y * H)
  })
})

describe('sticker parity', () => {
  const clip: StickerClip = {
    id: 's', trackId: 'st', startTime: 0, duration: 3, src: 'star',
    x: 0.25, y: 0.75, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1,
    keyframes: [],
  }

  it('sizes and centres like the preview cqh width and translate(-50%,-50%)', () => {
    const p = stickerPlacement(clip, W, H)
    // preview width: STICKER_BASE_RATIO * 100 * scaleX, in cqh
    expect(p.w / H).toBeCloseTo(STICKER_BASE_RATIO * clip.scaleX)
    expect(p.cx).toBe(clip.x * W)
    expect(p.cy).toBe(clip.y * H)
  })
})

describe('clip transform parity', () => {
  const layer = (over: Partial<RenderLayer> = {}): RenderLayer => ({
    inputId: 'in0', kind: 'video', z: 0, start: 0, end: 1, mediaStart: 0, mediaEnd: 1,
    speed: 1, opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1,
    brightness: 0, contrast: 0, saturation: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    reversed: false,
    ...over,
  })

  it('matches the preview transform: scale about centre, then translate by a fraction of the unscaled box', () => {
    const l = layer({ x: -0.2, y: 0.1, scaleX: 0.5, scaleY: 0.5 })
    const centreX = W / 2 + l.x * W
    const centreY = H / 2 + l.y * H
    const o = overlayOrigin(l, W, H)
    expect(o.x).toBe(Math.round(centreX - (W * l.scaleX) / 2))
    expect(o.y).toBe(Math.round(centreY - (H * l.scaleY) / 2))
  })

  it('is the top-left corner for an untransformed clip', () => {
    expect(overlayOrigin(layer(), W, H)).toEqual({ x: 0, y: 0 })
  })
})

describe('media layer pose parity', () => {
  // The preview resolves a media clip's pose with clipTransformAt; the export
  // compositor resolves the compiled layer's with transformAt. Both must land on
  // the same numbers, for images exactly as for video - an image clip that the
  // user moves, scales, rotates or keyframes has to export as previewed (D17).
  const mediaClip = (over: Partial<Clip> = {}): Clip => ({
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 4, mediaStart: 0, mediaEnd: 4,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
    effects: [], keyframes: [],
    ...over,
  })

  const media = (type: MediaFile['type']): MediaFile => ({
    id: 'm1', path: `/tmp/a.${type === 'image' ? 'png' : 'mp4'}`, name: 'a', type,
    duration: type === 'image' ? 0 : 10, size: 1,
  })

  const withClip = (type: MediaFile['type'], over: Partial<Clip> = {}): Project => ({
    id: 'p', name: 'P', createdAt: 0, duration: 4,
    width: W, height: H, fps: 30, backgroundColor: '#000',
    media: [media(type)],
    tracks: [{ id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 }],
    clips: [mediaClip(over)],
    textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [],
  })

  const POSE = { x: 0.2, y: -0.15, scaleX: 1.5, scaleY: 0.5, rotation: 30, opacity: 0.7 }
  const KEYFRAMES = [
    { id: 'k1', property: 'x', time: 0, value: -0.4 },
    { id: 'k2', property: 'x', time: 4, value: 0.4 },
    { id: 'k3', property: 'opacity', time: 2, value: 0.1 },
  ]

  it('compiles image and video layers through the same base shape', () => {
    const image = compileScene(withClip('image', POSE)).layers[0] as SceneImageLayer
    const video = compileScene(withClip('video', POSE)).layers[0] as SceneVideoLayer
    expect(image.kind).toBe('image')
    expect(video.kind).toBe('video')
    // Same transform, same keyframes - only the video-only fields differ.
    expect(image.transform).toEqual(video.transform)
    expect(image.keyframes).toEqual(video.keyframes)
  })

  for (const type of ['image', 'video'] as const) {
    it(`resolves a ${type} clip to the same pose on both sides`, () => {
      const clip = mediaClip(POSE)
      const layer = compileScene(withClip(type, POSE)).layers[0] as SceneImageLayer | SceneVideoLayer
      // Export: compositor.ts draws with transformAt(layer.keyframes, layer.transform, t).
      const exportPose = transformAt(layer.keyframes, layer.transform, 1.5)
      // Preview: MediaLayers resolves with clipTransformAt(clip, t).
      expect(clipTransformAt(clip, 1.5)).toEqual(exportPose)
    })

    it(`resolves a keyframed ${type} clip to the same pose on both sides`, () => {
      const clip = mediaClip({ ...POSE, keyframes: KEYFRAMES })
      const layer = compileScene(withClip(type, { ...POSE, keyframes: KEYFRAMES })).layers[0] as
        | SceneImageLayer | SceneVideoLayer
      const exportPose = transformAt(layer.keyframes, layer.transform, 1)
      const previewPose = clipTransformAt(clip, 1)
      expect(previewPose).toEqual(exportPose)
      // And the keyframe actually moved x away from the static value:
      // a quarter of the way from -0.4 to 0.4 at t=1 of a 0..4 span.
      expect(previewPose.x).not.toBeCloseTo(POSE.x)
      expect(previewPose.x).toBeCloseTo(-0.2)
    })
  }

  it('falls back to the static pose with no keyframes, so both sides stay equal', () => {
    const clip = mediaClip(POSE)
    const layer = compileScene(withClip('image', POSE)).layers[0] as SceneImageLayer
    expect(clipTransformAt(clip, 0)).toEqual(transformAt(layer.keyframes, layer.transform, 0))
    expect(clipTransformAt(clip, 0)).toMatchObject(POSE)
  })
})
