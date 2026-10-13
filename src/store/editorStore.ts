import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { computeDuration } from '../shared/project-duration'
import {
  ASPECT_RATIOS, COALESCE_WINDOW_MS, HISTORY_LIMIT,
  cloneProject, createDefaultProject,
} from './defaults'
import type {
  Project, MediaFile, Clip, TextClip, StickerClip, AudioClip,
  Track, Transition, Caption, Keyframe, LeftPanelTab, AspectRatio
} from '../types'

interface EditorState {
  project: Project
  // Playback
  currentTime: number
  isPlaying: boolean
  playbackSpeed: number
  // Timeline
  zoom: number           // pixels per second
  scrollLeft: number
  // Selection
  selectedClipIds: string[]
  selectedTextIds: string[]
  selectedStickerIds: string[]
  selectedAudioIds: string[]
  // UI
  activeLeftTab: LeftPanelTab
  showRightPanel: boolean
  showExportDialog: boolean
  showProjectSettings: boolean
  isExporting: boolean
  exportProgress: number
  // History
  history: Project[]
  historyIndex: number
  // Actions
  setCurrentTime: (t: number) => void
  setIsPlaying: (v: boolean) => void
  setPlaybackSpeed: (v: number) => void
  setZoom: (z: number) => void
  setScrollLeft: (s: number) => void
  setActiveLeftTab: (tab: LeftPanelTab) => void

  addMedia: (files: MediaFile[]) => void
  removeMedia: (id: string) => void

  addClip: (clip: Clip) => void
  updateClip: (id: string, changes: Partial<Clip>) => void
  removeClip: (id: string) => void
  removeClips: (ids: string[]) => void
  rippleDelete: (id: string, kind: 'video' | 'audio' | 'text' | 'sticker') => void
  splitClip: (id: string, time: number) => void
  splitAudioClip: (id: string, time: number) => void
  splitTextClip: (id: string, time: number) => void
  splitStickerClip: (id: string, time: number) => void

  addTextClip: (clip: TextClip) => void
  updateTextClip: (id: string, changes: Partial<TextClip>) => void
  removeTextClip: (id: string) => void

  addStickerClip: (clip: StickerClip) => void
  updateStickerClip: (id: string, changes: Partial<StickerClip>) => void
  removeStickerClip: (id: string) => void

  addAudioClip: (clip: AudioClip) => void
  updateAudioClip: (id: string, changes: Partial<AudioClip>) => void
  removeAudioClip: (id: string) => void

  addTransition: (t: Transition) => void
  removeTransition: (id: string) => void

  addClipKeyframe: (clipId: string, kf: Keyframe) => void
  removeClipKeyframe: (clipId: string, kfId: string) => void
  addTextKeyframe: (clipId: string, kf: Keyframe) => void
  removeTextKeyframe: (clipId: string, kfId: string) => void
  addAudioKeyframe: (clipId: string, kf: Keyframe) => void
  removeAudioKeyframe: (clipId: string, kfId: string) => void

  addCaption: (c: Caption) => void
  updateCaption: (id: string, changes: Partial<Caption>) => void
  removeCaption: (id: string) => void

  addTrack: (type: Track['type']) => string
  removeTrack: (id: string) => void
  updateTrack: (id: string, changes: Partial<Track>) => void

  setSelected: (ids: { clips?: string[]; texts?: string[]; stickers?: string[]; audios?: string[] }) => void
  clearSelection: () => void

  setProjectName: (name: string) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setBackgroundColor: (color: string) => void
  setFps: (fps: number) => void

  setShowExportDialog: (v: boolean) => void
  setShowProjectSettings: (v: boolean) => void
  setIsExporting: (v: boolean) => void
  setExportProgress: (v: number) => void

  undo: () => void
  redo: () => void
  recordHistory: (coalesce?: boolean) => void
  mutate: (fn: (p: Project) => Project, coalesce?: boolean) => void

  loadProject: (p: Project) => void
  newProject: () => void
}

const initialProject = createDefaultProject()
let lastRecordedAt = 0
let lastRecordWasContinuous = false

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    project: initialProject,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    zoom: 80,
    scrollLeft: 0,
    selectedClipIds: [],
    selectedTextIds: [],
    selectedStickerIds: [],
    selectedAudioIds: [],
    activeLeftTab: 'media',
    showRightPanel: true,
    showExportDialog: false,
    showProjectSettings: false,
    isExporting: false,
    exportProgress: 0,
    history: [initialProject],
    historyIndex: 0,

    setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
    setIsPlaying: (v) => set({ isPlaying: v }),
    setPlaybackSpeed: (v) => set({ playbackSpeed: v }),
    setZoom: (z) => set({ zoom: Math.max(20, Math.min(400, z)) }),
    setScrollLeft: (s) => set({ scrollLeft: Math.max(0, s) }),
    setActiveLeftTab: (tab) => set({ activeLeftTab: tab }),

    addMedia: (files) => get().mutate(p => ({ ...p, media: [...p.media, ...files] })),
    // Clips referencing a removed media item would dangle forever, so they go
    // with it. One mutate() means undo restores media and clips together.
    removeMedia: (id) => get().mutate(p => ({
      ...p,
      media: p.media.filter(m => m.id !== id),
      clips: p.clips.filter(c => c.mediaId !== id),
      audioClips: p.audioClips.filter(c => c.mediaId !== id),
    })),

    addClip: (clip) => get().mutate(p => ({ ...p, clips: [...p.clips, clip] })),
    updateClip: (id, changes) => get().mutate(
      p => ({ ...p, clips: p.clips.map(c => c.id === id ? { ...c, ...changes } : c) }),
      true,
    ),
    removeClip: (id) => get().mutate(p => ({ ...p, clips: p.clips.filter(c => c.id !== id) })),
    removeClips: (ids) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      get().mutate(p => ({ ...p, clips: p.clips.filter(c => !idSet.has(c.id)) }))
    },
    rippleDelete: (id, kind) => get().mutate(p => {
      function ripple<T extends { id: string; trackId: string; startTime: number; duration: number }>(
        list: T[], targetId: string
      ): T[] {
        const target = list.find(c => c.id === targetId)
        if (!target) return list
        const gapStart = target.startTime
        const gapSize = target.duration
        return list
          .filter(c => c.id !== targetId)
          .map(c => c.trackId === target.trackId && c.startTime >= gapStart
            ? { ...c, startTime: c.startTime - gapSize }
            : c)
      }
      if (kind === 'video') return { ...p, clips: ripple(p.clips, id) }
      if (kind === 'audio') return { ...p, audioClips: ripple(p.audioClips, id) }
      if (kind === 'text') return { ...p, textClips: ripple(p.textClips, id) }
      return { ...p, stickerClips: ripple(p.stickerClips, id) }
    }),
    splitClip: (id, time) => {
      const clip = get().project.clips.find(c => c.id === id)
      if (!clip || time <= clip.startTime || time >= clip.startTime + clip.duration) return
      const elapsed = time - clip.startTime
      const first: Clip = { ...clip, id: crypto.randomUUID(), duration: elapsed, mediaEnd: clip.mediaStart + elapsed * clip.speed }
      const second: Clip = { ...clip, id: crypto.randomUUID(), startTime: time, duration: clip.duration - elapsed, mediaStart: clip.mediaStart + elapsed * clip.speed }
      get().mutate(p => ({ ...p, clips: p.clips.flatMap(c => c.id === id ? [first, second] : [c]) }))
    },
    splitAudioClip: (id, time) => {
      const clip = get().project.audioClips.find(c => c.id === id)
      if (!clip || time <= clip.startTime || time >= clip.startTime + clip.duration) return
      const elapsed = time - clip.startTime
      const first: AudioClip = { ...clip, id: crypto.randomUUID(), duration: elapsed, mediaEnd: clip.mediaStart + elapsed * clip.speed }
      const second: AudioClip = { ...clip, id: crypto.randomUUID(), startTime: time, duration: clip.duration - elapsed, mediaStart: clip.mediaStart + elapsed * clip.speed }
      get().mutate(p => ({ ...p, audioClips: p.audioClips.flatMap(c => c.id === id ? [first, second] : [c]) }))
    },
    splitTextClip: (id, time) => {
      const clip = get().project.textClips.find(c => c.id === id)
      if (!clip || time <= clip.startTime || time >= clip.startTime + clip.duration) return
      const elapsed = time - clip.startTime
      const first: TextClip = { ...clip, id: crypto.randomUUID(), duration: elapsed }
      const second: TextClip = { ...clip, id: crypto.randomUUID(), startTime: time, duration: clip.duration - elapsed }
      get().mutate(p => ({ ...p, textClips: p.textClips.flatMap(c => c.id === id ? [first, second] : [c]) }))
    },
    splitStickerClip: (id, time) => {
      const clip = get().project.stickerClips.find(c => c.id === id)
      if (!clip || time <= clip.startTime || time >= clip.startTime + clip.duration) return
      const elapsed = time - clip.startTime
      const first: StickerClip = { ...clip, id: crypto.randomUUID(), duration: elapsed }
      const second: StickerClip = { ...clip, id: crypto.randomUUID(), startTime: time, duration: clip.duration - elapsed }
      get().mutate(p => ({ ...p, stickerClips: p.stickerClips.flatMap(c => c.id === id ? [first, second] : [c]) }))
    },

    addTextClip: (clip) => get().mutate(p => ({ ...p, textClips: [...p.textClips, clip] })),
    updateTextClip: (id, changes) => get().mutate(
      p => ({ ...p, textClips: p.textClips.map(c => c.id === id ? { ...c, ...changes } : c) }),
      true,
    ),
    removeTextClip: (id) => get().mutate(p => ({ ...p, textClips: p.textClips.filter(c => c.id !== id) })),

    addStickerClip: (clip) => get().mutate(p => ({ ...p, stickerClips: [...p.stickerClips, clip] })),
    updateStickerClip: (id, changes) => get().mutate(
      p => ({ ...p, stickerClips: p.stickerClips.map(c => c.id === id ? { ...c, ...changes } : c) }),
      true,
    ),
    removeStickerClip: (id) => get().mutate(p => ({ ...p, stickerClips: p.stickerClips.filter(c => c.id !== id) })),

    addAudioClip: (clip) => get().mutate(p => ({ ...p, audioClips: [...p.audioClips, clip] })),
    updateAudioClip: (id, changes) => get().mutate(
      p => ({ ...p, audioClips: p.audioClips.map(c => c.id === id ? { ...c, ...changes } : c) }),
      true,
    ),
    removeAudioClip: (id) => get().mutate(p => ({ ...p, audioClips: p.audioClips.filter(c => c.id !== id) })),

    addTransition: (t) => get().mutate(p => ({ ...p, transitions: [...p.transitions, t] })),
    removeTransition: (id) => get().mutate(p => ({ ...p, transitions: p.transitions.filter(t => t.id !== id) })),

    addClipKeyframe: (clipId, kf) => get().mutate(p => ({
      ...p,
      clips: p.clips.map(c => c.id === clipId
        ? { ...c, keyframes: [...(c.keyframes ?? []).filter(k => !(k.property === kf.property && Math.abs(k.time - kf.time) < 0.05)), kf] }
        : c),
    })),
    removeClipKeyframe: (clipId, kfId) => get().mutate(p => ({
      ...p,
      clips: p.clips.map(c => c.id === clipId
        ? { ...c, keyframes: (c.keyframes ?? []).filter(k => k.id !== kfId) }
        : c),
    })),
    addTextKeyframe: (clipId, kf) => get().mutate(p => ({
      ...p,
      textClips: p.textClips.map(c => c.id === clipId
        ? { ...c, keyframes: [...(c.keyframes ?? []).filter(k => !(k.property === kf.property && Math.abs(k.time - kf.time) < 0.05)), kf] }
        : c),
    })),
    removeTextKeyframe: (clipId, kfId) => get().mutate(p => ({
      ...p,
      textClips: p.textClips.map(c => c.id === clipId
        ? { ...c, keyframes: (c.keyframes ?? []).filter(k => k.id !== kfId) }
        : c),
    })),
    addAudioKeyframe: (clipId, kf) => get().mutate(p => ({
      ...p,
      audioClips: p.audioClips.map(c => c.id === clipId
        ? { ...c, keyframes: [...(c.keyframes ?? []).filter(k => !(k.property === kf.property && Math.abs(k.time - kf.time) < 0.05)), kf] }
        : c),
    })),
    removeAudioKeyframe: (clipId, kfId) => get().mutate(p => ({
      ...p,
      audioClips: p.audioClips.map(c => c.id === clipId
        ? { ...c, keyframes: (c.keyframes ?? []).filter(k => k.id !== kfId) }
        : c),
    })),

    addCaption: (c) => get().mutate(p => ({ ...p, captions: [...p.captions, c] })),
    updateCaption: (id, changes) => get().mutate(
      p => ({ ...p, captions: p.captions.map(c => c.id === id ? { ...c, ...changes } : c) }),
      true,
    ),
    removeCaption: (id) => get().mutate(p => ({ ...p, captions: p.captions.filter(c => c.id !== id) })),

    addTrack: (type) => {
      const track: Track = { id: crypto.randomUUID(), type, label: `${type} track`, muted: false, locked: false, height: type === 'audio' ? 48 : 64 }
      get().mutate(p => ({ ...p, tracks: [...p.tracks, track] }))
      return track.id
    },
    removeTrack: (id) => get().mutate(p => ({ ...p, tracks: p.tracks.filter(t => t.id !== id) })),
    updateTrack: (id, changes) => get().mutate(
      p => ({ ...p, tracks: p.tracks.map(t => t.id === id ? { ...t, ...changes } : t) }),
      true,
    ),

    setSelected: ({ clips, texts, stickers, audios }) => set({
      selectedClipIds: clips ?? [],
      selectedTextIds: texts ?? [],
      selectedStickerIds: stickers ?? [],
      selectedAudioIds: audios ?? [],
    }),
    clearSelection: () => set({ selectedClipIds: [], selectedTextIds: [], selectedStickerIds: [], selectedAudioIds: [] }),

    setProjectName: (name) => get().mutate(p => ({ ...p, name }), true),
    setAspectRatio: (ratio) => {
      const { width, height } = ASPECT_RATIOS[ratio]
      get().mutate(p => ({ ...p, width, height }))
    },
    setBackgroundColor: (color) => get().mutate(p => ({ ...p, backgroundColor: color }), true),
    setFps: (fps) => get().mutate(p => ({ ...p, fps })),

    setShowExportDialog: (v) => set({ showExportDialog: v }),
    setShowProjectSettings: (v) => set({ showProjectSettings: v }),
    setIsExporting: (v) => set({ isExporting: v }),
    setExportProgress: (v) => set({ exportProgress: v }),

    // Snapshots the project AFTER a mutation. historyIndex always points at the
    // state currently on screen, so undo is a plain single step backwards.
    // A continuous edit only merges into the previous snapshot when that snapshot
    // was continuous too — a discrete action is never swallowed by a following drag.
    recordHistory: (coalesce = false) => {
      const { project, history, historyIndex } = get()
      const now = Date.now()
      const next = history.slice(0, historyIndex + 1)
      const mergeIntoPrevious = coalesce
        && lastRecordWasContinuous
        && next.length > 0
        && now - lastRecordedAt < COALESCE_WINDOW_MS
      if (mergeIntoPrevious) next[next.length - 1] = cloneProject(project)
      else next.push(cloneProject(project))
      while (next.length > HISTORY_LIMIT) next.shift()
      lastRecordedAt = now
      lastRecordWasContinuous = coalesce
      set({ history: next, historyIndex: next.length - 1 })
    },
    // Single choke point for project changes: keeps duration derived and makes it
    // impossible for an action to forget recording history.
    mutate: (fn, coalesce = false) => {
      set((s) => {
        const next = fn(s.project)
        return { project: { ...next, duration: computeDuration(next) } }
      })
      get().recordHistory(coalesce)
    },
    undo: () => {
      const { history, historyIndex } = get()
      if (historyIndex <= 0) return
      const newIndex = historyIndex - 1
      lastRecordedAt = 0
      lastRecordWasContinuous = false
      set({ project: history[newIndex], historyIndex: newIndex })
    },
    redo: () => {
      const { history, historyIndex } = get()
      if (historyIndex >= history.length - 1) return
      const newIndex = historyIndex + 1
      lastRecordedAt = 0
      lastRecordWasContinuous = false
      set({ project: history[newIndex], historyIndex: newIndex })
    },

    loadProject: (p) => {
      const project = { ...p, duration: computeDuration(p) }
      lastRecordedAt = 0
      lastRecordWasContinuous = false
      set({ project, history: [project], historyIndex: 0, currentTime: 0, isPlaying: false })
    },
    newProject: () => {
      const project = createDefaultProject()
      lastRecordedAt = 0
      lastRecordWasContinuous = false
      set({ project, history: [project], historyIndex: 0, currentTime: 0, isPlaying: false })
    },
  }))
)
