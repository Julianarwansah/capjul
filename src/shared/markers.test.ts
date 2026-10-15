import { describe, expect, it } from 'vitest'
import { markerAt, markerTolerance, neighborMarker, toggleMarker } from './markers'
import type { Marker } from './project-schema'

const FPS = 30
const FRAME = 1 / FPS
const m = (id: string, time: number): Marker => ({ id, time })

describe('markerTolerance', () => {
  it('is half a frame, so one frame away is outside it', () => {
    expect(markerTolerance(FPS)).toBeCloseTo(0.5 / FPS, 12)
    expect(markerTolerance(FPS)).toBeLessThan(FRAME)
  })

  it('narrows as the frame rate rises', () => {
    expect(markerTolerance(60)).toBeLessThan(markerTolerance(30))
  })
})

describe('markerAt', () => {
  const markers = [m('a', 1), m('b', 2.5)]

  it('finds a marker exactly on the time', () => {
    expect(markerAt(markers, 2.5, FPS)?.id).toBe('b')
  })

  it('finds a marker on the same frame as the playhead', () => {
    // Stepping the playhead by whole frames does not land on exact decimals, so
    // a marker is "here" when both are on the same frame rather than equal.
    expect(markerAt(markers, 1 + FRAME * 0.4, FPS)?.id).toBe('a')
  })

  it('does not claim a marker one frame away', () => {
    expect(markerAt(markers, 1 + FRAME, FPS)).toBeUndefined()
    expect(markerAt(markers, 1 - FRAME, FPS)).toBeUndefined()
  })

  it('returns undefined for no markers', () => {
    expect(markerAt([], 1, FPS)).toBeUndefined()
  })
})

describe('toggleMarker', () => {
  it('adds when nothing is on that frame', () => {
    const r = toggleMarker([m('a', 1)], 2, FPS, 'new')
    expect(r.added).toBe(true)
    expect(r.markers).toEqual([m('a', 1), m('new', 2)])
  })

  it('removes when one is already on that frame', () => {
    const r = toggleMarker([m('a', 1), m('b', 2)], 2, FPS, 'new')
    expect(r.added).toBe(false)
    expect(r.markers).toEqual([m('a', 1)])
  })

  // Without this, holding the binding down would stack markers on one frame and
  // the flag would need pixel aim to remove.
  it('cannot stack two markers on the same frame', () => {
    const first = toggleMarker([], 3, FPS, 'a')
    const second = toggleMarker(first.markers, 3 + FRAME * 0.2, FPS, 'b')
    expect(second.markers).toEqual([])
  })

  it('keeps the stored array sorted by time whatever order markers arrive in', () => {
    let r = toggleMarker([], 5, FPS, 'late')
    r = toggleMarker(r.markers, 1, FPS, 'early')
    r = toggleMarker(r.markers, 3, FPS, 'mid')
    expect(r.markers.map(x => x.time)).toEqual([1, 3, 5])
  })

  it('does not mutate the array it was given', () => {
    const input = [m('a', 1)]
    toggleMarker(input, 2, FPS, 'new')
    expect(input).toEqual([m('a', 1)])
  })
})

describe('neighborMarker', () => {
  const markers = [m('a', 1), m('b', 3), m('c', 7)]

  it('steps forward to the next marker', () => {
    expect(neighborMarker(markers, 1, 1)?.id).toBe('b')
    expect(neighborMarker(markers, 3, 1)?.id).toBe('c')
  })

  it('steps back to the previous marker', () => {
    expect(neighborMarker(markers, 7, -1)?.id).toBe('b')
    expect(neighborMarker(markers, 3, -1)?.id).toBe('a')
  })

  // Strict inequality is what makes the binding repeatable: landing on a marker
  // and pressing the key again must move, not re-select the same one.
  it('skips a marker the playhead is already exactly on', () => {
    expect(neighborMarker(markers, 3, 1)?.id).toBe('c')
    expect(neighborMarker(markers, 3, -1)?.id).toBe('a')
  })

  it('picks the nearest, not the first in array order', () => {
    const unsorted = [m('far', 9), m('near', 4)]
    expect(neighborMarker(unsorted, 1, 1)?.id).toBe('near')
  })

  it('returns undefined past the ends', () => {
    expect(neighborMarker(markers, 7, 1)).toBeUndefined()
    expect(neighborMarker(markers, 1, -1)).toBeUndefined()
  })

  it('returns undefined with no markers', () => {
    expect(neighborMarker([], 5, 1)).toBeUndefined()
    expect(neighborMarker([], 5, -1)).toBeUndefined()
  })
})
