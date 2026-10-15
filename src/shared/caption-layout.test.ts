import { describe, expect, it } from 'vitest'
import {
  CAPTION_BOTTOM_FRACTION, CAPTION_FONT_PX, CAPTION_LINE_HEIGHT, CAPTION_WIDTH_FRACTION,
  captionCentreY, captionToTextClip, wrapLines,
} from './caption-layout'
import { TEXT_PAD_Y } from './text-layout'
import type { Caption } from './project-schema'

// 10px per character, so an 80px line holds eight of them and every wrap point
// is arithmetic a reader can check by hand.
const measure = (s: string) => s.length * 10

const caption = (over: Partial<Caption> = {}): Caption => ({
  id: 'cap1', startTime: 1, endTime: 4, text: 'hello world', ...over,
})

describe('wrapLines', () => {
  it('breaks before the word that would overflow', () => {
    // 'aaa bb' is 60px, adding ' cc' makes 90px against an 80px line.
    expect(wrapLines('aaa bb cc', 80, measure)).toEqual(['aaa bb', 'cc'])
  })

  it('keeps a paragraph that fits on one line', () => {
    expect(wrapLines('aaa bb', 80, measure)).toEqual(['aaa bb'])
  })

  it('gives a word longer than the line a line of its own', () => {
    expect(wrapLines('aaaaaaaaaa bb', 80, measure)).toEqual(['aaaaaaaaaa', 'bb'])
  })

  it('preserves explicit newlines, including empty ones', () => {
    // A blank line in an SRT is a pause in the block's rhythm, not nothing.
    expect(wrapLines('a\n\nb', 80, measure)).toEqual(['a', '', 'b'])
  })

  it('collapses runs of whitespace within a line', () => {
    expect(wrapLines('a   b', 80, measure)).toEqual(['a b'])
  })

  it('returns one empty line for empty text', () => {
    expect(wrapLines('', 80, measure)).toEqual([''])
  })
})

describe('captionCentreY', () => {
  it('anchors the box bottom at the caption margin', () => {
    const H = 720
    const lines = 2
    const boxH = lines * CAPTION_FONT_PX * CAPTION_LINE_HEIGHT + TEXT_PAD_Y * 2
    const y = captionCentreY(lines, H)
    // Centre plus half the box is the box bottom, and that is the margin line.
    expect(y * H + boxH / 2).toBeCloseTo(H * (1 - CAPTION_BOTTOM_FRACTION), 9)
  })

  it('rises as the caption gains lines, keeping the bottom fixed', () => {
    const one = captionCentreY(1, 720)
    const three = captionCentreY(3, 720)
    expect(three).toBeLessThan(one)
    const box1 = 1 * CAPTION_FONT_PX * CAPTION_LINE_HEIGHT + TEXT_PAD_Y * 2
    const box3 = 3 * CAPTION_FONT_PX * CAPTION_LINE_HEIGHT + TEXT_PAD_Y * 2
    expect(one * 720 + box1 / 2).toBeCloseTo(three * 720 + box3 / 2, 9)
  })
})

describe('captionToTextClip', () => {
  // 100px canvas: the wrap width is 80px, matching the measure stub's 8 chars.
  const W = 100
  const H = 200

  it('wraps with the injected measure and joins the lines', () => {
    const clip = captionToTextClip(caption({ text: 'aaa bb cc' }), W, H, measure)
    expect(clip.text).toBe('aaa bb\ncc')
  })

  it('anchors the wrapped box at the caption margin', () => {
    const clip = captionToTextClip(caption({ text: 'aaa bb cc' }), W, H, measure)
    expect(clip.y).toBeCloseTo(captionCentreY(2, H), 12)
  })

  it('carries the caption window as start and duration', () => {
    const clip = captionToTextClip(caption({ startTime: 2, endTime: 5.5 }), W, H, measure)
    expect(clip.startTime).toBe(2)
    expect(clip.duration).toBe(3.5)
  })

  it('clamps an inverted window to zero rather than a negative duration', () => {
    const clip = captionToTextClip(caption({ startTime: 5, endTime: 2 }), W, H, measure)
    expect(clip.duration).toBe(0)
  })

  it('rasterizes in the shared caption face', () => {
    const clip = captionToTextClip(caption(), W, H, measure)
    expect(clip.fontFamily).toBe('Arial')
    expect(clip.fontSize).toBe(CAPTION_FONT_PX)
    expect(clip.bold).toBe(true)
    expect(clip.align).toBe('center')
    expect(clip.lineHeight).toBe(CAPTION_LINE_HEIGHT)
  })

  it('wraps against the canvas width fraction, not the canvas width', () => {
    // At 1000px the wrap width is 800px: eighty stub characters, so a 90-char
    // line breaks and a 79-char one does not.
    const long = 'x'.repeat(79)
    const longer = 'x'.repeat(90)
    expect(captionToTextClip(caption({ text: long }), 1000, H, measure).text).toBe(long)
    expect(captionToTextClip(caption({ text: `${longer} y` }), 1000, H, measure).text)
      .toBe(`${longer}\ny`)
    expect(CAPTION_WIDTH_FRACTION).toBe(0.8)
  })
})
