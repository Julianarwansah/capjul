import type { TextClip } from './project-schema'

// Pure text layout math, shared by the preview's intent and the export
// rasterizer. Measurement is injected so this stays testable without a canvas.

export const TEXT_PAD_X = 8
export const TEXT_PAD_Y = 4

export interface TextLayout {
  lines: string[]
  fontSize: number
  lineSpacing: number
  boxW: number
  boxH: number
  boxX: number
  boxY: number
  lineXs: number[]
  lineYs: number[]
}

export function textFont(clip: TextClip): string {
  return `${clip.italic ? 'italic ' : ''}${clip.bold ? 'bold ' : ''}${clip.fontSize}px ${clip.fontFamily}`
}

/**
 * The preview centres the text block at (x, y) as fractions of the canvas and
 * pads it by 4px/8px; export must agree or parity is impossible.
 */
export function layoutText(
  clip: TextClip,
  canvasW: number,
  canvasH: number,
  measure: (text: string) => number,
): TextLayout {
  const lines = clip.text.split('\n')
  const lineSpacing = clip.fontSize * clip.lineHeight
  const widths = lines.map(line => measure(line))
  const textW = widths.length ? Math.max(...widths) : 0
  const boxW = textW + TEXT_PAD_X * 2
  const boxH = lineSpacing * lines.length + TEXT_PAD_Y * 2
  const boxX = clip.x * canvasW - boxW / 2
  const boxY = clip.y * canvasH - boxH / 2

  const lineXs = widths.map((w, i) => {
    if (clip.align === 'left') return boxX + TEXT_PAD_X
    if (clip.align === 'right') return boxX + boxW - TEXT_PAD_X - w
    return boxX + (boxW - widths[i]) / 2
  })
  const lineYs = lines.map((_, i) => boxY + TEXT_PAD_Y + lineSpacing * (i + 0.5))

  return { lines, fontSize: clip.fontSize, lineSpacing, boxW, boxH, boxX, boxY, lineXs, lineYs }
}
