// Renderer-only: draws with DOM canvas and HTMLMediaElement. Never import from
// the main process. This is the Phase 2 compositor: the single place that knows
// how a Scene becomes pixels, so preview and export cannot drift.
import { isActiveAt, mediaTimeAt, textTransformAt, transformAt, type Scene, type SceneImageLayer, type SceneLayer, type SceneStickerLayer, type SceneTextLayer, type SceneVideoLayer } from './scene'
import { rasterizeTextCentred, stickerPlacement, loadSvgImage } from './text-rasterizer'
import { stickerSvg } from './sticker-svgs'
import type { MediaFile } from './project-schema'

export interface PreparedScene {
  scene: Scene
  /** Seeks every active video layer to its source time for t. Await before drawFrame. */
  seekActiveVideos: (t: number) => Promise<void>
  drawFrame: (ctx: CanvasRenderingContext2D, t: number) => void
  dispose: () => void
}

const SEEK_TIMEOUT_MS = 2000
const VIDEO_READY_TIMEOUT_MS = 5000

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed to load: ${url}`))
    img.src = url
  })
}

function seekTo(el: HTMLVideoElement, time: number): Promise<void> {
  return new Promise(resolve => {
    // Never let a stuck decode hang the frame pump.
    const timer = setTimeout(() => {
      el.removeEventListener('seeked', done)
      resolve()
    }, SEEK_TIMEOUT_MS)
    function done() {
      clearTimeout(timer)
      el.removeEventListener('seeked', done)
      resolve()
    }
    el.addEventListener('seeked', done)
    el.currentTime = time
  })
}

/** Resolves once the element holds a drawable frame. Setting currentTime before
 *  that is silently dropped, which is how an export opens on blank frames; a
 *  file that never decodes gives up instead of hanging the export. */
function waitForVideoReady(el: HTMLVideoElement): Promise<void> {
  return new Promise(resolve => {
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      el.removeEventListener('loadeddata', done)
      resolve()
    }, VIDEO_READY_TIMEOUT_MS)
    function done() {
      clearTimeout(timer)
      el.removeEventListener('loadeddata', done)
      resolve()
    }
    el.addEventListener('loadeddata', done)
  })
}

export async function prepareScene(
  scene: Scene,
  media: MediaFile[],
  resolveMediaUrl: (path: string) => string,
): Promise<PreparedScene> {
  const videos = new Map<string, HTMLVideoElement>()
  const images = new Map<string, HTMLImageElement>()
  for (const m of media) {
    if (m.type === 'video') {
      const el = document.createElement('video')
      el.src = resolveMediaUrl(m.path)
      el.muted = true
      el.playsInline = true
      el.preload = 'auto'
      videos.set(m.id, el)
    } else if (m.type === 'image') {
      images.set(m.id, await loadImage(resolveMediaUrl(m.path)))
    }
  }
  // First-frame seeks are dropped until a video holds data, which is how an
  // export opens on blank frames. Wait in parallel so N clips cost one decode.
  await Promise.all([...videos.values()].map(waitForVideoReady))

  const textLayers = scene.layers.filter((l): l is SceneTextLayer => l.kind === 'text')
  // Box-sized and centred, so drawText can vary placement, rotation and scale
  // per frame. Baking those here would freeze text at its base pose and drop
  // every text keyframe.
  const textCanvases = new Map(textLayers.map(l => [l.clip.id, rasterizeTextCentred(l.clip)]))

  const stickerLayers = scene.layers.filter((l): l is SceneStickerLayer => l.kind === 'sticker')
  const stickers = new Map<string, HTMLImageElement>()
  for (const src of new Set(stickerLayers.map(l => l.clip.src))) {
    const svg = stickerSvg(src)
    if (svg) stickers.set(src, await loadSvgImage(svg))
  }

  function sourceSize(layer: SceneVideoLayer | SceneImageLayer): { w: number; h: number } | null {
    if (layer.kind === 'video') {
      const el = videos.get(layer.mediaId)
      return el && el.videoWidth ? { w: el.videoWidth, h: el.videoHeight } : null
    }
    const el = images.get(layer.mediaId)
    return el && el.naturalWidth ? { w: el.naturalWidth, h: el.naturalHeight } : null
  }

  function drawMediaLayer(ctx: CanvasRenderingContext2D, layer: SceneVideoLayer | SceneImageLayer, t: number) {
    const el = (layer.kind === 'video' ? videos.get(layer.mediaId) : images.get(layer.mediaId)) as
      | HTMLVideoElement
      | HTMLImageElement
      | undefined
    const size = sourceSize(layer)
    if (!el || !size) return
    const { width: W, height: H } = scene
    const tr = transformAt(layer.keyframes, layer.transform, t)
    ctx.save()
    if (layer.filter) ctx.filter = layer.filter
    ctx.globalAlpha = tr.opacity
    ctx.translate(W / 2 + tr.x * W, H / 2 + tr.y * H)
    ctx.rotate(tr.rotation * Math.PI / 180)
    ctx.scale(tr.scaleX, tr.scaleY)
    // object-fit: contain inside the canvas box, centred on the origin - the
    // same box the preview's absolute inset-0 element occupies.
    const s = Math.min(W / size.w, H / size.h)
    const dw = size.w * s
    const dh = size.h * s
    ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
  }

  function drawSticker(ctx: CanvasRenderingContext2D, layer: SceneStickerLayer) {
    const img = stickers.get(layer.clip.src)
    if (!img) return
    const p = stickerPlacement(layer.clip, scene.width, scene.height)
    ctx.save()
    ctx.globalAlpha = layer.clip.opacity
    ctx.translate(p.cx, p.cy)
    ctx.rotate(p.rotationDeg * Math.PI / 180)
    ctx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h)
    ctx.restore()
  }

  function drawText(ctx: CanvasRenderingContext2D, layer: SceneTextLayer, t: number) {
    const raster = textCanvases.get(layer.clip.id)
    if (!raster) return
    const tr = textTransformAt(layer.clip, t)
    const { width: W, height: H } = scene
    ctx.save()
    ctx.globalAlpha = tr.opacity
    // Preview: left/top place the box at x/y as canvas fractions, then
    // translate(-50%,-50%) rotate() scale() about the box centre. The raster
    // holds exactly that box centred, so half its size is the -50%,-50%.
    ctx.translate(tr.x * W, tr.y * H)
    ctx.rotate(tr.rotation * Math.PI / 180)
    ctx.scale(tr.scaleX, tr.scaleY)
    ctx.drawImage(raster, -raster.width / 2, -raster.height / 2)
    ctx.restore()
  }

  function drawFrame(ctx: CanvasRenderingContext2D, t: number) {
    ctx.save()
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, scene.width, scene.height)
    for (const layer of scene.layers) {
      if (!isActiveAt(layer, t)) continue
      if (layer.kind === 'video' || layer.kind === 'image') drawMediaLayer(ctx, layer, t)
      else if (layer.kind === 'text') drawText(ctx, layer, t)
      else drawSticker(ctx, layer)
    }
    ctx.restore()
  }

  async function seekActiveVideos(t: number) {
    await Promise.all(scene.layers.map(async (layer: SceneLayer) => {
      if (layer.kind !== 'video' || !isActiveAt(layer, t)) return
      const el = videos.get(layer.mediaId)
      if (!el) return
      const target = mediaTimeAt(layer, t)
      if (Math.abs(el.currentTime - target) < 0.001) return
      await seekTo(el, target)
    }))
  }

  function dispose() {
    for (const el of videos.values()) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }

  return { scene, seekActiveVideos, drawFrame, dispose }
}
