import { describe, expect, it } from 'vitest'
import { windowProject } from './project-window'
import { resolveTransitions } from './transitions'
import type { Clip, Project } from './project-schema'

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 4, mediaStart: 0, mediaEnd: 4,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
    effects: [], keyframes: [],
    ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 12,
    width: 1280, height: 720, fps: 30, backgroundColor: '#000',
    media: [{ id: 'm1', path: '/tmp/a.mp4', name: 'a', type: 'video', duration: 30, size: 1 }],
    tracks: [{ id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 }],
    clips: [], textClips: [], stickerClips: [], audioClips: [],
    transitions: [], captions: [], markers: [],
    ...over,
  }
}

describe('windowProject', () => {
  it('returns the project untouched for an invalid window', () => {
    const p = project({ clips: [clip()] })
    expect(windowProject(p, 5, 5)).toBe(p)
    expect(windowProject(p, 5, 1)).toBe(p)
  })

  it('re-bases the window onto zero and sets the duration', () => {
    const p = project({ clips: [clip({ startTime: 4, duration: 4 })] })
    const w = windowProject(p, 2, 10)
    expect(w.duration).toBe(8)
    expect(w.clips[0].startTime).toBe(2)
  })

  it('drops items entirely outside the window', () => {
    const p = project({ clips: [clip({ id: 'before', startTime: 0, duration: 1 }), clip({ id: 'after', startTime: 9, duration: 2 })] })
    expect(windowProject(p, 2, 8).clips).toEqual([])
  })

  it('keeps an item that merely touches the window edge out', () => {
    // Ends exactly at the in point: nothing of it is inside [start, end).
    const p = project({ clips: [clip({ startTime: 0, duration: 2 })] })
    expect(windowProject(p, 2, 8).clips).toEqual([])
  })

  it('trims a clip straddling the in point and advances its media window', () => {
    const p = project({ clips: [clip({ startTime: 1, duration: 4, mediaStart: 10, mediaEnd: 14 })] })
    const w = windowProject(p, 2, 8).clips[0]
    expect(w.startTime).toBe(0)
    expect(w.duration).toBe(3)
    // One second of the clip was cut from the front, so the source window moves
    // one second in: the frame at the export's first instant is the frame the
    // full project showed at t=2.
    expect(w.mediaStart).toBe(11)
    expect(w.mediaEnd).toBe(14)
  })

  it('scales the media window trim by the clip speed', () => {
    const p = project({ clips: [clip({ startTime: 1, duration: 4, mediaStart: 10, mediaEnd: 18, speed: 2 })] })
    const w = windowProject(p, 2, 8).clips[0]
    // One timeline second at 2x is two source seconds.
    expect(w.mediaStart).toBe(12)
  })

  it('trims a clip straddling the out point without moving its start', () => {
    const p = project({ clips: [clip({ startTime: 6, duration: 4, mediaStart: 0, mediaEnd: 4 })] })
    const w = windowProject(p, 2, 8).clips[0]
    expect(w.startTime).toBe(4)
    expect(w.duration).toBe(2)
    expect(w.mediaEnd).toBe(2)
  })

  it('shifts keyframe times with the window', () => {
    const p = project({
      clips: [clip({ keyframes: [{ id: 'k', time: 5, property: 'x', value: 1, easing: 'linear' }] })],
    })
    const w = windowProject(p, 2, 8).clips[0]
    expect(w.keyframes[0].time).toBe(3)
  })

  it('spends the part of a fade-in that happened before the window', () => {
    const p = project({
      audioClips: [{
        id: 'a1', mediaId: 'm1', trackId: 't0', startTime: 0, duration: 8,
        mediaStart: 0, mediaEnd: 8, volume: 1, muted: false,
        fadein: 4, fadeout: 4, speed: 1, pitch: 0, keyframes: [],
      }],
    })
    const w = windowProject(p, 2, 6).audioClips[0]
    // Two of the four fade-in seconds are already past at the window's start.
    expect(w.fadein).toBe(2)
    // The fade-out loses its tail to the window edge and completes at the new end.
    expect(w.fadeout).toBe(2)
  })

  it('never lets a trimmed fade exceed the trimmed duration', () => {
    const p = project({
      audioClips: [{
        id: 'a1', mediaId: 'm1', trackId: 't0', startTime: 0, duration: 8,
        mediaStart: 0, mediaEnd: 8, volume: 1, muted: false,
        fadein: 8, fadeout: 8, speed: 1, pitch: 0, keyframes: [],
      }],
    })
    const w = windowProject(p, 3, 4).audioClips[0]
    expect(w.duration).toBe(1)
    expect(w.fadein).toBeLessThanOrEqual(1)
    expect(w.fadeout).toBeLessThanOrEqual(1)
  })

  it('trims captions and markers the same way', () => {
    const p = project({
      captions: [{ id: 'cap', startTime: 1, endTime: 5, text: 'hi' }],
      markers: [{ id: 'm', time: 3 }, { id: 'out', time: 9 }],
    })
    const w = windowProject(p, 2, 8)
    expect(w.captions[0]).toMatchObject({ startTime: 0, endTime: 3 })
    expect(w.markers).toEqual([{ id: 'm', time: 1 }])
  })

  it('keeps a transition whose clips both survive, and drops one whose end was cut', () => {
    const p = project({
      clips: [
        clip({ id: 'A', startTime: 0, duration: 4 }),
        clip({ id: 'B', startTime: 4, duration: 4 }),
        clip({ id: 'C', startTime: 8, duration: 4 }),
      ],
      transitions: [
        { id: 't1', clipId: 'A', type: 'fade', duration: 1 },
        { id: 't2', clipId: 'B', type: 'fade', duration: 1 },
      ],
    })
    // The window ends inside B, so C is dropped and t2 loses its incoming clip.
    const w = windowProject(p, 1, 6)
    const resolved = resolveTransitions(w).map(r => r.transition.id)
    expect(resolved).toEqual(['t1'])
    // And the surviving transition's boundary moved with its clips.
    expect(resolveTransitions(w)[0].boundary).toBe(3)
  })
})
