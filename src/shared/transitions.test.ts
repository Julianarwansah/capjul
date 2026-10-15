import { describe, expect, it } from 'vitest'
import { findActiveTransition } from './transitions'
import type { Clip, Project } from './project-schema'

// The pose maths these transitions resolve to is tested in transition-pose.test.ts;
// this file covers resolution: which transition runs, over which clips, at what
// progress.

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

/** Two adjacent clips on t0, with a 1s transition straddling the cut at t=4. */
function twoClips(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 7,
    width: 1280, height: 720, fps: 30, backgroundColor: '#000000',
    media: [
      { id: 'm1', path: '/tmp/a.mp4', name: 'a', type: 'video', duration: 10, size: 1 },
      { id: 'm2', path: '/tmp/b.mp4', name: 'b', type: 'video', duration: 10, size: 1 },
    ],
    tracks: [
      { id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 },
      { id: 't1', type: 'video', label: 'Top', muted: false, locked: false, height: 64 },
    ],
    clips: [
      clip({ id: 'A', mediaId: 'm1', trackId: 't0', startTime: 0, duration: 4 }),
      clip({ id: 'B', mediaId: 'm2', trackId: 't0', startTime: 4, duration: 3 }),
    ],
    textClips: [], stickerClips: [], audioClips: [], captions: [], markers: [],
    transitions: [{ id: 'tr1', clipId: 'A', type: 'fade', duration: 1 }],
    ...over,
  }
}

describe('findActiveTransition', () => {
  it('is null with no transitions', () => {
    expect(findActiveTransition(twoClips({ transitions: [] }), 4)).toBeNull()
  })

  it('straddles the end of its clip, half the duration either side', () => {
    const p = twoClips()
    // Window is [3.5, 4.5] for a 1s transition on a clip ending at 4.
    expect(findActiveTransition(p, 3.4)).toBeNull()
    expect(findActiveTransition(p, 3.5)).not.toBeNull()
    expect(findActiveTransition(p, 4.5)).not.toBeNull()
    expect(findActiveTransition(p, 4.6)).toBeNull()
  })

  it('reports progress from 0 at the window start to 1 at the end', () => {
    const p = twoClips()
    expect(findActiveTransition(p, 3.5)?.progress).toBeCloseTo(0)
    expect(findActiveTransition(p, 4.0)?.progress).toBeCloseTo(0.5)
    expect(findActiveTransition(p, 4.5)?.progress).toBeCloseTo(1)
  })

  it('resolves both clips and their media', () => {
    const active = findActiveTransition(twoClips(), 4)
    expect(active?.clipA.id).toBe('A')
    expect(active?.clipB.id).toBe('B')
    expect(active?.mediaA?.id).toBe('m1')
    expect(active?.mediaB?.id).toBe('m2')
  })

  it('never activates on the last clip of a track, which has nothing to blend into', () => {
    const p = twoClips({
      transitions: [{ id: 'tr1', clipId: 'B', type: 'fade', duration: 1 }],
    })
    // B ends at 7 with no clip after it on t0.
    expect(findActiveTransition(p, 7)).toBeNull()
  })

  it('picks the next clip on the same track by start time, ignoring other tracks', () => {
    const p = twoClips({
      clips: [
        clip({ id: 'A', trackId: 't0', startTime: 0, duration: 4 }),
        clip({ id: 'B', trackId: 't0', startTime: 4, duration: 3 }),
        // Earlier on another track, so it must not be chosen as clipB.
        clip({ id: 'other', trackId: 't1', startTime: 1, duration: 2 }),
      ],
    })
    expect(findActiveTransition(p, 4)?.clipB.id).toBe('B')
  })

  it('is null when the transition points at a clip that no longer exists', () => {
    const p = twoClips({
      transitions: [{ id: 'tr1', clipId: 'deleted', type: 'fade', duration: 1 }],
    })
    expect(findActiveTransition(p, 4)).toBeNull()
  })

  it('leaves media undefined rather than throwing when a clip has no media entry', () => {
    const p = twoClips()
    p.clips[0] = { ...p.clips[0], mediaId: 'gone' }
    const active = findActiveTransition(p, 4)
    expect(active?.mediaA).toBeUndefined()
    expect(active?.mediaB?.id).toBe('m2')
  })

  it('reports a zero-duration transition as finished instead of NaN', () => {
    // The panel's slider cannot produce this, but a hand-edited or corrupt
    // project file can, and 0/0 would otherwise flow through as opacity: NaN.
    const p = twoClips({
      transitions: [{ id: 'tr1', clipId: 'A', type: 'fade', duration: 0 }],
    })
    expect(findActiveTransition(p, 4)?.progress).toBe(1)
  })
})
