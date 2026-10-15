import { describe, expect, it } from 'vitest'
import { OVERLAY_Z, activePaintAt, paintOrder } from './paint-order'
import { compileScene } from './scene'
import type { Clip, MediaFile, Project, StickerClip, TextClip, Track } from './project-schema'

function track(id: string, type: Track['type']): Track {
  return { id, type, label: id, muted: false, locked: false, height: 64 }
}

const media = (id: string, type: MediaFile['type'] = 'video'): MediaFile => ({
  id, path: `/tmp/${id}.mp4`, name: id, type, duration: 10, size: 1,
})

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 3, mediaStart: 0, mediaEnd: 3,
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

const text = (over: Partial<TextClip> = {}): TextClip => ({
  id: 'tx1', trackId: 't-text', startTime: 0, duration: 3, text: 'Hi',
  fontFamily: 'Arial', fontSize: 48, fontColor: '#fff',
  backgroundColor: 'transparent', backgroundOpacity: 0,
  bold: false, italic: false, underline: false, align: 'center',
  x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
  letterSpacing: 0, lineHeight: 1.2,
  strokeColor: 'transparent', strokeWidth: 0,
  shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
  keyframes: [],
  ...over,
})

const sticker = (over: Partial<StickerClip> = {}): StickerClip => ({
  id: 'st1', trackId: 't-sticker', startTime: 0, duration: 3, src: 'star',
  x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  keyframes: [],
  ...over,
})

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 6,
    width: 1280, height: 720, fps: 30, backgroundColor: '#000000',
    media: [media('m1'), media('m2'), media('img1', 'image')],
    tracks: [track('t0', 'video'), track('t1', 'video')],
    clips: [], textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [], markers: [],
    ...over,
  }
}

/** Paint order reduced to the labels a reader can check at a glance. */
const order = (p: Project) => paintOrder(p).map(i => `${i.kind}:${i.clip.id}`)

describe('paintOrder', () => {
  it('paints by track index, lowest track first', () => {
    expect(order(project({ clips: [
      clip({ id: 'top', trackId: 't1' }),
      clip({ id: 'bottom', trackId: 't0' }),
    ] }))).toEqual(['clip:bottom', 'clip:top'])
  })

  it('breaks ties within one track by start time, so a later clip covers an earlier one', () => {
    expect(order(project({ clips: [
      clip({ id: 'late', trackId: 't0', startTime: 4 }),
      clip({ id: 'early', trackId: 't0', startTime: 1 }),
    ] }))).toEqual(['clip:early', 'clip:late'])
  })

  it('sorts a clip on a track that is not in project.tracks above every real track', () => {
    const p = project({ clips: [
      clip({ id: 'ghost', trackId: 'no-such-track' }),
      clip({ id: 'real', trackId: 't1' }),
    ] })
    expect(order(p)).toEqual(['clip:real', 'clip:ghost'])
    expect(paintOrder(p).find(i => i.clip.id === 'ghost')?.z).toBe(OVERLAY_Z)
  })

  it('omits zero-length clips, which are never on screen', () => {
    expect(order(project({ clips: [clip({ duration: 0 })] }))).toEqual([])
  })

  it('omits clips whose media has been removed', () => {
    expect(order(project({ clips: [clip({ mediaId: 'gone' })] }))).toEqual([])
  })

  it('includes image clips alongside video clips', () => {
    expect(order(project({ clips: [
      clip({ id: 'img', mediaId: 'img1', trackId: 't1' }),
      clip({ id: 'vid', mediaId: 'm1', trackId: 't0' }),
    ] }))).toEqual(['clip:vid', 'clip:img'])
  })

  // The preview used to paint every text clip under every sticker clip because
  // it rendered two separate groups in a fixed DOM order. Stacking is a property
  // of the tracks, not of the kind of clip, so the order flips with the tracks.
  it('orders text and stickers by track, not by kind', () => {
    const textFirst = project({
      tracks: [track('t0', 'video'), track('t-text', 'text'), track('t-sticker', 'sticker')],
      textClips: [text()], stickerClips: [sticker()],
    })
    expect(order(textFirst)).toEqual(['text:tx1', 'sticker:st1'])

    // Adding the sticker before any text puts its track lower, so the text now
    // paints on top - the reverse of what a fixed text-then-sticker DOM gives.
    const stickerFirst = project({
      tracks: [track('t0', 'video'), track('t-sticker', 'sticker'), track('t-text', 'text')],
      textClips: [text()], stickerClips: [sticker()],
    })
    expect(order(stickerFirst)).toEqual(['sticker:st1', 'text:tx1'])
  })

  it('interleaves overlays with video by track rather than always on top', () => {
    const p = project({
      tracks: [track('t0', 'video'), track('t-text', 'text'), track('t1', 'video')],
      clips: [clip({ id: 'v0', trackId: 't0' }), clip({ id: 'v1', trackId: 't1' })],
      textClips: [text()],
    })
    expect(order(p)).toEqual(['clip:v0', 'text:tx1', 'clip:v1'])
  })

  // The preview took one clip per track with find(), so a second clip dragged on
  // top of the first was invisible there while the compositor painted both.
  it('keeps every clip on a track, including ones that overlap in time', () => {
    expect(order(project({ clips: [
      clip({ id: 'under', trackId: 't0', startTime: 0, duration: 4 }),
      clip({ id: 'over', trackId: 't0', startTime: 1, duration: 4 }),
    ] }))).toEqual(['clip:under', 'clip:over'])
  })

  it('does not order audio clips, which paint nothing', () => {
    const p = project({
      audioClips: [{
        id: 'a1', mediaId: 'm1', trackId: 't0', startTime: 0, duration: 3,
        mediaStart: 0, mediaEnd: 3, volume: 1, muted: false,
        fadein: 0, fadeout: 0, speed: 1, pitch: 0, keyframes: [],
      }],
    })
    expect(order(p)).toEqual([])
  })
})

describe('activePaintAt', () => {
  const p = project({ clips: [
    clip({ id: 'a', trackId: 't0', startTime: 0, duration: 2 }),
    clip({ id: 'b', trackId: 't0', startTime: 2, duration: 2 }),
  ] })

  it('is half-open, so clips meeting at a boundary never both paint', () => {
    expect(activePaintAt(p, 0).map(i => i.clip.id)).toEqual(['a'])
    expect(activePaintAt(p, 1.999).map(i => i.clip.id)).toEqual(['a'])
    expect(activePaintAt(p, 2).map(i => i.clip.id)).toEqual(['b'])
    expect(activePaintAt(p, 3.999).map(i => i.clip.id)).toEqual(['b'])
    expect(activePaintAt(p, 4)).toEqual([])
  })

  it('preserves paint order after filtering', () => {
    const q = project({
      clips: [clip({ id: 'early', trackId: 't0', startTime: 0, duration: 1 })],
      textClips: [text({ id: 'late', startTime: 3, duration: 1 })],
    })
    expect(activePaintAt(q, 0.5).map(i => i.clip.id)).toEqual(['early'])
    expect(activePaintAt(q, 3.5).map(i => i.clip.id)).toEqual(['late'])
  })
})

// The point of the extraction: the compositor and the preview must agree on what
// is on screen and in what order. Previously nothing tested that, because each
// side had its own derivation.
describe('agreement with compileScene', () => {
  const sceneKinds = (p: Project, t: number) =>
    compileScene(p).layers
      .filter(l => t >= l.start && t < l.end)
      .map(l => (l.kind === 'video' || l.kind === 'image' ? 'clip' : l.kind))

  const shapes: Array<[string, Project]> = [
    ['empty', project()],
    ['one clip', project({ clips: [clip()] })],
    ['two video tracks', project({ clips: [
      clip({ id: 'a', trackId: 't0' }), clip({ id: 'b', trackId: 't1' }),
    ] })],
    ['overlapping on one track', project({ clips: [
      clip({ id: 'a', trackId: 't0', startTime: 0, duration: 4 }),
      clip({ id: 'b', trackId: 't0', startTime: 1, duration: 4 }),
    ] })],
    ['text over video', project({ clips: [clip()], textClips: [text()] })],
    ['sticker under text', project({
      tracks: [track('t0', 'video'), track('t-sticker', 'sticker'), track('t-text', 'text')],
      clips: [clip()], textClips: [text()], stickerClips: [sticker()],
    })],
    ['overlay interleaved between video tracks', project({
      tracks: [track('t0', 'video'), track('t-text', 'text'), track('t1', 'video')],
      clips: [clip({ id: 'a', trackId: 't0' }), clip({ id: 'b', trackId: 't1' })],
      textClips: [text()],
    })],
    ['clip on an unlisted track', project({ clips: [
      clip({ id: 'a', trackId: 't0' }), clip({ id: 'ghost', trackId: 'missing' }),
    ] })],
    ['image and video mixed', project({ clips: [
      clip({ id: 'v', mediaId: 'm1', trackId: 't0' }),
      clip({ id: 'i', mediaId: 'img1', trackId: 't1' }),
    ] })],
    ['zero-length and dangling clips', project({ clips: [
      clip({ id: 'ok', trackId: 't0' }),
      clip({ id: 'zero', trackId: 't0', duration: 0 }),
      clip({ id: 'dangling', mediaId: 'gone', trackId: 't1' }),
    ] })],
  ]

  for (const [name, p] of shapes) {
    it(`matches on ${name}`, () => {
      for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5.5]) {
        expect(activePaintAt(p, t).map(i => i.kind), `t=${t}`).toEqual(sceneKinds(p, t))
      }
    })
  }
})
