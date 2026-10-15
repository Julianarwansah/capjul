import { TEXT_PAD_Y, textFont } from './text-layout'
import type { Caption, TextClip } from './project-schema'

// Captions: one wrap algorithm, one style, three consumers - the preview's DOM,
// the compositor's raster and the filtergraph's overlay PNG. Until this module
// existed captions were preview-only (tech debt D27): nothing on the export side
// read project.captions, so an imported subtitle track vanished from the file.
//
// The wrap is the reason captions needed their own module rather than reusing
// the text path. layoutText splits on explicit newlines only, while the preview's
// caption box wrapped in CSS - so exporting captions as they stood would have
// shipped different line breaks from the ones the user read. Wrapping here, with
// the measuring function injected, puts both sides on one algorithm and one
// metric source.

export const CAPTION_FONT_PX = 32
export const CAPTION_LINE_HEIGHT = 1.3
export const CAPTION_WIDTH_FRACTION = 0.8
export const CAPTION_BOTTOM_FRACTION = 0.08

/**
 * Greedy word wrap: each paragraph (split on explicit newlines) fills lines up to
 * `maxWidthPx` and breaks before the word that would overflow. A word longer
 * than the line gets a line to itself rather than being split mid-word, which is
 * what CSS would do only with overflow-break, and what subtitles want anyway.
 * Empty paragraphs survive as empty lines so blank lines in an SRT still pause
 * the block's rhythm.
 */
export function wrapLines(
  text: string,
  maxWidthPx: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = words[0]
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`
      if (measure(candidate) <= maxWidthPx) line = candidate
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

/**
 * The TextClip a caption rasterizes as, positioned so the text box's bottom edge
 * sits CAPTION_BOTTOM_FRACTION above the canvas bottom - the anchor the preview's
 * CSS `bottom` has always used.
 *
 * `measure` must be configured with the caption face; `createCaptionMeasurer`
 * builds one. Tests pass a stub, which is what keeps wrapLines honest about its
 * contract: it wraps against whatever metric it is given, and both real callers
 * give it the same one.
 */
export function captionToTextClip(
  caption: Caption,
  canvasW: number,
  canvasH: number,
  measure: (s: string) => number,
): TextClip {
  const shell: TextClip = {
    id: caption.id,
    trackId: 'caption',
    startTime: caption.startTime,
    duration: Math.max(0, caption.endTime - caption.startTime),
    text: '',
    fontFamily: 'Arial',
    fontSize: CAPTION_FONT_PX,
    fontColor: '#ffffff',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    bold: true,
    italic: false,
    underline: false,
    align: 'center',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    letterSpacing: 0,
    lineHeight: CAPTION_LINE_HEIGHT,
    strokeColor: 'rgba(0,0,0,0.6)',
    strokeWidth: 1,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 4,
    shadowX: 0,
    shadowY: 1,
    keyframes: [],
  }
  const lines = wrapLines(caption.text, canvasW * CAPTION_WIDTH_FRACTION, measure)
  return { ...shell, text: lines.join('\n'), y: captionCentreY(lines.length, canvasH) }
}

/**
 * The vertical centre, as a canvas fraction, that puts a caption box of
 * `lineCount` lines with its bottom edge at CAPTION_BOTTOM_FRACTION from the
 * canvas bottom. The box height excludes the rasterizer's bleed, which is
 * transparent margin centred on the box and therefore does not move it.
 */
export function captionCentreY(lineCount: number, canvasH: number): number {
  const boxH = lineCount * CAPTION_FONT_PX * CAPTION_LINE_HEIGHT + TEXT_PAD_Y * 2
  return (canvasH - CAPTION_BOTTOM_FRACTION * canvasH - boxH / 2) / canvasH
}

/** A canvas-backed measureText for the face a caption rasterizes in. */
export function createCaptionMeasurer(): (s: string) => number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return s => s.length * CAPTION_FONT_PX * 0.5
  ctx.font = textFont({
    fontSize: CAPTION_FONT_PX, bold: true, italic: false, fontFamily: 'Arial',
  } as TextClip)
  return s => ctx.measureText(s).width
}
