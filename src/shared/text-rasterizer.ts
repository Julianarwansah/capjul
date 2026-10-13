// Renderer-only: draws with a DOM canvas. Never import from the main process.
import { layoutText, textFont, type TextLayout } from './text-layout'
import { STICKER_BASE_RATIO } from './sticker-assets'
import { stickerSvg } from './sticker-svgs'
import type { StickerClip, TextClip } from './project-schema'

type LetterSpacingContext = CanvasRenderingContext2D & { letterSpacing?: string }

/**
 * Paints the clip's styling - font, colour, bold/italic, alignment, shadow,
 * stroke, letter spacing, line height, underline and the optional background
 * box - using coordinates from `layout`.
 *
 * Known approximations versus the CSS preview, tracked as tech debt D7:
 * -webkit-text-stroke is approximated by a centred canvas stroke of double the
 * width, and underline thickness is heuristic.
 */
function paintText(ctx: CanvasRenderingContext2D, clip: TextClip, layout: TextLayout) {
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  if (clip.backgroundColor !== 'transparent' && clip.backgroundOpacity > 0) {
    ctx.globalAlpha = clip.backgroundOpacity
    ctx.fillStyle = clip.backgroundColor
    ctx.fillRect(layout.boxX, layout.boxY, layout.boxW, layout.boxH)
    ctx.globalAlpha = 1
  }

  ctx.shadowColor = clip.shadowColor
  ctx.shadowBlur = clip.shadowBlur
  ctx.shadowOffsetX = clip.shadowX
  ctx.shadowOffsetY = clip.shadowY

  if (clip.strokeWidth > 0) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = clip.strokeWidth * 2
    ctx.strokeStyle = clip.strokeColor
    layout.lines.forEach((line, i) => ctx.strokeText(line, layout.lineXs[i], layout.lineYs[i]))
  }

  ctx.fillStyle = clip.fontColor
  layout.lines.forEach((line, i) => ctx.fillText(line, layout.lineXs[i], layout.lineYs[i]))

  if (clip.underline) {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.strokeStyle = clip.fontColor
    ctx.lineWidth = Math.max(1, clip.fontSize / 24)
    layout.lines.forEach((line, i) => {
      const y = layout.lineYs[i] + layout.fontSize / 2
      ctx.beginPath()
      ctx.moveTo(layout.lineXs[i], y)
      ctx.lineTo(layout.lineXs[i] + ctx.measureText(line).width, y)
      ctx.stroke()
    })
  }
}

/** Font and letter spacing must be set before measuring, or the layout lies. */
function prepareCtx(ctx: CanvasRenderingContext2D, clip: TextClip) {
  ctx.font = textFont(clip)
  const spaced = ctx as LetterSpacingContext
  if ('letterSpacing' in spaced) spaced.letterSpacing = `${clip.letterSpacing}px`
}

/** Margin so shadow, stroke and underline are not clipped by the raster edge. */
function bleedFor(clip: TextClip): number {
  return Math.ceil(
    clip.shadowBlur + Math.abs(clip.shadowX) + Math.abs(clip.shadowY)
    + clip.strokeWidth * 2 + clip.fontSize / 24 + 2,
  )
}

function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  return ctx
}

/**
 * Rasterizes the clip into a canvas just large enough for the text, with the box
 * centred on the raster centre. Position, rotation and scale are deliberately
 * left out so the caller can vary them per frame; baking them in would freeze
 * the clip at its base pose and drop every keyframe.
 */
export function rasterizeTextCentred(clip: TextClip): HTMLCanvasElement {
  const probe = canvas2d(1, 1)
  prepareCtx(probe, clip)
  // A zero-sized canvas with x=y=0.5 puts the box centre at the origin, so the
  // layout is pure box-relative geometry with no position baked in.
  const layout = layoutText({ ...clip, x: 0.5, y: 0.5 }, 0, 0, t => probe.measureText(t).width)

  const bleed = bleedFor(clip)
  const ctx = canvas2d(
    Math.max(1, Math.ceil(layout.boxW + bleed * 2)),
    Math.max(1, Math.ceil(layout.boxH + bleed * 2)),
  )
  prepareCtx(ctx, clip)
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2)
  paintText(ctx, clip, layout)
  return ctx.canvas
}

/** Full-canvas raster with the box at the clip's own position, for the
 *  filtergraph overlay path, which cannot move an overlay per frame. */
export function rasterizeTextClipToCanvas(clip: TextClip, canvasW: number, canvasH: number): HTMLCanvasElement {
  const tight = rasterizeTextCentred(clip)
  const ctx = canvas2d(canvasW, canvasH)
  ctx.drawImage(tight, clip.x * canvasW - tight.width / 2, clip.y * canvasH - tight.height / 2)
  return ctx.canvas
}

export function rasterizeTextClip(clip: TextClip, canvasW: number, canvasH: number): string {
  return rasterizeTextClipToCanvas(clip, canvasW, canvasH).toDataURL('image/png').split(',')[1]
}

/**
 * Sticker geometry: the asset's base height is a fixed fraction of the canvas,
 * scaled by the clip and centred on (x, y) as canvas fractions - the same
 * centre semantics the preview uses.
 */
export function stickerPlacement(clip: StickerClip, canvasW: number, canvasH: number) {
  const base = canvasH * STICKER_BASE_RATIO
  return {
    w: base * clip.scaleX,
    h: base * clip.scaleY,
    cx: clip.x * canvasW,
    cy: clip.y * canvasH,
    rotationDeg: clip.rotation,
  }
}

export function loadSvgImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('sticker svg failed to decode'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
  })
}

export async function rasterizeStickerFromSvg(
  clip: StickerClip,
  canvasW: number,
  canvasH: number,
  svgText: string,
): Promise<string> {
  const img = await loadSvgImage(svgText)
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  const p = stickerPlacement(clip, canvasW, canvasH)
  ctx.globalAlpha = clip.opacity
  ctx.translate(p.cx, p.cy)
  ctx.rotate(p.rotationDeg * Math.PI / 180)
  ctx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h)
  return canvas.toDataURL('image/png').split(',')[1]
}

export async function rasterizeStickerClip(
  clip: StickerClip,
  canvasW: number,
  canvasH: number,
): Promise<string | null> {
  const svg = stickerSvg(clip.src)
  if (!svg) return null
  return rasterizeStickerFromSvg(clip, canvasW, canvasH, svg)
}
