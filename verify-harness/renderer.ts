// Verification harness. Imports the real scene/compositor modules and drives
// the actual export draw path, then hands PNG data URLs back to the main
// process. Nothing here reimplements the code under test.
import { compileScene } from '../src/shared/scene'
import { prepareScene } from '../src/shared/compositor'
import type { Clip, Project, StickerClip, TextClip } from '../src/shared/project-schema'

const W = 640
const H = 360
const FPS = 30
const HERO = '/Users/mac/Ngoding/capjul/src/assets/hero.png'

function mkText(over: Partial<TextClip> = {}): TextClip {
  return {
    id: 'tx', trackId: 't0', startTime: 0, duration: 3, text: 'CAPJUL',
    fontFamily: 'Arial', fontSize: 48, fontColor: '#ffffff',
    backgroundColor: 'transparent', backgroundOpacity: 0,
    bold: true, italic: false, underline: false, align: 'center',
    x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
    letterSpacing: 0, lineHeight: 1.2,
    strokeColor: 'transparent', strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 6, shadowX: 2, shadowY: 2,
    keyframes: [],
    ...over,
  }
}

function mkClip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'hero', trackId: 't0', startTime: 0, duration: 3,
    mediaStart: 0, mediaEnd: 3,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false, effects: [], keyframes: [],
    ...over,
  }
}

function mkSticker(over: Partial<StickerClip> = {}): StickerClip {
  return {
    id: 'st', trackId: 't0', startTime: 0, duration: 3, src: 'star',
    x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    keyframes: [],
    ...over,
  }
}

function mkProject(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'harness', createdAt: 0, duration: 3,
    width: W, height: H, fps: FPS, backgroundColor: '#20242b',
    media: [{ id: 'hero', path: HERO, name: 'hero.png', type: 'image', duration: 0, width: 343, height: 361, size: 1 }],
    tracks: [{ id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 }],
    clips: [], textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [],
    ...over,
  }
}

async function render(name: string, project: Project, t: number) {
  const scene = compileScene(project)
  const prepared = await prepareScene(scene, project.media, p => `file://${p}`)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  await prepared.seekActiveVideos(t)
  prepared.drawFrame(ctx, t)
  prepared.dispose()
  return { name, t, dataUrl: canvas.toDataURL('image/png') }
}

async function main() {
  const out: Array<{ name: string; t: number; dataUrl: string }> = []

  // 1. Sanity: plain text, no rotation or scale. Must be centred.
  out.push(await render('text-plain', mkProject({ textClips: [mkText()] }), 0))

  // 2. Rotation + scale. Export used to ignore both entirely.
  out.push(await render('text-rot20-scale1.5', mkProject({
    textClips: [mkText({ rotation: 20, scaleX: 1.5, scaleY: 1.5 })],
  }), 0))

  // 3. Text box wider than the canvas, offset to x=0.2. The old full-canvas
  //    centred bake lost the right-hand part; the tight raster must not.
  out.push(await render('text-wide-x0.2', mkProject({
    textClips: [mkText({ text: 'THIS TEXT IS MUCH WIDER THAN THE CANVAS', x: 0.2 })],
  }), 0))

  // 4. Keyframed text rotation, 0 -> 90 over the clip.
  const rotKfs = [
    { id: 'a', time: 0, property: 'rotation', value: 0 },
    { id: 'b', time: 2, property: 'rotation', value: 90 },
  ]
  out.push(await render('text-kf-rot-t0', mkProject({ textClips: [mkText({ keyframes: rotKfs })] }), 0))
  out.push(await render('text-kf-rot-t1', mkProject({ textClips: [mkText({ keyframes: rotKfs })] }), 1))
  out.push(await render('text-kf-rot-t2', mkProject({ textClips: [mkText({ keyframes: rotKfs })] }), 2))

  // 5. Keyframed image layer position + opacity.
  const imgKfs = [
    { id: 'a', time: 0, property: 'x', value: -0.35 },
    { id: 'b', time: 2, property: 'x', value: 0.35 },
    { id: 'c', time: 0, property: 'opacity', value: 1 },
    { id: 'd', time: 2, property: 'opacity', value: 0.25 },
  ]
  out.push(await render('img-kf-t0', mkProject({ clips: [mkClip({ keyframes: imgKfs })] }), 0))
  out.push(await render('img-kf-t1', mkProject({ clips: [mkClip({ keyframes: imgKfs })] }), 1))
  out.push(await render('img-kf-t2', mkProject({ clips: [mkClip({ keyframes: imgKfs })] }), 2))

  // 6. Unkeyframed image must stay put at every t (regression guard).
  out.push(await render('img-static-t0', mkProject({ clips: [mkClip()] }), 0))
  out.push(await render('img-static-t2', mkProject({ clips: [mkClip()] }), 2))

  // 7. Probe: heavy shadow + thick stroke. The tight raster's bleed margin must
  //    not clip either into a visible rectangle.
  out.push(await render('text-bleed', mkProject({
    textClips: [mkText({ strokeWidth: 8, strokeColor: '#ff3355', shadowBlur: 30, shadowX: 20, shadowY: 20 })],
  }), 0))

  // 8. Video layer keyframes: same draw path as image, but with real seeking.
  const vidMedia = [
    ...mkProject().media,
    { id: 'vid', path: '/tmp/capjul-test.mp4', name: 'test', type: 'video' as const, duration: 3, width: 640, height: 360, size: 1 },
  ]
  const vidKfs = [
    { id: 'a', time: 0, property: 'x', value: -0.3 },
    { id: 'b', time: 2, property: 'x', value: 0.3 },
  ]
  out.push(await render('vid-kf-t0', mkProject({ media: vidMedia, clips: [mkClip({ mediaId: 'vid', keyframes: vidKfs })] }), 0))
  out.push(await render('vid-kf-t2', mkProject({ media: vidMedia, clips: [mkClip({ mediaId: 'vid', keyframes: vidKfs })] }), 2))

  // 9. Text in-animations must now reach the compositor, not just the preview.
  out.push(await render('anim-fade-t0', mkProject({ textClips: [mkText({ animation: 'fade' })] }), 0))
  out.push(await render('anim-fade-t0.2', mkProject({ textClips: [mkText({ animation: 'fade' })] }), 0.2))
  out.push(await render('anim-slide-t0.15', mkProject({ textClips: [mkText({ animation: 'slideRight' })] }), 0.15))
  out.push(await render('anim-slide-t0.4', mkProject({ textClips: [mkText({ animation: 'slideRight' })] }), 0.4))
  out.push(await render('anim-zoom-t0.15', mkProject({ textClips: [mkText({ animation: 'zoomIn' })] }), 0.15))

  // 10. Sticker keyframes must move the asset on the export path.
  const stKfs = [
    { id: 'a', time: 0, property: 'x', value: 0.2 },
    { id: 'b', time: 2, property: 'x', value: 0.8 },
  ]
  out.push(await render('sticker-kf-t0', mkProject({ stickerClips: [mkSticker({ keyframes: stKfs })] }), 0))
  out.push(await render('sticker-kf-t2', mkProject({ stickerClips: [mkSticker({ keyframes: stKfs })] }), 2))

  return out
}

main()
  .then(pngs => {
    ;(window as unknown as { __pngs: unknown }).__pngs = pngs
    document.title = 'DONE'
  })
  .catch(err => {
    ;(window as unknown as { __error: string }).__error = String(err?.stack ?? err)
    document.title = 'ERROR'
  })
