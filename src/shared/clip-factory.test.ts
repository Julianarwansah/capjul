import { describe, expect, it } from 'vitest'
import { copyClipAfter, makeAudioClipFromMedia, makeClipFromMedia } from './clip-factory'
import type { Keyframe, MediaFile } from './project-schema'

const media = (type: MediaFile['type'], duration = 10): MediaFile => ({
  id: 'm1', path: `/tmp/a.${type === 'audio' ? 'mp3' : 'mp4'}`, name: 'a', type, duration, size: 1,
})

describe('makeClipFromMedia', () => {
  it('refuses audio media on a video track', () => {
    expect(makeClipFromMedia(media('audio'), 't0', 1)).toBe(null)
  })

  it('maps the media window onto the timeline position', () => {
    const clip = makeClipFromMedia(media('video', 7), 't0', 2.5)
    expect(clip).toMatchObject({
      trackId: 't0', startTime: 2.5, duration: 7, mediaStart: 0, mediaEnd: 7,
    })
  })

  it('accepts images and falls back to 5s when duration is unknown', () => {
    const clip = makeClipFromMedia(media('image', 0), 't0', 0)
    expect(clip?.duration).toBe(5)
    expect(clip?.mediaEnd).toBe(5)
  })
})

describe('makeAudioClipFromMedia', () => {
  it('refuses non-audio media on an audio track', () => {
    expect(makeAudioClipFromMedia(media('video'), 't0', 0)).toBe(null)
  })

  it('falls back to 30s when duration is unknown', () => {
    expect(makeAudioClipFromMedia(media('audio', 0), 't0', 0)?.duration).toBe(30)
  })
})

describe('copyClipAfter', () => {
  const clip = {
    id: 'orig', startTime: 2, duration: 5,
    keyframes: [
      { id: 'k1', property: 'x', time: 2, value: 0, easing: 'linear' },
      { id: 'k2', property: 'x', time: 7, value: 1, easing: 'linear' },
    ] as Keyframe[],
  }

  it('lands just past the original end by the default gap', () => {
    expect(copyClipAfter(clip).startTime).toBeCloseTo(7.1)
  })

  it('honours an explicit gap', () => {
    expect(copyClipAfter(clip, 1).startTime).toBe(8)
  })

  it('gives the copy its own id', () => {
    expect(copyClipAfter(clip).id).not.toBe('orig')
  })

  it('shifts keyframe times with the clip, because they are absolute', () => {
    // A copy that starts later but keeps the original's keyframe times would
    // replay the original's poses at the wrong moment.
    const times = copyClipAfter(clip).keyframes.map(k => k.time)
    expect(times[0]).toBeCloseTo(7.1)
    expect(times[1]).toBeCloseTo(12.1)
  })

  it('gives the shifted keyframes fresh ids so none are shared', () => {
    const ids = copyClipAfter(clip).keyframes.map(k => k.id)
    expect(ids).not.toContain('k1')
    expect(ids).not.toContain('k2')
  })

  it('copies a clip that has no keyframes at all', () => {
    expect(copyClipAfter({ id: 'a', startTime: 0, duration: 3 }).keyframes).toEqual([])
  })

  it('carries the rest of the clip across untouched', () => {
    const copied = copyClipAfter({ ...clip, trackId: 't0', volume: 0.5 })
    expect(copied).toMatchObject({ trackId: 't0', volume: 0.5, duration: 5 })
  })
})
