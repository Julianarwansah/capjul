import { describe, expect, it } from 'vitest'
import { trackMuted, trackOf } from './track-audio'
import type { Project, Track } from './project-schema'

const track = (id: string, muted: boolean): Track =>
  ({ id, type: 'video', label: id, muted, locked: false, height: 64 })

const project = (tracks: Track[]): Project => ({
  id: 'p', name: 'P', createdAt: 0, duration: 6,
  width: 1280, height: 720, fps: 30, backgroundColor: '#000',
  media: [], tracks,
  clips: [], textClips: [], stickerClips: [], audioClips: [],
  transitions: [], captions: [], markers: [],
})

describe('trackOf', () => {
  it('finds a track by id', () => {
    expect(trackOf(project([track('t0', false)]), 't0')?.id).toBe('t0')
  })

  it('returns undefined for a track that is not there', () => {
    expect(trackOf(project([track('t0', false)]), 'gone')).toBeUndefined()
  })
})

describe('trackMuted', () => {
  it('is true only for a muted track', () => {
    const p = project([track('quiet', true), track('loud', false)])
    expect(trackMuted(p, 'quiet')).toBe(true)
    expect(trackMuted(p, 'loud')).toBe(false)
  })

  // Removing a track is not muting it. Silencing an orphaned clip would be a
  // second, unasked-for consequence of a delete, and paintOrder already decides
  // separately what an orphan paints.
  it('treats a missing track as audible', () => {
    expect(trackMuted(project([]), 'gone')).toBe(false)
  })
})
