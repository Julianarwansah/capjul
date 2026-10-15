import { describe, expect, it } from 'vitest'
import { TRANSITION_TYPES, findActiveTransition, transitionStyles } from './transitions'
import type { Clip, Project } from './project-schema'

// 0.25 keeps every derived percentage and scale an exact binary fraction, so
// the string assertions below do not depend on float formatting.
const P = 0.25

describe('transitionStyles', () => {
  it('returns a style pair for every type it claims to support', () => {
    for (const type of TRANSITION_TYPES) {
      const pair = transitionStyles(type, P)
      expect(Array.isArray(pair)).toBe(true)
      expect(pair).toHaveLength(2)
      expect(pair[0]).toBeTypeOf('object')
      expect(pair[1]).toBeTypeOf('object')
    }
  })

  it('crossfades so the two opacities always sum to one', () => {
    for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const [out, incoming] = transitionStyles('fade', progress)
      expect((out.opacity ?? 0) + (incoming.opacity ?? 0)).toBeCloseTo(1)
    }
  })

  it('treats dissolve as the same crossfade as fade', () => {
    expect(transitionStyles('dissolve', P)).toEqual(transitionStyles('fade', P))
  })

  it('starts with the outgoing clip whole and ends with the incoming one', () => {
    const [atStartOut, atStartIn] = transitionStyles('fade', 0)
    expect(atStartOut.opacity).toBe(1)
    expect(atStartIn.opacity).toBe(0)

    const [atEndOut, atEndIn] = transitionStyles('fade', 1)
    expect(atEndOut.opacity).toBe(0)
    expect(atEndIn.opacity).toBe(1)
  })

  it('falls back to a crossfade for a type it does not know', () => {
    // A project saved by a newer build must still render rather than throw.
    expect(transitionStyles('sparkle', P)).toEqual(transitionStyles('fade', P))
  })

  it('wipes with complementary clip-path insets', () => {
    const [out, incoming] = transitionStyles('wipe-left', P)
    expect(out.clipPath).toBe('inset(0 25% 0 0)')
    expect(incoming.clipPath).toBe('inset(0 0 0 75%)')
  })

  it('mirrors each wipe direction against its opposite', () => {
    // wipe-left and wipe-right must inset opposite edges, or the two clips
    // would uncover the same side and leave a gap.
    expect(transitionStyles('wipe-left', P)[0].clipPath).toBe('inset(0 25% 0 0)')
    expect(transitionStyles('wipe-right', P)[0].clipPath).toBe('inset(0 0 0 25%)')
    expect(transitionStyles('wipe-up', P)[0].clipPath).toBe('inset(25% 0 0 0)')
    expect(transitionStyles('wipe-down', P)[0].clipPath).toBe('inset(0 0 25% 0)')
  })

  it('slides the two clips in opposite directions', () => {
    const [out, incoming] = transitionStyles('slide-left', P)
    expect(out.transform).toBe('translateX(-25%)')
    expect(incoming.transform).toBe('translateX(75%)')

    const [outR, incomingR] = transitionStyles('slide-right', P)
    expect(outR.transform).toBe('translateX(25%)')
    expect(incomingR.transform).toBe('translateX(-75%)')
  })

  it('scales the outgoing clip up while zooming in and down while zooming out', () => {
    expect(transitionStyles('zoom-in', P)[0]).toEqual({ transform: 'scale(1.125)', opacity: 0.75 })
    expect(transitionStyles('zoom-out', P)[1]).toEqual({ transform: 'scale(1.75)', opacity: 0.25 })
  })

  it('blurs both sides, the incoming one more at the start', () => {
    const [out, incoming] = transitionStyles('blur', P)
    expect(out.filter).toBe('blur(4px)')
    expect(incoming.filter).toBe('blur(12px)')
    // Blur only dims the outgoing clip halfway, unlike a plain crossfade.
    expect(out.opacity).toBeCloseTo(0.875)
    expect(incoming.opacity).toBeCloseTo(0.25)
  })

  it('blanks both clips at the midpoint of a flash', () => {
    // The one transition where the opacities deliberately do not sum to one:
    // a flash dips to nothing and comes back.
    const [out, incoming] = transitionStyles('flash', 0.5)
    expect(out.opacity).toBe(0)
    expect(incoming.opacity).toBe(0)

    expect(transitionStyles('flash', P)[0].opacity).toBeCloseTo(0.5)
    expect(transitionStyles('flash', P)[1].opacity).toBe(0)
    expect(transitionStyles('flash', 0.75)[0].opacity).toBe(0)
    expect(transitionStyles('flash', 0.75)[1].opacity).toBeCloseTo(0.5)
  })
})

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
