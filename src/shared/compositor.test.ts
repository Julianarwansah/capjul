import { describe, expect, it } from 'vitest'
import { drawSceneFrame, type SceneSources } from './compositor'
import { compileScene } from './scene'
import type { Clip, Project } from './project-schema'

// A recording canvas context. The export's draw path used to be reachable only
// through prepareScene, which needs a live DOM, so nothing tested what an
// exported frame actually contains. This stands in for the real context and
// keeps the call sequence, which is the behaviour.
function mockCtx() {
  const log: string[] = []
  const ctx = {
    filter: '',
    globalAlpha: 1,
    fillStyle: '',
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    setTransform: (...a: number[]) => log.push(`setTransform(${a.join(',')})`),
    fillRect: (x: number, y: number, w: number, h: number) => log.push(`fillRect(${x},${y},${w},${h})`),
    translate: (x: number, y: number) => log.push(`translate(${round(x)},${round(y)})`),
    rotate: (r: number) => log.push(`rotate(${round(r)})`),
    scale: (x: number, y: number) => log.push(`scale(${round(x)},${round(y)})`),
    drawImage: (el: unknown, ...rest: number[]) =>
      log.push(`drawImage(${(el as { __name?: string }).__name},${rest.map(round).join(',')})`),
    beginPath: () => log.push('beginPath'),
    rect: (...a: number[]) => log.push(`rect(${a.map(round).join(',')})`),
    clip: () => log.push('clip'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, state: ctx }
}
const round = (n: number) => Math.round(n * 1e6) / 1e6

function fakeVideo(name: string) {
  return { __name: name, videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement
}
function fakeImage(name: string) {
  return { __name: name, naturalWidth: 1920, naturalHeight: 1080 } as unknown as HTMLImageElement
}

function clip(over: Partial<Clip> = {}): Clip {
  return {
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
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 8,
    width: 1280, height: 720, fps: 30, backgroundColor: '#101010',
    media: [
      { id: 'm1', path: '/tmp/a.mp4', name: 'a', type: 'video', duration: 10, size: 1 },
      { id: 'm2', path: '/tmp/b.png', name: 'b', type: 'image', duration: 10, size: 1 },
    ],
    tracks: [
      { id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 },
      { id: 't1', type: 'video', label: 'Top', muted: false, locked: false, height: 64 },
    ],
    clips: [], textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [], markers: [],
    ...over,
  }
}

function sourcesFor(p: Project): SceneSources {
  return {
    videos: new Map(p.media.filter(m => m.type === 'video').map(m => [m.id, fakeVideo(m.id)])),
    images: new Map(p.media.filter(m => m.type === 'image').map(m => [m.id, fakeImage(m.id)])),
    textRasters: new Map(),
    stickers: new Map(),
  }
}

describe('drawSceneFrame', () => {
  it('clears to the scene background under an identity transform', () => {
    const p = project({ clips: [clip()] })
    const { ctx, log, state } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log[0]).toBe('save')
    expect(log[1]).toBe('setTransform(1,0,0,1,0,0)')
    expect(log[2]).toBe('fillRect(0,0,1280,720)')
    expect(state.fillStyle).toBe('#101010')
  })

  it('draws active layers in paint order, lowest first', () => {
    const p = project({ clips: [clip({ id: 'top', trackId: 't1', mediaId: 'm2' }), clip({ id: 'bottom', trackId: 't0' })] })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log.filter(l => l.startsWith('drawImage')).map(l => /^drawImage\(([^,)]+)/.exec(l)?.[1]))
      .toEqual(['m1', 'm2'])
  })

  it('skips layers that are not active at t', () => {
    const p = project({ clips: [clip(), clip({ id: 'late', startTime: 5, mediaId: 'm2' })] })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log.filter(l => l.startsWith('drawImage'))).toEqual(['drawImage(m1,-640,-360,1280,720)'])
  })

  it('skips a layer whose media has no drawable source', () => {
    const p = project({ clips: [clip()] })
    const sources = sourcesFor(p)
    sources.videos.clear()
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 1)
    expect(log.filter(l => l.startsWith('drawImage'))).toEqual([])
  })

  // The contain fit for a 1920x1080 source in a 1280x720 canvas: scale 2/3,
  // centred on the origin the pose translated to.
  it('fits the source into the canvas box, centred', () => {
    const p = project({ clips: [clip()] })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log).toContain('drawImage(m1,-640,-360,1280,720)')
  })

  it('applies the layer pose in translate, rotate, scale order', () => {
    const p = project({ clips: [clip({ x: 0.1, y: -0.2, rotation: 90, scaleX: 2, scaleY: 0.5 })] })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    // W/2 + x*W = 640 + 128 = 768; H/2 + y*H = 360 - 144 = 216.
    expect(log).toContain('translate(768,216)')
    const i = log.indexOf('translate(768,216)')
    expect(log[i + 1]).toBe(`rotate(${round(Math.PI / 2)})`)
    expect(log[i + 2]).toBe('scale(2,0.5)')
  })

  it('multiplies nothing into alpha for an opaque clip, and honours opacity', () => {
    const p = project({ clips: [clip({ opacity: 0.25 })] })
    const { ctx, log, state } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log).toContain('save')
    expect(state.globalAlpha).toBeCloseTo(0.25, 12)
  })

  it('sets the layer filter on the context when present', () => {
    const p = project({ clips: [clip({ brightness: 20 })] })
    const { ctx, state } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(state.filter).toBe('brightness(1.2)')
  })

  it('balances save and restore around every layer', () => {
    const p = project({ clips: [clip(), clip({ id: 'c2', trackId: 't1', mediaId: 'm2' })] })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log.filter(l => l === 'save').length).toBe(log.filter(l => l === 'restore').length)
  })
})
