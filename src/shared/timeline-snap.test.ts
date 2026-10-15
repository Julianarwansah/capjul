import { describe, expect, it } from 'vitest'
import { SNAP_PX, snapTime } from './timeline-snap'
import type { AudioClip, Clip, Project, StickerClip, TextClip } from './project-schema'

const PX_PER_SEC = 80
// 8px at 80px/s: anything further than a tenth of a second is left alone.
const THRESHOLD = SNAP_PX / PX_PER_SEC

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 30,
    width: 1920, height: 1080, fps: 30, backgroundColor: '#000',
    media: [], tracks: [],
    clips: [], textClips: [], stickerClips: [], audioClips: [],
    transitions: [], captions: [], markers: [],
    ...over,
  }
}

function clip(id: string, startTime: number, duration: number): Clip {
  return {
    id, mediaId: 'm', trackId: 't0', startTime, duration,
    mediaStart: 0, mediaEnd: duration,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false, effects: [], keyframes: [],
  }
}

const audioClip = (id: string, startTime: number, duration: number): AudioClip => ({
  id, trackId: 'a0', mediaId: 'm', startTime, duration,
  mediaStart: 0, mediaEnd: duration,
  volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0, keyframes: [],
})

const textClip = (id: string, startTime: number, duration: number): TextClip => ({
  id, trackId: 'tx0', startTime, duration, text: 'T',
  fontFamily: 'Arial', fontSize: 48, fontColor: '#fff',
  backgroundColor: 'transparent', backgroundOpacity: 0,
  bold: false, italic: false, underline: false, align: 'center',
  x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
  letterSpacing: 0, lineHeight: 1.2,
  strokeColor: 'transparent', strokeWidth: 0,
  shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
  keyframes: [],
})

const stickerClip = (id: string, startTime: number, duration: number): StickerClip => ({
  id, trackId: 'st0', startTime, duration, src: 'star',
  x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, keyframes: [],
})

describe('snapTime', () => {
  it('leaves the time alone when nothing is within the threshold', () => {
    const p = project({ clips: [clip('other', 10, 2)] })
    expect(snapTime(p, 5, 20, PX_PER_SEC)).toBe(5)
  })

  it('snaps to the playhead', () => {
    const p = project()
    expect(snapTime(p, 4.05, 4, PX_PER_SEC)).toBe(4)
  })

  it('snaps to zero, so a clip dragged to the start lands flush', () => {
    const p = project()
    expect(snapTime(p, 0.05, 20, PX_PER_SEC)).toBe(0)
  })

  it('snaps to both edges of another clip', () => {
    const p = project({ clips: [clip('other', 10, 2)] })
    expect(snapTime(p, 10.05, 20, PX_PER_SEC)).toBe(10)
    expect(snapTime(p, 11.95, 20, PX_PER_SEC)).toBe(12)
  })

  it('uses a threshold of SNAP_PX at the current zoom', () => {
    const p = project({ clips: [clip('other', 10, 2)] })
    // Just inside and just outside 8px at 80px/s.
    expect(snapTime(p, 10 + THRESHOLD * 0.9, 20, PX_PER_SEC)).toBe(10)
    expect(snapTime(p, 10 + THRESHOLD * 1.1, 20, PX_PER_SEC)).toBe(10 + THRESHOLD * 1.1)
  })

  it('widens the threshold in seconds as the timeline zooms out', () => {
    const p = project({ clips: [clip('other', 10, 2)] })
    // 0.15s away: out of range at 80px/s, in range at 40px/s where 8px is 0.2s.
    expect(snapTime(p, 10.15, 20, 80)).toBe(10.15)
    expect(snapTime(p, 10.15, 20, 40)).toBe(10)
  })

  it('does not snap the dragged clip to itself', () => {
    const p = project({ clips: [clip('dragged', 10, 2)] })
    expect(snapTime(p, 10.05, 20, PX_PER_SEC, ['dragged'])).toBe(10.05)
    // Still snaps to a different clip nearby.
    expect(snapTime(p, 10.05, 20, PX_PER_SEC, ['someone-else'])).toBe(10)
  })

  it('picks the nearest target when several are in range', () => {
    const p = project({
      clips: [clip('a', 10, 2)],
      textClips: [textClip('b', 10.06, 1)],
    })
    expect(snapTime(p, 10.05, 20, PX_PER_SEC)).toBe(10.06)
  })

  it('breaks ties by candidate order, playhead first', () => {
    // Every value here is an exact binary fraction, so the playhead at 1.25 and
    // the clip edge at 0.75 really are equidistant from t=1. The comparison is
    // strict, so the earlier candidate keeps the tie. (Using 1.1 and 0.9 looks
    // like a tie but is not: 1.1-1.0 and 1.0-0.9 differ in the last ulp.)
    const p = project({ clips: [clip('other', 0.75, 1)] })
    expect(snapTime(p, 1.0, 1.25, 16)).toBe(1.25)
  })

  it('treats audio and text clips as snap targets', () => {
    expect(snapTime(project({ audioClips: [audioClip('a', 10, 2)] }), 10.05, 20, PX_PER_SEC)).toBe(10)
    expect(snapTime(project({ textClips: [textClip('t', 10, 2)] }), 10.05, 20, PX_PER_SEC)).toBe(10)
  })

  it('treats sticker clips as snap targets too', () => {
    // Stickers were the one kind left out (D19). The test that pinned the
    // omission is now the test that pins the fix.
    expect(snapTime(project({ stickerClips: [stickerClip('s', 10, 2)] }), 10.05, 20, PX_PER_SEC)).toBe(10)
    expect(snapTime(project({ stickerClips: [stickerClip('s', 10, 2)] }), 11.95, 20, PX_PER_SEC)).toBe(12)
  })

  it('treats markers as snap targets', () => {
    // This is what makes a marker worth placing: a clip dragged near one lands on
    // it, so cutting to a beat does not depend on aiming at a pixel.
    const p = project({ markers: [{ id: 'k', time: 10 }] })
    expect(snapTime(p, 10.05, 20, PX_PER_SEC)).toBe(10)
    expect(snapTime(p, 9.95, 20, PX_PER_SEC)).toBe(10)
  })

  it('leaves a drag alone when the nearest marker is outside the threshold', () => {
    const p = project({ markers: [{ id: 'k', time: 10 }] })
    expect(snapTime(p, 10 + THRESHOLD * 2, 20, PX_PER_SEC)).toBe(10 + THRESHOLD * 2)
  })

  it('still snaps to a marker when the dragged clip itself is excluded', () => {
    // excludeId removes the clip being dragged, not the markers; a clip dragged
    // onto its own start time should still land on a marker sitting there.
    const p = project({ clips: [clip('me', 10, 2)], markers: [{ id: 'k', time: 10 }] })
    expect(snapTime(p, 10.05, 20, PX_PER_SEC, ['me'])).toBe(10)
  })

  it('breaks a tie in favour of a clip edge, because markers sort last', () => {
    // Candidate order is part of the behaviour and markers were appended rather
    // than inserted, so the targets that already snapped keep winning ties. Both
    // distances here are exactly 0.25 - binary fractions, so the tie is real.
    // The clip's own end edge is at 1.75, outside the 0.5s threshold, so it is
    // the start edge at 0.75 that competes with the marker.
    const p = project({
      clips: [clip('other', 0.75, 1)],
      markers: [{ id: 'k', time: 1.25 }],
    })
    expect(snapTime(p, 1.0, 20, 16)).toBe(0.75)
  })
})
