import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDuration, useEditorStore } from './editorStore'
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
    ...over,
  }
}

function makeAudioClip(over: Partial<AudioClip> = {}): AudioClip {
  return {
    id: crypto.randomUUID(), trackId: 'main-audio', mediaId: 'media-1',
    startTime: 0, duration: 5, mediaStart: 0, mediaEnd: 5,
    volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0,
    ...over,
  }
}

function makeSticker(over: Partial<StickerClip> = {}): StickerClip {
  return {
    id: crypto.randomUUID(), trackId: 'sticker-1', startTime: 0, duration: 5,
    src: 'star.png', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
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
