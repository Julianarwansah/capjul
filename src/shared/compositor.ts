// Renderer-only: draws with DOM canvas and HTMLMediaElement. Never import from
// the main process. This is the Phase 2 compositor: the single place that knows
// how a Scene becomes pixels, so preview and export cannot drift.
import { isActiveAt, mediaTimeAt, stickerTransformAt, textTransformAt, transformAt, type Scene, type SceneImageLayer, type SceneLayer, type SceneStickerLayer, type SceneTextLayer, type SceneVideoLayer } from './scene'
import { hasTransitionClip, poseBlurPx, poseClipRect, transitionPose, type TransitionClipPose } from './transition-pose'
import { VIGNETTE_RADIUS_FRACTIONS, letterboxFraction, vignetteStops } from './overlay-effects'
import { rasterizeTextCentred, stickerPlacement, loadSvgImage } from './text-rasterizer'
import { stickerSvg } from './sticker-svgs'
import { clipAnim } from './text-animation'
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

/**
 * Everything drawSceneFrame needs that is not in the Scene: the decoded media
 * behind each layer. Held as maps so a test can supply stand-ins and a recording
 * canvas context, which is how the export draw path gets tested in node at all -
 * prepareScene is the only part that truly needs a DOM.
 */
export interface SceneSources {
  videos: Map<string, HTMLVideoElement>
  images: Map<string, HTMLImageElement>
  textRasters: Map<string, HTMLCanvasElement>
  stickers: Map<string, HTMLImageElement>
}

interface DrawableSize { w: number; h: number }

function sourceSize(
  layer: SceneVideoLayer | SceneImageLayer,
  sources: SceneSources,
): DrawableSize | null {
  if (layer.kind === 'video') {
    const el = sources.videos.get(layer.mediaId)
    return el && el.videoWidth ? { w: el.videoWidth, h: el.videoHeight } : null
  }
  const el = sources.images.get(layer.mediaId)
  return el && el.naturalWidth ? { w: el.naturalWidth, h: el.naturalHeight } : null
}

function drawMediaLayer(
  ctx: CanvasRenderingContext2D,
  layer: SceneVideoLayer | SceneImageLayer,
  sources: SceneSources,
  scene: Scene,
  t: number,
  pose?: TransitionClipPose,
) {
  const el = (layer.kind === 'video' ? sources.videos.get(layer.mediaId) : sources.images.get(layer.mediaId)) as
    | HTMLVideoElement
    | HTMLImageElement
    | undefined
  const size = sourceSize(layer, sources)
  if (!el || !size) return
  const { width: W, height: H } = scene
  const tr = transformAt(layer.keyframes, layer.transform, t)
  ctx.save()
  // The transition's blur joins the layer's own filter string; both are canvas
  // filter functions and compose in one assignment.
  const blurPx = pose ? poseBlurPx(pose, W) : 0
  const blur = blurPx > 0 ? `blur(${round6(blurPx)}px)` : ''
  const filter = [layer.filter, blur].filter(Boolean).join(' ')
  if (filter) ctx.filter = filter
  ctx.globalAlpha = tr.opacity * (pose ? pose.alpha : 1)
  // The transition's transform wraps the layer pose, outermost first, in the same
  // order poseToCss emits for the preview: translate, scale, then the layer's own
  // translate/rotate/scale. Reordering one side without the other is how the two
  // came to disagree once before (D18).
  if (pose) {
    ctx.translate(pose.dx * W, pose.dy * H)
    if (pose.scale !== 1) ctx.scale(pose.scale, pose.scale)
  }
  // Order matters and is a contract, not a style choice: the preview emits its
  // CSS transform in POSE_TRANSFORM_ORDER (scene.ts) to match these three calls.
  // Rotation and non-uniform scale do not commute, so reordering one side
  // without the other silently changes the result. They did diverge once; see
  // docs/tech-debt.md, D18 (resolved).
  ctx.translate(W / 2 + tr.x * W, H / 2 + tr.y * H)
  ctx.rotate(tr.rotation * Math.PI / 180)
  ctx.scale(tr.scaleX, tr.scaleY)
  // A wipe clips in the layer's local box, after every transform, which is where
  // CSS clip-path applies too - so a rotated clip carries its wipe with it on
  // both sides.
  if (pose && hasTransitionClip(pose)) {
    const r = poseClipRect(pose, W, H)
    if (r) {
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }
  }
  // object-fit: contain inside the canvas box, centred on the origin - the
  // same box the preview's absolute inset-0 element occupies.
  const s = Math.min(W / size.w, H / size.h)
  const dw = size.w * s
  const dh = size.h * s
  ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

function drawSticker(
  ctx: CanvasRenderingContext2D,
  layer: SceneStickerLayer,
  sources: SceneSources,
  scene: Scene,
  t: number,
) {
  const img = sources.stickers.get(layer.clip.src)
  if (!img) return
  const tr = stickerTransformAt(layer.clip, t)
  const p = stickerPlacement(
    { ...layer.clip, x: tr.x, y: tr.y, scaleX: tr.scaleX, scaleY: tr.scaleY, rotation: tr.rotation },
    scene.width, scene.height,
  )
  ctx.save()
  ctx.globalAlpha = tr.opacity
  ctx.translate(p.cx, p.cy)
  ctx.rotate(p.rotationDeg * Math.PI / 180)
  ctx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h)
  ctx.restore()
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: SceneTextLayer,
  sources: SceneSources,
  scene: Scene,
  t: number,
) {
  const raster = sources.textRasters.get(layer.clip.id)
  if (!raster) return
  const tr = textTransformAt(layer.clip, t)
  const anim = clipAnim(layer.clip.animation, layer.clip.outAnimation, t - layer.start, layer.end - t)
  const { width: W, height: H } = scene
  ctx.save()
  ctx.globalAlpha = tr.opacity * anim.opacity
  // Preview: left/top place the box at x/y as canvas fractions, then
  // translate(-50%,-50%) rotate() scale() about the box centre, then the
  // animation's own translate/scale in that same local frame. The raster
  // holds exactly that box centred, so half its size is the -50%,-50%.
  ctx.translate(tr.x * W, tr.y * H)
  ctx.rotate(tr.rotation * Math.PI / 180)
  ctx.scale(tr.scaleX, tr.scaleY)
  if (anim.dx !== 0 || anim.dy !== 0 || anim.scale !== 1) {
    ctx.translate(anim.dx * H, anim.dy * H)
    ctx.scale(anim.scale, anim.scale)
  }
  ctx.drawImage(raster, -raster.width / 2, -raster.height / 2)
  ctx.restore()
}

/**
 * The two overlay effects a canvas can draw exactly, painted after every layer
 * so they cover the composed frame the way the preview's DOM overlays do. Both
 * take their numbers from shared/overlay-effects.ts, which the preview's CSS
 * also reads, so the exported vignette is the vignette that was on screen.
 *
 * Grain is not here: it is animated noise with a blend mode, which a
 * deterministic frame pump cannot reproduce, and it stays preview-only (D23).
 */
function drawOverlayEffects(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  effects: ReadonlyArray<{ id: string; intensity: number }>,
) {
  const { width: W, height: H } = scene
  for (const e of effects) {
    if (e.id === 'letterbox') {
      const f = letterboxFraction(e.intensity)
      if (f <= 0) continue
      ctx.save()
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, W, f * H)
      ctx.fillRect(0, H - f * H, W, f * H)
      ctx.restore()
    } else if (e.id === 'vignette') {
      const { inner, rim } = vignetteStops(e.intensity)
      const { rx, ry } = VIGNETTE_RADIUS_FRACTIONS
      // A canvas radial gradient is a circle; scaling the context by the axis
      // ratio turns it into the same centred ellipse the preview's CSS radii
      // describe, stops and all.
      const sx = (rx * W) / (ry * H)
      ctx.save()
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.translate(W / 2, H / 2)
      ctx.scale(sx, 1)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry * H)
      g.addColorStop(inner, 'rgba(0,0,0,0)')
      g.addColorStop(1, rim)
      ctx.fillStyle = g
      ctx.fillRect(-W / (2 * sx), -H / 2, W / sx, H)
      ctx.restore()
    }
  }
}

/**
 * The transition covering `t`, with its progress, or null. Exported because the
 * frame pump must seek the incoming clip's video even before that clip is
 * "active" by its own time range - during the first half of a blend only the
 * outgoing clip is within its own span.
 */
export function sceneTransitionAt(
  scene: Scene,
  t: number,
): { clipIdA: string; clipIdB: string; type: string; progress: number } | null {
  for (const tr of scene.transitions) {
    const start = tr.boundary - tr.duration / 2
    const end = tr.boundary + tr.duration / 2
    if (t < start || t > end) continue
    return {
      clipIdA: tr.clipIdA,
      clipIdB: tr.clipIdB,
      type: tr.type,
      progress: tr.duration === 0 ? 1 : Math.min(1, Math.max(0, (t - start) / tr.duration)),
    }
  }
  return null
}

/**
 * One frame of the scene, in paint order, onto `ctx`.
 *
 * Module-level and source-injected so the export's drawing can be exercised in
 * node against a recording context: before this extraction the only way to reach
 * these calls was prepareScene, which needs a live DOM, so the code path that
 * decides what an exported frame contains had no test at all.
 *
 * While a transition runs, its two layers are drawn together at the outgoing
 * layer's position in paint order, each under its half of the pose. They are
 * adjacent clips on one track, so nothing else sits between them.
 */
export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  sources: SceneSources,
  t: number,
) {
  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = scene.background
  ctx.fillRect(0, 0, scene.width, scene.height)

  const active = sceneTransitionAt(scene, t)
  const [poseA, poseB] = active ? transitionPose(active.type, active.progress) : [undefined, undefined]
  const layerById = (id: string) =>
    scene.layers.find((l): l is SceneVideoLayer | SceneImageLayer =>
      (l.kind === 'video' || l.kind === 'image') && l.clipId === id)

  function drawLayer(layer: SceneLayer, pose: TransitionClipPose | undefined) {
    if (layer.kind === 'video' || layer.kind === 'image') drawMediaLayer(ctx, layer, sources, scene, t, pose)
    else if (layer.kind === 'text') drawText(ctx, layer, sources, scene, t)
    else drawSticker(ctx, layer, sources, scene, t)
  }

  for (const layer of scene.layers) {
    if (active && (layer.kind === 'video' || layer.kind === 'image')) {
      if (layer.clipId === active.clipIdA) {
        drawLayer(layer, poseA)
        const incoming = layerById(active.clipIdB)
        if (incoming) drawLayer(incoming, poseB)
        continue
      }
      if (layer.clipId === active.clipIdB) continue
    }
    if (!isActiveAt(layer, t)) continue
    drawLayer(layer, undefined)
  }

  // Overlay effects belong to the clip at the bottom of the paint stack, which is
  // the clip the preview reads them from; they cover the whole composed frame.
  const base = scene.layers.find(
    (l): l is SceneVideoLayer | SceneImageLayer =>
      (l.kind === 'video' || l.kind === 'image') && isActiveAt(l, t),
  )
  if (base && base.effects.length > 0) drawOverlayEffects(ctx, scene, base.effects)

  ctx.restore()
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

  const sources: SceneSources = { videos, images, textRasters: textCanvases, stickers }

  function drawFrame(ctx: CanvasRenderingContext2D, t: number) {
    drawSceneFrame(ctx, scene, sources, t)
  }


  async function seekActiveVideos(t: number) {
    const active = sceneTransitionAt(scene, t)
    await Promise.all(scene.layers.map(async (layer: SceneLayer) => {
      if (layer.kind !== 'video') return
      // A blend's incoming clip is not inside its own time range during the first
      // half of the transition, but its frame is on screen, so it must be seeked
      // or the blend shows whatever it last held.
      const inTransition = active !== null &&
        (layer.clipId === active.clipIdA || layer.clipId === active.clipIdB)
      if (!isActiveAt(layer, t) && !inTransition) return
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
