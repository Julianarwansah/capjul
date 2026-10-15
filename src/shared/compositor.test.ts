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
  const state = { filter: '', globalAlpha: 1, fillStyle: '' }
  const ctx = {
    // Assigned properties are logged too: a blend is mostly a sequence of
    // globalAlpha and filter writes, and a plain field would hide the order.
    get filter() { return state.filter },
    set filter(v: string) { state.filter = v; log.push(`filter=${v}`) },
    get globalAlpha() { return state.globalAlpha },
    set globalAlpha(v: number) { state.globalAlpha = v; log.push(`alpha=${round(v)}`) },
    get fillStyle() { return state.fillStyle },
    set fillStyle(v: string) { state.fillStyle = v },
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    setTransform: (...a: number[]) => log.push(`setTransform(${a.join(',')})`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      log.push(`fillRect(${[x, y, w, h].map(round).join(',')})`),
    translate: (x: number, y: number) => log.push(`translate(${round(x)},${round(y)})`),
    rotate: (r: number) => log.push(`rotate(${round(r)})`),
    scale: (x: number, y: number) => log.push(`scale(${round(x)},${round(y)})`),
    drawImage: (el: unknown, ...rest: number[]) =>
      log.push(`drawImage(${(el as { __name?: string }).__name},${rest.map(round).join(',')})`),
    createRadialGradient: (...a: number[]) => {
      log.push(`radial(${a.map(round).join(',')})`)
      return { addColorStop: (o: number, c: string) => log.push(`stop(${round(o)},${c})`) }
    },
    beginPath: () => log.push('beginPath'),
    rect: (...a: number[]) => log.push(`rect(${a.map(round).join(',')})`),
    clip: () => log.push('clip'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, state }
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
    captions: new Map(),
  }
}

describe('drawSceneFrame', () => {
  it('clears to the scene background under an identity transform', () => {
    const p = project({ clips: [clip()] })
    const { ctx, log, state } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log.slice(0, 5)).toEqual([
      'save',
      'filter=none',
      'alpha=1',
      'setTransform(1,0,0,1,0,0)',
      'fillRect(0,0,1280,720)',
    ])
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

describe('drawSceneFrame with a transition', () => {
  /** A 0..4 and B 4..7 on one track, with a 1s transition straddling the cut at
   *  t=4, so the blend window is [3.5, 4.5]. */
  function blending(type: string) {
    return project({
      duration: 7,
      clips: [
        clip({ id: 'A', mediaId: 'm1', trackId: 't0', startTime: 0, duration: 4 }),
        clip({ id: 'B', mediaId: 'm2', trackId: 't0', startTime: 4, duration: 3 }),
      ],
      transitions: [{ id: 'tr1', clipId: 'A', type, duration: 1 }],
    })
  }
  const draws = (log: string[]) => log.filter(l => l.startsWith('drawImage'))
  const alphas = (log: string[]) => log.filter(l => l.startsWith('alpha='))

  it('draws both clips of the blend, outgoing first, at the midpoint', () => {
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(blending('fade')), sourcesFor(blending('fade')), 4)
    expect(draws(log).map(d => /^drawImage\(([^,)]+)/.exec(d)?.[1])).toEqual(['m1', 'm2'])
    // The reset to 1 for the background, then half of each clip.
    expect(alphas(log)).toEqual(['alpha=1', 'alpha=0.5', 'alpha=0.5'])
  })

  it('fades from wholly outgoing to wholly incoming across the window', () => {
    for (const [t, a, b] of [[3.5, 1, 0], [4.5, 0, 1]] as const) {
      const p = blending('fade')
      const { ctx, log } = mockCtx()
      drawSceneFrame(ctx, compileScene(p), sourcesFor(p), t)
      expect(alphas(log)).toEqual(['alpha=1', `alpha=${a}`, `alpha=${b}`])
    }
  })

  it('draws the incoming clip before its own time range begins', () => {
    // At 3.6 clip B does not start until 4; without the transition it would not
    // be drawn at all and the blend would show a hole.
    const p = blending('fade')
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 3.6)
    expect(draws(log)).toHaveLength(2)
  })

  it('hard-cuts outside the blend window', () => {
    const p = blending('fade')
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 2)
    expect(draws(log).map(d => /^drawImage\(([^,)]+)/.exec(d)?.[1])).toEqual(['m1'])
    expect(alphas(log)).toEqual(['alpha=1', 'alpha=1'])
  })

  it('clips each half of a wipe to complementary halves of the frame', () => {
    const p = blending('wipe-left')
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 4)
    expect(log.filter(l => l.startsWith('rect('))).toEqual([
      'rect(0,0,640,720)',
      'rect(640,0,640,720)',
    ])
    // Every clip is preceded by beginPath and followed by clip, or the rect is
    // decoration rather than a clip.
    expect(log.filter(l => l === 'clip')).toHaveLength(2)
  })

  it('slides the two halves in opposite directions by canvas widths', () => {
    const p = blending('slide-left')
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 4)
    // Outgoing half a width left, incoming half a width right of its own origin.
    expect(log).toContain('translate(-640,0)')
    expect(log).toContain('translate(640,0)')
  })

  it('applies the transition blur through the context filter at canvas scale', () => {
    const p = blending('blur')
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 4.5)
    // At progress 1 the outgoing side carries the full radius: 16/1280 * 1280.
    expect(log).toContain('filter=blur(16px)')
  })
})

describe('drawSceneFrame overlay effects', () => {
  const withEffects = (effects: Array<{ id: string; intensity: number }>) =>
    project({ clips: [clip({ effects })] })

  it('draws letterbox bars as a fraction of canvas height, top and bottom', () => {
    const p = withEffects([{ id: 'letterbox', intensity: 1 }])
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    // 0.12 of 720 = 86.4 per bar.
    expect(log).toContain('fillRect(0,0,1280,86.4)')
    expect(log).toContain('fillRect(0,633.6,1280,86.4)')
  })

  it('scales letterbox with intensity', () => {
    const p = withEffects([{ id: 'letterbox', intensity: 0.5 }])
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log).toContain('fillRect(0,0,1280,43.2)')
  })

  it('draws the vignette as a scaled circular gradient with the shared stops', () => {
    const p = withEffects([{ id: 'vignette', intensity: 1 }])
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    // The context is scaled by the ellipse axis ratio, then a circle of the
    // y-radius is gradient-filled: the same ellipse the preview's CSS radii name.
    expect(log).toContain(`scale(${round(1280 / 720)},1)`)
    expect(log).toContain(`radial(0,0,0,0,0,${round(Math.SQRT2 / 2 * 720)})`)
    expect(log).toContain('stop(0.3,rgba(0,0,0,0))')
    expect(log).toContain('stop(1,rgba(0,0,0,0.85))')
  })

  it('draws nothing for grain, which has no canvas counterpart', () => {
    const plain = withEffects([])
    const grainy = withEffects([{ id: 'grain', intensity: 1 }])
    const a = mockCtx()
    const b = mockCtx()
    drawSceneFrame(a.ctx, compileScene(plain), sourcesFor(plain), 1)
    drawSceneFrame(b.ctx, compileScene(grainy), sourcesFor(grainy), 1)
    expect(b.log).toEqual(a.log)
  })

  it('reads overlay effects from the bottom media layer only', () => {
    // An overlay clip carrying letterbox must not bar the frame: the preview
    // reads effects from the clip at the bottom of the paint stack, and the two
    // must agree about whose effects these are.
    const p = project({
      clips: [clip({ id: 'base', trackId: 't0' }), clip({ id: 'over', trackId: 't1', effects: [{ id: 'letterbox', intensity: 1 }] })],
    })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 1)
    expect(log.filter(l => l.startsWith('fillRect'))).toEqual(['fillRect(0,0,1280,720)'])
  })
})

describe('drawSceneFrame chroma key', () => {
  const keyed = { __name: 'keyed-m1' } as unknown as HTMLCanvasElement

  it('draws the keyed copy of a chroma layer, not the raw frame', () => {
    const p = project({ clips: [clip({ chromaEnabled: true })] })
    const sources = sourcesFor(p)
    let asked: string | null = null
    sources.keyedFrame = (layer, _el, w, h) => {
      asked = `${layer.mediaId}@${w}x${h}`
      return keyed
    }
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 1)
    expect(asked).toBe('m1@1920x1080')
    expect(log.filter(l => l.startsWith('drawImage'))).toEqual(['drawImage(keyed-m1,-640,-360,1280,720)'])
  })

  it('falls back to the raw frame when keying is unavailable', () => {
    const p = project({ clips: [clip({ chromaEnabled: true })] })
    const sources = sourcesFor(p)
    sources.keyedFrame = () => null
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 1)
    expect(log.filter(l => l.startsWith('drawImage'))).toEqual(['drawImage(m1,-640,-360,1280,720)'])
  })

  it('never asks for a keyed copy of a layer that is not keyed', () => {
    const p = project({ clips: [clip()] })
    const sources = sourcesFor(p)
    let asked = 0
    sources.keyedFrame = () => { asked++; return keyed }
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 1)
    expect(asked).toBe(0)
    expect(log.filter(l => l.startsWith('drawImage'))).toEqual(['drawImage(m1,-640,-360,1280,720)'])
  })
})

describe('drawSceneFrame captions', () => {
  const raster = (name: string, w = 200, h = 50) =>
    ({ __name: name, width: w, height: h }) as unknown as HTMLCanvasElement
  const withCaption = (over: Partial<Project> = {}) =>
    project({ captions: [{ id: 'cap1', startTime: 1, endTime: 3, text: 'hi' }], ...over })

  it('draws an active caption centred horizontally at its anchor', () => {
    const p = withCaption()
    const sources = sourcesFor(p)
    sources.captions.set('cap1', { raster: raster('cap1'), y: 0.8 })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 2)
    expect(log).toContain('translate(640,576)')
    expect(log).toContain('drawImage(cap1,-100,-25)')
  })

  it('draws nothing for a caption outside its window', () => {
    const p = withCaption()
    const sources = sourcesFor(p)
    sources.captions.set('cap1', { raster: raster('cap1'), y: 0.8 })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 4)
    expect(log.filter(l => l.includes('cap1'))).toEqual([])
  })

  it('draws captions above overlay effects, so subtitles sit on top', () => {
    const p = withCaption({
      clips: [clip({ effects: [{ id: 'letterbox', intensity: 1 }] })],
    })
    const sources = sourcesFor(p)
    sources.captions.set('cap1', { raster: raster('cap1'), y: 0.8 })
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sources, 2)
    const bars = log.findIndex(l => l === 'fillRect(0,0,1280,86.4)')
    const caption = log.findIndex(l => l.startsWith('drawImage(cap1'))
    expect(bars).toBeGreaterThan(-1)
    expect(caption).toBeGreaterThan(bars)
  })

  it('skips a caption whose raster is missing rather than throwing', () => {
    const p = withCaption()
    const { ctx, log } = mockCtx()
    drawSceneFrame(ctx, compileScene(p), sourcesFor(p), 2)
    expect(log.filter(l => l.includes('cap1'))).toEqual([])
  })

  it('drops a caption whose window is inverted at compile time', () => {
    const p = project({ captions: [{ id: 'bad', startTime: 5, endTime: 2, text: 'x' }] })
    expect(compileScene(p).captions).toEqual([])
  })
})
