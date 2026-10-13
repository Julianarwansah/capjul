import { describe, expect, it } from 'vitest'
import { makeAudioClipFromMedia, makeClipFromMedia } from './clip-factory'
import type { MediaFile } from './project-schema'

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
