// Renderer-only: draws with a DOM canvas. Never import from the main process.
import { layoutText, textFont } from './text-layout'
import type { TextClip } from './project-schema'

type LetterSpacingContext = CanvasRenderingContext2D & { letterSpacing?: string }

/**
 * Rasterizes a TextClip to a full-canvas transparent PNG (base64, no data-url
 * prefix) at export resolution, mirroring the preview's styling: font, colour,
 * bold/italic, alignment, shadow, stroke, letter spacing, line height and the
 * optional background box.
 *
 * Known approximations versus the CSS preview, tracked as tech debt D7:
 * -webkit-text-stroke is approximated by a centred canvas stroke of double the
 * width, and underline thickness is heuristic.
 */
export function rasterizeTextClip(clip: TextClip, canvasW: number, canvasH: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')

  // Font and letter spacing must be set before measuring, or the layout lies.
  ctx.font = textFont(clip)
  const spaced = ctx as LetterSpacingContext
  if ('letterSpacing' in spaced) spaced.letterSpacing = `${clip.letterSpacing}px`

  const layout = layoutText(clip, canvasW, canvasH, text => ctx.measureText(text).width)
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

  return canvas.toDataURL('image/png').split(',')[1]
}
