import { describe, expect, it } from 'vitest'
import { TEXT_PAD_X, TEXT_PAD_Y, layoutText, textFont } from './text-layout'
import type { TextClip } from './project-schema'

// Deterministic stand-in for ctx.measureText: 0.6 * fontSize per character.
const measure = (fontSize: number) => (text: string) => text.length * fontSize * 0.6

function clip(over: Partial<TextClip> = {}): TextClip {
  return {
    id: 't1', trackId: 'text', startTime: 0, duration: 5,
    text: 'Hello', fontFamily: 'Arial', fontSize: 48, fontColor: '#ffffff',
    backgroundColor: 'transparent', backgroundOpacity: 0,
    bold: false, italic: false, underline: false,
    align: 'center', x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
    letterSpacing: 0, lineHeight: 1.2,
    strokeColor: 'transparent', strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
    ...over,
  }
}

const W = 1280
const H = 720

describe('layoutText', () => {
  it('centres the padded box on (x, y) in canvas pixels', () => {
    const layout = layoutText(clip(), W, H, measure(48))
    // "Hello" = 5 chars * 48 * 0.6 = 144
    expect(layout.boxW).toBe(144 + TEXT_PAD_X * 2)
    expect(layout.boxH).toBe(48 * 1.2 + TEXT_PAD_Y * 2)
    expect(layout.boxX).toBeCloseTo(W / 2 - layout.boxW / 2)
    expect(layout.boxY).toBeCloseTo(H / 2 - layout.boxH / 2)
  })

  it('splits on newlines and spaces them by fontSize * lineHeight', () => {
    const layout = layoutText(clip({ text: 'a\nbb\nccc' }), W, H, measure(48))
    expect(layout.lines).toEqual(['a', 'bb', 'ccc'])
    expect(layout.lineYs[1] - layout.lineYs[0]).toBeCloseTo(48 * 1.2)
    // box width follows the widest line
    expect(layout.boxW).toBe(3 * 48 * 0.6 + TEXT_PAD_X * 2)
  })

  it('honours align within the box', () => {
    const two = clip({ text: 'a\nbbbb' })
    const left = layoutText({ ...two, align: 'left' }, W, H, measure(48))
    const right = layoutText({ ...two, align: 'right' }, W, H, measure(48))
    const center = layoutText(two, W, H, measure(48))
    const wide = 4 * 48 * 0.6
    const narrow = 1 * 48 * 0.6
    expect(left.lineXs).toEqual([left.boxX + TEXT_PAD_X, left.boxX + TEXT_PAD_X])
    expect(right.lineXs[1]).toBeCloseTo(right.boxX + right.boxW - TEXT_PAD_X - wide)
    expect(center.lineXs[0]).toBeCloseTo(center.boxX + (center.boxW - narrow) / 2)
  })

  it('keeps an empty string from producing NaN geometry', () => {
    const layout = layoutText(clip({ text: '' }), W, H, measure(48))
    expect(Number.isFinite(layout.boxW)).toBe(true)
    expect(Number.isFinite(layout.lineYs[0])).toBe(true)
  })
})

describe('textFont', () => {
  it('encodes weight and style before the size and family', () => {
    expect(textFont(clip({ bold: true, italic: true }))).toBe('italic bold 48px Arial')
    expect(textFont(clip())).toBe('48px Arial')
  })
})
