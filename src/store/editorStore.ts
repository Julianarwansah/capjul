import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { computeDuration } from '../shared/project-duration'
import { canSplitAt, splitClipAt, type Splittable } from '../shared/clip-split'
import { copyClipAfter } from '../shared/clip-factory'
import { toggleMarker as applyMarkerToggle } from '../shared/markers'
import {
  ASPECT_RATIOS, COALESCE_WINDOW_MS, HISTORY_LIMIT,
  cloneProject, createDefaultProject,
} from './defaults'
import type {
  Project, MediaFile, Clip, TextClip, StickerClip, AudioClip,
  Track, Transition, Caption, Keyframe, LeftPanelTab, AspectRatio
} from '../types'

export interface EditorState {
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
  showShortcuts: boolean
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
  rippleDelete: (id: string, kind: 'video' | 'audio' | 'text' | 'sticker') => void
  splitClip: (id: string, time: number) => void
  splitAudioClip: (id: string, time: number) => void
  splitTextClip: (id: string, time: number) => void
  splitStickerClip: (id: string, time: number) => void

  // Selection-wide counterparts of the three clip operations above. Every entry
  // point (top bar, timeline context menu, keyboard shortcut) goes through
  // these so the four clip kinds cannot drift apart and one gesture cannot
  // cost more than one undo step.
  splitAtPlayhead: () => void
  duplicateSelection: () => void
  deleteSelection: () => void

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
  addStickerKeyframe: (clipId: string, kf: Keyframe) => void
  removeStickerKeyframe: (clipId: string, kfId: string) => void

  addCaption: (c: Caption) => void
  updateCaption: (id: string, changes: Partial<Caption>) => void
  removeCaption: (id: string) => void

  addTrack: (type: Track['type']) => string
  removeTrack: (id: string) => void
  updateTrack: (id: string, changes: Partial<Track>) => void

  /** Adds a marker at `time`, or removes the one already on that frame. */
  toggleMarker: (time: number) => void
  removeMarker: (id: string) => void
  clearMarkers: () => void

  setSelected: (ids: { clips?: string[]; texts?: string[]; stickers?: string[]; audios?: string[] }) => void
  clearSelection: () => void

  setProjectName: (name: string) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setBackgroundColor: (color: string) => void
  setFps: (fps: number) => void

  setShowExportDialog: (v: boolean) => void
  setShowProjectSettings: (v: boolean) => void
  setShowShortcuts: (v: boolean) => void
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
    showShortcuts: false,
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
      const halves = clip ? splitClipAt(clip, time) : null
      if (!halves) return
      get().mutate(p => ({ ...p, clips: p.clips.flatMap(c => c.id === id ? halves : [c]) }))
    },
    splitAudioClip: (id, time) => {
      const clip = get().project.audioClips.find(c => c.id === id)
      const halves = clip ? splitClipAt(clip, time) : null
      if (!halves) return
      get().mutate(p => ({ ...p, audioClips: p.audioClips.flatMap(c => c.id === id ? halves : [c]) }))
    },
    splitTextClip: (id, time) => {
      const clip = get().project.textClips.find(c => c.id === id)
      const halves = clip ? splitClipAt(clip, time) : null
      if (!halves) return
      get().mutate(p => ({ ...p, textClips: p.textClips.flatMap(c => c.id === id ? halves : [c]) }))
    },
    splitStickerClip: (id, time) => {
      const clip = get().project.stickerClips.find(c => c.id === id)
      const halves = clip ? splitClipAt(clip, time) : null
      if (!halves) return
      get().mutate(p => ({ ...p, stickerClips: p.stickerClips.flatMap(c => c.id === id ? halves : [c]) }))
    },

    splitAtPlayhead: () => {
      const s = get()
      const t = s.currentTime
      const ids = {
        clips: new Set(s.selectedClipIds),
        audios: new Set(s.selectedAudioIds),
        texts: new Set(s.selectedTextIds),
        stickers: new Set(s.selectedStickerIds),
      }
      // Without this guard a click on Split with the playhead outside every
      // selected clip would still spend an undo step on nothing.
      const canSplit =
        s.project.clips.some(c => ids.clips.has(c.id) && canSplitAt(c, t)) ||
        s.project.audioClips.some(c => ids.audios.has(c.id) && canSplitAt(c, t)) ||
        s.project.textClips.some(c => ids.texts.has(c.id) && canSplitAt(c, t)) ||
        s.project.stickerClips.some(c => ids.stickers.has(c.id) && canSplitAt(c, t))
      if (!canSplit) return

      const cut = <T extends Splittable>(list: T[], selected: Set<string>): T[] =>
        list.flatMap(c => (selected.has(c.id) ? splitClipAt(c, t) ?? [c] : [c]))
      get().mutate(p => ({
        ...p,
        clips: cut(p.clips, ids.clips),
        audioClips: cut(p.audioClips, ids.audios),
        textClips: cut(p.textClips, ids.texts),
        stickerClips: cut(p.stickerClips, ids.stickers),
      }))
      // Both halves are new ids, so the selection would otherwise keep pointing
      // at clips that no longer exist and leave the toolbar stuck enabled.
      get().clearSelection()
    },

    duplicateSelection: () => {
      const s = get()
      const copy = <T extends Splittable>(list: T[], selected: Set<string>): T[] =>
        list.filter(c => selected.has(c.id)).map(c => copyClipAfter(c))

      const copies = {
        clips: copy(s.project.clips, new Set(s.selectedClipIds)),
        audioClips: copy(s.project.audioClips, new Set(s.selectedAudioIds)),
        textClips: copy(s.project.textClips, new Set(s.selectedTextIds)),
        stickerClips: copy(s.project.stickerClips, new Set(s.selectedStickerIds)),
      }
      const total = Object.values(copies).reduce((n, list) => n + list.length, 0)
      if (total === 0) return

      get().mutate(p => ({
        ...p,
        clips: [...p.clips, ...copies.clips],
        audioClips: [...p.audioClips, ...copies.audioClips],
        textClips: [...p.textClips, ...copies.textClips],
        stickerClips: [...p.stickerClips, ...copies.stickerClips],
      }))
      // Selecting the copies makes a repeated Cmd+D chain them end to end.
      get().setSelected({
        clips: copies.clips.map(c => c.id),
        audios: copies.audioClips.map(c => c.id),
        texts: copies.textClips.map(c => c.id),
        stickers: copies.stickerClips.map(c => c.id),
      })
    },

    deleteSelection: () => {
      const s = get()
      const ids = {
        clips: new Set(s.selectedClipIds),
        audios: new Set(s.selectedAudioIds),
        texts: new Set(s.selectedTextIds),
        stickers: new Set(s.selectedStickerIds),
      }
      if (ids.clips.size + ids.audios.size + ids.texts.size + ids.stickers.size === 0) return
      get().mutate(p => ({
        ...p,
        clips: p.clips.filter(c => !ids.clips.has(c.id)),
        audioClips: p.audioClips.filter(c => !ids.audios.has(c.id)),
        textClips: p.textClips.filter(c => !ids.texts.has(c.id)),
        stickerClips: p.stickerClips.filter(c => !ids.stickers.has(c.id)),
      }))
      get().clearSelection()
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
    addStickerKeyframe: (clipId, kf) => get().mutate(p => ({
      ...p,
      stickerClips: p.stickerClips.map(c => c.id === clipId
        ? { ...c, keyframes: [...(c.keyframes ?? []).filter(k => !(k.property === kf.property && Math.abs(k.time - kf.time) < 0.05)), kf] }
        : c),
    })),
    removeStickerKeyframe: (clipId, kfId) => get().mutate(p => ({
      ...p,
      stickerClips: p.stickerClips.map(c => c.id === clipId
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

    toggleMarker: (time) => get().mutate(p => ({
      ...p,
      markers: applyMarkerToggle(p.markers, time, p.fps, crypto.randomUUID()).markers,
    })),
    removeMarker: (id) => get().mutate(p => ({ ...p, markers: p.markers.filter(m => m.id !== id) })),
    clearMarkers: () => get().mutate(p => ({ ...p, markers: [] })),

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
    setShowShortcuts: (v) => set({ showShortcuts: v }),
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

/** True when anything at all is selected, across the four clip kinds. Reactive
 *  selector for disabling toolbar actions; the store actions guard themselves. */
export const selectHasSelection = (s: EditorState): boolean =>
  s.selectedClipIds.length > 0 || s.selectedTextIds.length > 0
  || s.selectedStickerIds.length > 0 || s.selectedAudioIds.length > 0
