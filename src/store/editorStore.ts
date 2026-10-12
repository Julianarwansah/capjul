import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  Project, MediaFile, Clip, TextClip, StickerClip, AudioClip,
  Track, Transition, Caption, LeftPanelTab, AspectRatio
} from '../types'

const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '2:1': { width: 2160, height: 1080 },
  '2.35:1': { width: 2350, height: 1000 },
  '1.85:1': { width: 1850, height: 1000 },
}

function createDefaultProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: 60,
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#000000',
    media: [],
    tracks: [
      { id: 'main-video', type: 'video', label: 'Main Track', muted: false, locked: false, height: 64 },
      { id: 'main-audio', type: 'audio', label: 'Audio', muted: false, locked: false, height: 48 },
    ],
    clips: [],
    textClips: [],
    stickerClips: [],
    audioClips: [],
    transitions: [],
    captions: [],
  }
}

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
  splitClip: (id: string, time: number) => void

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

  addCaption: (c: Caption) => void
  updateCaption: (id: string, changes: Partial<Caption>) => void
  removeCaption: (id: string) => void

  addTrack: (type: Track['type']) => void
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
  saveHistory: () => void

  loadProject: (p: Project) => void
  newProject: () => void
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    project: createDefaultProject(),
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
    history: [],
    historyIndex: -1,

    setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
    setIsPlaying: (v) => set({ isPlaying: v }),
    setPlaybackSpeed: (v) => set({ playbackSpeed: v }),
    setZoom: (z) => set({ zoom: Math.max(20, Math.min(400, z)) }),
    setScrollLeft: (s) => set({ scrollLeft: Math.max(0, s) }),
    setActiveLeftTab: (tab) => set({ activeLeftTab: tab }),

    addMedia: (files) => set((s) => ({
      project: { ...s.project, media: [...s.project.media, ...files] }
    })),
    removeMedia: (id) => set((s) => ({
      project: { ...s.project, media: s.project.media.filter(m => m.id !== id) }
    })),

    addClip: (clip) => {
      get().saveHistory()
      set((s) => ({ project: { ...s.project, clips: [...s.project.clips, clip] } }))
    },
    updateClip: (id, changes) => set((s) => ({
      project: { ...s.project, clips: s.project.clips.map(c => c.id === id ? { ...c, ...changes } : c) }
    })),
    removeClip: (id) => {
      get().saveHistory()
      set((s) => ({ project: { ...s.project, clips: s.project.clips.filter(c => c.id !== id) } }))
    },
    removeClips: (ids) => {
      if (ids.length === 0) return
      get().saveHistory()
      const idSet = new Set(ids)
      set((s) => ({ project: { ...s.project, clips: s.project.clips.filter(c => !idSet.has(c.id)) } }))
    },
    splitClip: (id, time) => {
      const { project } = get()
      const clip = project.clips.find(c => c.id === id)
      if (!clip || time <= clip.startTime || time >= clip.startTime + clip.duration) return
      get().saveHistory()
      const elapsed = time - clip.startTime
      const first: Clip = { ...clip, id: crypto.randomUUID(), duration: elapsed, mediaEnd: clip.mediaStart + elapsed * clip.speed }
      const second: Clip = { ...clip, id: crypto.randomUUID(), startTime: time, duration: clip.duration - elapsed, mediaStart: clip.mediaStart + elapsed * clip.speed }
      set((s) => ({ project: { ...s.project, clips: s.project.clips.map(c => c.id === id ? first : c).concat(second) } }))
    },

    addTextClip: (clip) => { get().saveHistory(); set((s) => ({ project: { ...s.project, textClips: [...s.project.textClips, clip] } })) },
    updateTextClip: (id, changes) => set((s) => ({ project: { ...s.project, textClips: s.project.textClips.map(c => c.id === id ? { ...c, ...changes } : c) } })),
    removeTextClip: (id) => { get().saveHistory(); set((s) => ({ project: { ...s.project, textClips: s.project.textClips.filter(c => c.id !== id) } })) },

    addStickerClip: (clip) => { get().saveHistory(); set((s) => ({ project: { ...s.project, stickerClips: [...s.project.stickerClips, clip] } })) },
    updateStickerClip: (id, changes) => set((s) => ({ project: { ...s.project, stickerClips: s.project.stickerClips.map(c => c.id === id ? { ...c, ...changes } : c) } })),
    removeStickerClip: (id) => { get().saveHistory(); set((s) => ({ project: { ...s.project, stickerClips: s.project.stickerClips.filter(c => c.id !== id) } })) },

    addAudioClip: (clip) => { get().saveHistory(); set((s) => ({ project: { ...s.project, audioClips: [...s.project.audioClips, clip] } })) },
    updateAudioClip: (id, changes) => set((s) => ({ project: { ...s.project, audioClips: s.project.audioClips.map(c => c.id === id ? { ...c, ...changes } : c) } })),
    removeAudioClip: (id) => { get().saveHistory(); set((s) => ({ project: { ...s.project, audioClips: s.project.audioClips.filter(c => c.id !== id) } })) },

    addTransition: (t) => set((s) => ({ project: { ...s.project, transitions: [...s.project.transitions, t] } })),
    removeTransition: (id) => set((s) => ({ project: { ...s.project, transitions: s.project.transitions.filter(t => t.id !== id) } })),

    addCaption: (c) => set((s) => ({ project: { ...s.project, captions: [...s.project.captions, c] } })),
    updateCaption: (id, changes) => set((s) => ({ project: { ...s.project, captions: s.project.captions.map(c => c.id === id ? { ...c, ...changes } : c) } })),
    removeCaption: (id) => set((s) => ({ project: { ...s.project, captions: s.project.captions.filter(c => c.id !== id) } })),

    addTrack: (type) => {
      const track: Track = { id: crypto.randomUUID(), type, label: `${type} track`, muted: false, locked: false, height: type === 'audio' ? 48 : 64 }
      set((s) => ({ project: { ...s.project, tracks: [...s.project.tracks, track] } }))
    },
    removeTrack: (id) => set((s) => ({ project: { ...s.project, tracks: s.project.tracks.filter(t => t.id !== id) } })),
    updateTrack: (id, changes) => set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map(t => t.id === id ? { ...t, ...changes } : t) } })),

    setSelected: ({ clips, texts, stickers, audios }) => set({
      selectedClipIds: clips ?? [],
      selectedTextIds: texts ?? [],
      selectedStickerIds: stickers ?? [],
      selectedAudioIds: audios ?? [],
    }),
    clearSelection: () => set({ selectedClipIds: [], selectedTextIds: [], selectedStickerIds: [], selectedAudioIds: [] }),

    setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),
    setAspectRatio: (ratio) => {
      const { width, height } = ASPECT_RATIOS[ratio]
      set((s) => ({ project: { ...s.project, width, height } }))
    },
    setBackgroundColor: (color) => set((s) => ({ project: { ...s.project, backgroundColor: color } })),
    setFps: (fps) => set((s) => ({ project: { ...s.project, fps } })),

    setShowExportDialog: (v) => set({ showExportDialog: v }),
    setShowProjectSettings: (v) => set({ showProjectSettings: v }),
    setIsExporting: (v) => set({ isExporting: v }),
    setExportProgress: (v) => set({ exportProgress: v }),

    saveHistory: () => {
      const { project, history, historyIndex } = get()
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(project)))
      if (newHistory.length > 50) newHistory.shift()
      set({ history: newHistory, historyIndex: newHistory.length - 1 })
    },
    undo: () => {
      const { history, historyIndex } = get()
      if (historyIndex < 0) return
      const newIndex = historyIndex - 1
      set({ project: newIndex >= 0 ? history[newIndex] : createDefaultProject(), historyIndex: Math.max(-1, newIndex) })
    },
    redo: () => {
      const { history, historyIndex } = get()
      if (historyIndex >= history.length - 1) return
      const newIndex = historyIndex + 1
      set({ project: history[newIndex], historyIndex: newIndex })
    },

    loadProject: (p) => set({ project: p, history: [], historyIndex: -1, currentTime: 0, isPlaying: false }),
    newProject: () => set({ project: createDefaultProject(), history: [], historyIndex: -1, currentTime: 0, isPlaying: false }),
  }))
)
