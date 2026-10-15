import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from './editorStore'
import { computeDuration } from '../shared/project-duration'
import { paintOrder } from '../shared/paint-order'
import type { AudioClip, Caption, Clip, MediaFile, StickerClip, TextClip } from '../types'

const s = () => useEditorStore.getState()

function makeMedia(over: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'media-1', path: '/tmp/a.mp4', name: 'a.mp4', type: 'video',
    duration: 10, width: 1920, height: 1080, size: 1024,
    ...over,
  }
}

function makeClip(over: Partial<Clip> = {}): Clip {
  return {
    id: crypto.randomUUID(), mediaId: 'media-1', trackId: 'main-video',
    startTime: 0, duration: 5, mediaStart: 0, mediaEnd: 5,
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

function makeTextClip(over: Partial<TextClip> = {}): TextClip {
  return {
    id: crypto.randomUUID(), trackId: 'text-1', startTime: 0, duration: 5,
    text: 'T', fontFamily: 'Arial', fontSize: 48, fontColor: '#fff',
    backgroundColor: 'transparent', backgroundOpacity: 0,
    bold: false, italic: false, underline: false,
    align: 'center', x: 0.5, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1,
    letterSpacing: 0, lineHeight: 1.2,
    strokeColor: 'transparent', strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 8, shadowX: 2, shadowY: 2,
    keyframes: [],
    ...over,
  }
}

function makeAudioClip(over: Partial<AudioClip> = {}): AudioClip {
  return {
    id: crypto.randomUUID(), trackId: 'main-audio', mediaId: 'media-1',
    startTime: 0, duration: 5, mediaStart: 0, mediaEnd: 5,
    volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0,
    keyframes: [],
    ...over,
  }
}

function makeSticker(over: Partial<StickerClip> = {}): StickerClip {
  return {
    id: crypto.randomUUID(), trackId: 'sticker-1', startTime: 0, duration: 5,
    src: 'star.png', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    keyframes: [],
    ...over,
  }
}

function makeCaption(over: Partial<Caption> = {}): Caption {
  return { id: crypto.randomUUID(), startTime: 0, endTime: 5, text: 'hi', ...over }
}

beforeEach(() => s().newProject())

describe('computeDuration', () => {
  it('is 0 for an empty project rather than a fixed default', () => {
    expect(computeDuration(s().project)).toBe(0)
  })

  it('is the end of the last clip', () => {
    const p = { ...s().project, clips: [makeClip({ startTime: 2, duration: 3 })] }
    expect(computeDuration(p)).toBe(5)
  })

  it('takes the maximum across every timed element', () => {
    const p = {
      ...s().project,
      clips: [makeClip({ startTime: 0, duration: 4 })],
      textClips: [makeTextClip({ startTime: 10, duration: 2 })],
      audioClips: [makeAudioClip({ startTime: 1, duration: 2 })],
      stickerClips: [makeSticker({ startTime: 3, duration: 3 })],
      captions: [makeCaption({ endTime: 7 })],
    }
    expect(computeDuration(p)).toBe(12)
  })

  it('reads caption endTime, which has no duration field', () => {
    const p = { ...s().project, captions: [makeCaption({ endTime: 9 })] }
    expect(computeDuration(p)).toBe(9)
  })
})

describe('project.duration stays derived', () => {
  it('grows when a clip is added', () => {
    s().addClip(makeClip({ startTime: 0, duration: 7 }))
    expect(s().project.duration).toBe(7)
  })

  it('shrinks when the longest clip is removed', () => {
    const a = makeClip({ startTime: 0, duration: 3 })
    const b = makeClip({ startTime: 3, duration: 10 })
    s().addClip(a)
    s().addClip(b)
    expect(s().project.duration).toBe(13)

    s().removeClip(b.id)
    expect(s().project.duration).toBe(3)
  })

  it('follows a clip that is dragged further out', () => {
    const c = makeClip({ startTime: 0, duration: 5 })
    s().addClip(c)
    s().updateClip(c.id, { startTime: 20 })
    expect(s().project.duration).toBe(25)
  })

  it('recomputes on load, fixing saved projects with a stale duration', () => {
    const stale = { ...s().project, duration: 60, clips: [makeClip({ startTime: 0, duration: 4 })] }
    s().loadProject(stale)
    expect(s().project.duration).toBe(4)
  })
})

describe('removeMedia', () => {
  it('cascades to clips and audio clips that reference the media', () => {
    s().addMedia([makeMedia(), makeMedia({ id: 'media-2', path: '/tmp/b.mp3', type: 'audio', name: 'b.mp3' })])
    s().addClip(makeClip({ mediaId: 'media-1' }))
    s().addClip(makeClip({ id: 'other', mediaId: 'media-2' }))
    s().addAudioClip(makeAudioClip({ mediaId: 'media-2' }))

    s().removeMedia('media-2')

    expect(s().project.media.map(m => m.id)).toEqual(['media-1'])
    expect(s().project.clips.map(c => c.id)).toHaveLength(1)
    expect(s().project.audioClips).toEqual([])
  })

  it('is undoable as one step, bringing the clips back', () => {
    s().addMedia([makeMedia()])
    s().addClip(makeClip())
    s().removeMedia('media-1')
    expect(s().project.media).toEqual([])

    s().undo()
    expect(s().project.media).toHaveLength(1)
    expect(s().project.clips).toHaveLength(1)
  })
})

describe('undo / redo', () => {
  it('seeds history with the initial project so the first undo has somewhere to go', () => {
    // Root cause of the original data-loss bug: history started empty with
    // historyIndex -1, so the first undo fell off the end of the array.
    expect(s().history).toHaveLength(1)
    expect(s().historyIndex).toBe(0)
    expect(s().history[0]).toBe(s().project)
  })

  it('restores the previous project instead of factory-resetting it', () => {
    // Regression: undo used to step historyIndex to -1 and call
    // createDefaultProject(), wiping imported media and track setup.
    s().addMedia([makeMedia()])
    s().addClip(makeClip())
    expect(s().project.clips).toHaveLength(1)

    s().undo()

    expect(s().project.clips).toHaveLength(0)
    expect(s().project.media).toHaveLength(1)
    expect(s().project.tracks).toHaveLength(2)
  })

  it('steps back exactly one action at a time', () => {
    const a = makeClip()
    const b = makeClip()
    s().addClip(a)
    s().addClip(b)
    expect(s().project.clips.map(c => c.id)).toEqual([a.id, b.id])

    s().undo()
    expect(s().project.clips.map(c => c.id)).toEqual([a.id])

    s().undo()
    expect(s().project.clips).toEqual([])
  })

  it('is a no-op at the start of history', () => {
    const before = s().project
    s().undo()
    expect(s().project).toBe(before)
    expect(s().historyIndex).toBe(0)
  })

  it('redo reapplies the undone action', () => {
    const a = makeClip()
    s().addClip(a)
    s().undo()
    expect(s().project.clips).toEqual([])

    s().redo()
    expect(s().project.clips.map(c => c.id)).toEqual([a.id])
  })

  it('is unavailable after undoing everything', () => {
    expect(s().historyIndex).toBe(0)
    s().addClip(makeClip())
    s().undo()
    expect(s().historyIndex).toBe(0)
    s().undo()
    expect(s().project.clips).toHaveLength(0)
  })

  it('discards the redo branch when a new action follows an undo', () => {
    s().addClip(makeClip())
    s().undo()

    const c = makeClip()
    s().addClip(c)
    expect(s().historyIndex).toBe(s().history.length - 1)

    s().redo()
    expect(s().project.clips.map(x => x.id)).toEqual([c.id])
  })

  it('makes updateClip undoable', () => {
    // updateClip never recorded history before, so drags could not be undone.
    const c = makeClip({ startTime: 0 })
    s().addClip(c)
    s().updateClip(c.id, { startTime: 12 })
    expect(s().project.clips[0].startTime).toBe(12)

    s().undo()
    expect(s().project.clips[0].startTime).toBe(0)
  })

  it('makes track edits undoable', () => {
    s().addTrack('video')
    expect(s().project.tracks).toHaveLength(3)

    s().undo()
    expect(s().project.tracks).toHaveLength(2)
  })

  it('returns the new track id so panels can place clips on it', () => {
    const id = s().addTrack('sticker')
    expect(s().project.tracks.some(t => t.id === id && t.type === 'sticker')).toBe(true)
  })

  it('caps history without breaking the index', () => {
    for (let i = 0; i < 80; i++) {
      s().addClip(makeClip({ startTime: i * 10, duration: 1 }))
    }
    expect(s().history.length).toBeLessThanOrEqual(50)
    expect(s().historyIndex).toBe(s().history.length - 1)
  })
})

describe('history coalescing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('collapses a rapid drag into one undo step', () => {
    const c = makeClip({ startTime: 0 })
    s().addClip(c)
    const afterAdd = s().history.length

    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(50)
      s().updateClip(c.id, { startTime: i })
    }

    expect(s().project.clips[0].startTime).toBe(5)
    expect(s().history.length).toBe(afterAdd + 1)

    s().undo()
    expect(s().project.clips[0].startTime).toBe(0)
  })

  it('does not let a drag swallow the discrete action before it', () => {
    const c = makeClip({ startTime: 0 })
    s().addClip(c)
    vi.advanceTimersByTime(50)
    s().updateClip(c.id, { startTime: 8 })

    // First undo reverts the move, not the add.
    s().undo()
    expect(s().project.clips).toHaveLength(1)
    expect(s().project.clips[0].startTime).toBe(0)

    s().undo()
    expect(s().project.clips).toHaveLength(0)
  })

  it('starts a new undo step once editing pauses', () => {
    const c = makeClip({ startTime: 0 })
    s().addClip(c)
    vi.advanceTimersByTime(50)
    s().updateClip(c.id, { startTime: 1 })
    const after = s().history.length

    vi.advanceTimersByTime(5000)
    s().updateClip(c.id, { startTime: 2 })

    expect(s().history.length).toBe(after + 1)
  })
})

// The three selection-wide actions below replace per-kind fan-out that used to
// be duplicated in App.tsx, TopBar.tsx and Timeline/index.tsx. Two of those
// copies only handled video clips, and because App and Timeline both listened
// for keydown on window, one Delete keypress could spend several undo steps.
// These tests pin the fan-out and the one-gesture-one-undo-step rule.

function seedOneOfEachKind(startTime = 0, duration = 10) {
  const clip = makeClip({ startTime, duration, mediaStart: 0, mediaEnd: duration })
  const text = makeTextClip({ startTime, duration })
  const sticker = makeSticker({ startTime, duration })
  const audio = makeAudioClip({ startTime, duration, mediaStart: 0, mediaEnd: duration })
  s().addClip(clip)
  s().addTextClip(text)
  s().addStickerClip(sticker)
  s().addAudioClip(audio)
  return { clip, text, sticker, audio }
}

function selectAll(seeded: ReturnType<typeof seedOneOfEachKind>) {
  s().setSelected({
    clips: [seeded.clip.id],
    texts: [seeded.text.id],
    stickers: [seeded.sticker.id],
    audios: [seeded.audio.id],
  })
}

describe('splitAtPlayhead', () => {
  it('cuts every selected kind at the playhead', () => {
    selectAll(seedOneOfEachKind())
    s().setCurrentTime(4)

    s().splitAtPlayhead()

    const lists = [
      s().project.clips, s().project.textClips,
      s().project.stickerClips, s().project.audioClips,
    ]
    for (const list of lists) {
      expect(list).toHaveLength(2)
      expect(list.map(c => c.duration).sort((a, b) => a - b)).toEqual([4, 6])
    }
  })

  it('costs exactly one undo step across all four kinds', () => {
    selectAll(seedOneOfEachKind())
    s().setCurrentTime(4)
    const before = s().history.length

    s().splitAtPlayhead()

    expect(s().history.length).toBe(before + 1)
    s().undo()
    expect(s().project.clips).toHaveLength(1)
    expect(s().project.textClips).toHaveLength(1)
    expect(s().project.stickerClips).toHaveLength(1)
    expect(s().project.audioClips).toHaveLength(1)
  })

  it('spends no undo step when the playhead is outside every selected clip', () => {
    selectAll(seedOneOfEachKind())
    s().setCurrentTime(20)
    const before = s().history.length

    s().splitAtPlayhead()

    expect(s().project.clips).toHaveLength(1)
    expect(s().history.length).toBe(before)
  })

  it('clears a selection whose ids no longer exist after the cut', () => {
    selectAll(seedOneOfEachKind())
    s().setCurrentTime(4)

    s().splitAtPlayhead()

    expect(s().selectedClipIds).toEqual([])
    expect(s().selectedTextIds).toEqual([])
    expect(s().selectedStickerIds).toEqual([])
    expect(s().selectedAudioIds).toEqual([])
  })

  it('advances the media window of the second half', () => {
    const clip = makeClip({ startTime: 0, duration: 10, mediaStart: 2, mediaEnd: 12, speed: 1 })
    s().addClip(clip)
    s().setSelected({ clips: [clip.id] })
    s().setCurrentTime(4)

    s().splitAtPlayhead()

    const [first, second] = s().project.clips
    expect(first).toMatchObject({ mediaStart: 2, mediaEnd: 6 })
    expect(second).toMatchObject({ mediaStart: 6, mediaEnd: 12 })
  })

  it('keeps each half animating its own part of the move', () => {
    const clip = makeClip({
      startTime: 0, duration: 10,
      keyframes: [
        { id: 'k1', property: 'x', time: 0, value: 0, easing: 'linear' },
        { id: 'k2', property: 'x', time: 10, value: 100, easing: 'linear' },
      ],
    })
    s().addClip(clip)
    s().setSelected({ clips: [clip.id] })
    s().setCurrentTime(5)

    s().splitAtPlayhead()

    const [first, second] = s().project.clips
    // The first half must not keep the far keyframe, or it animates toward a
    // value it should never reach.
    expect(first.keyframes.every(k => k.time <= 5)).toBe(true)
    expect(second.keyframes.every(k => k.time >= 5)).toBe(true)
  })
})

describe('duplicateSelection', () => {
  it('copies every selected kind just past the original', () => {
    selectAll(seedOneOfEachKind(0, 5))

    s().duplicateSelection()

    expect(s().project.clips[1].startTime).toBeCloseTo(5.1)
    expect(s().project.textClips[1].startTime).toBeCloseTo(5.1)
    expect(s().project.stickerClips[1].startTime).toBeCloseTo(5.1)
    expect(s().project.audioClips[1].startTime).toBeCloseTo(5.1)
  })

  it('selects the copies so a repeat chains them end to end', () => {
    const seeded = seedOneOfEachKind(0, 5)
    selectAll(seeded)

    s().duplicateSelection()
    expect(s().selectedClipIds).not.toEqual([seeded.clip.id])

    s().duplicateSelection()
    expect(s().project.clips).toHaveLength(3)
    expect(s().project.clips[2].startTime).toBeCloseTo(10.2)
  })

  it('shifts keyframe times with the copy, since they are absolute', () => {
    const clip = makeClip({
      startTime: 0, duration: 5,
      keyframes: [
        { id: 'k1', property: 'x', time: 0, value: 0, easing: 'linear' },
        { id: 'k2', property: 'x', time: 5, value: 1, easing: 'linear' },
      ],
    })
    s().addClip(clip)
    s().setSelected({ clips: [clip.id] })

    s().duplicateSelection()

    const copy = s().project.clips[1]
    expect(copy.keyframes.map(k => k.time)).toEqual([5.1, 10.1])
    expect(copy.keyframes.map(k => k.id)).not.toContain('k1')
  })

  it('is one undo step', () => {
    selectAll(seedOneOfEachKind())
    const before = s().history.length

    s().duplicateSelection()

    expect(s().history.length).toBe(before + 1)
    s().undo()
    expect(s().project.clips).toHaveLength(1)
  })

  it('spends no undo step when nothing is selected', () => {
    const before = s().history.length

    s().duplicateSelection()

    expect(s().history.length).toBe(before)
  })
})

describe('deleteSelection', () => {
  it('removes every selected kind in one undo step', () => {
    selectAll(seedOneOfEachKind())
    const before = s().history.length

    s().deleteSelection()

    expect(s().project.clips).toEqual([])
    expect(s().project.textClips).toEqual([])
    expect(s().project.stickerClips).toEqual([])
    expect(s().project.audioClips).toEqual([])
    expect(s().history.length).toBe(before + 1)
  })

  it('restores all four kinds on undo', () => {
    selectAll(seedOneOfEachKind())
    s().deleteSelection()

    s().undo()

    expect(s().project.clips).toHaveLength(1)
    expect(s().project.textClips).toHaveLength(1)
    expect(s().project.stickerClips).toHaveLength(1)
    expect(s().project.audioClips).toHaveLength(1)
  })

  it('leaves unselected clips alone', () => {
    const kept = makeClip({ startTime: 0, duration: 5 })
    const doomed = makeClip({ startTime: 5, duration: 5 })
    s().addClip(kept)
    s().addClip(doomed)
    s().setSelected({ clips: [doomed.id] })

    s().deleteSelection()

    expect(s().project.clips.map(c => c.id)).toEqual([kept.id])
  })

  it('clears the selection', () => {
    selectAll(seedOneOfEachKind())

    s().deleteSelection()

    expect(s().selectedClipIds).toEqual([])
    expect(s().selectedTextIds).toEqual([])
    expect(s().selectedStickerIds).toEqual([])
    expect(s().selectedAudioIds).toEqual([])
  })

  it('spends no undo step when nothing is selected', () => {
    const before = s().history.length

    s().deleteSelection()

    expect(s().history.length).toBe(before)
  })
})

describe('moveTrack', () => {
  function threeTracks() {
    s().addTrack('video')
    const ids = s().project.tracks.map(t => t.id)
    return ids
  }

  it('swaps a track with its neighbour towards the front', () => {
    const ids = threeTracks()
    s().moveTrack(ids[0], 1)
    expect(s().project.tracks.map(t => t.id)).toEqual([ids[1], ids[0], ids[2]])
  })

  it('swaps back the other way', () => {
    const ids = threeTracks()
    s().moveTrack(ids[2], -1)
    expect(s().project.tracks.map(t => t.id)).toEqual([ids[0], ids[2], ids[1]])
  })

  it('does nothing at either end of the stack, and spends no undo step doing it', () => {
    const ids = threeTracks()
    const steps = s().history.length
    s().moveTrack(ids[0], -1)
    s().moveTrack(ids[ids.length - 1], 1)
    expect(s().project.tracks.map(t => t.id)).toEqual(ids)
    expect(s().history.length).toBe(steps)
  })

  it('does nothing for a track that is not there', () => {
    const ids = threeTracks()
    s().moveTrack('no-such-track', 1)
    expect(s().project.tracks.map(t => t.id)).toEqual(ids)
  })

  it('is one undo step, like every other project mutation', () => {
    const ids = threeTracks()
    s().moveTrack(ids[0], 1)
    s().undo()
    expect(s().project.tracks.map(t => t.id)).toEqual(ids)
  })

  it('restacks what the preview and the compositor paint, because paint order is track order', () => {
    const ids = threeTracks()
    const clipOn = (trackId: string, id: string) => makeClip({ id, trackId, startTime: 0, duration: 4 })
    s().loadProject({
      ...s().project,
      media: [makeMedia()],
      clips: [clipOn(ids[0], 'low'), clipOn(ids[1], 'mid'), clipOn(ids[2], 'high')],
    })
    const order = () => paintOrder(s().project).map(i => i.clip.id)
    expect(order()).toEqual(['low', 'mid', 'high'])
    s().moveTrack(ids[0], 1)
    expect(order()).toEqual(['mid', 'low', 'high'])
    s().moveTrack(ids[2], -1)
    expect(order()).toEqual(['mid', 'high', 'low'])
  })
})

describe('detachAudio', () => {
  function videoProject() {
    s().loadProject({
      ...s().project,
      media: [makeMedia()],
      clips: [makeClip({ id: 'v1', startTime: 1, duration: 4, mediaStart: 2, mediaEnd: 6, volume: 0.5 })],
    })
  }

  it('lifts the audio onto an audio track mirroring the clip window', () => {
    videoProject()
    s().detachAudio('v1')
    const a = s().project.audioClips[0]
    expect(a).toMatchObject({
      mediaId: 'media-1', trackId: 'main-audio',
      startTime: 1, duration: 4, mediaStart: 2, mediaEnd: 6,
      volume: 0.5, speed: 1, muted: false,
    })
  })

  it('mutes the source clip so the same audio does not play twice', () => {
    videoProject()
    s().detachAudio('v1')
    expect(s().project.clips[0].muted).toBe(true)
  })

  it('keeps the source clip muted state it already had', () => {
    videoProject()
    s().updateClip('v1', { muted: true })
    s().detachAudio('v1')
    expect(s().project.audioClips[0].muted).toBe(true)
  })

  it('creates an audio track when the project has none', () => {
    videoProject()
    s().loadProject({
      ...s().project,
      tracks: s().project.tracks.filter(t => t.type !== 'audio'),
    })
    s().detachAudio('v1')
    const track = s().project.tracks.find(t => t.id === s().project.audioClips[0].trackId)
    expect(track?.type).toBe('audio')
  })

  it('does nothing for a clip whose media is not a video, and spends no undo step', () => {
    videoProject()
    s().loadProject({
      ...s().project,
      media: [makeMedia({ type: 'image' })],
    })
    const steps = s().history.length
    s().detachAudio('v1')
    s().detachAudio('no-such-clip')
    expect(s().project.audioClips).toEqual([])
    expect(s().history.length).toBe(steps)
  })

  it('is one undo step, restoring both halves together', () => {
    videoProject()
    s().detachAudio('v1')
    s().undo()
    expect(s().project.audioClips).toEqual([])
    expect(s().project.clips[0].muted).toBe(false)
  })
})
