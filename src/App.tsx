import { useEffect, useCallback } from 'react'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'
import { ProjectSettings } from './components/ProjectSettings'
import { useEditorStore } from './store/editorStore'
import type { FfprobeResult, ExportOptions } from './types'

declare global {
  interface Window {
    electronAPI?: {
      getPathForFile: (file: File) => string
      openMedia: () => Promise<string[]>
      saveProject: (data: string) => Promise<string | null>
      openProject: () => Promise<string | null>
      probeMedia: (path: string) => Promise<FfprobeResult | null>
      exportVideo: (options: ExportOptions) => Promise<string | null>
      onExportProgress: (cb: (progress: number) => void) => (() => void) | undefined
    }
  }
}

export default function App() {
  const {
    showExportDialog, showProjectSettings,
    undo, redo, setIsPlaying, isPlaying,
    currentTime, setCurrentTime, project,
    selectedClipIds, removeClips, clearSelection, splitClip,
  } = useEditorStore()

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    const mod = e.metaKey || e.ctrlKey

    if (e.code === 'Space') {
      e.preventDefault()
      setIsPlaying(!isPlaying)
    } else if (mod && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      removeClips(selectedClipIds)
      clearSelection()
    } else if (e.code === 'KeyS' && mod) {
      e.preventDefault()
      window.electronAPI?.saveProject(JSON.stringify(project))
    } else if (e.code === 'KeyB') {
      // Split at playhead
      selectedClipIds.forEach(id => splitClip(id, currentTime))
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault()
      setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 5 : 1 / project.fps)))
    } else if (e.code === 'ArrowRight') {
      e.preventDefault()
      setCurrentTime(Math.min(project.duration, currentTime + (e.shiftKey ? 5 : 1 / project.fps)))
    } else if (e.code === 'Home') {
      setCurrentTime(0)
    } else if (e.code === 'End') {
      setCurrentTime(project.duration)
    } else if (e.code === 'Equal' && mod) {
      e.preventDefault()
      useEditorStore.getState().setZoom(useEditorStore.getState().zoom + 20)
    } else if (e.code === 'Minus' && mod) {
      e.preventDefault()
      useEditorStore.getState().setZoom(useEditorStore.getState().zoom - 20)
    }
  }, [
    isPlaying, selectedClipIds, currentTime, project,
    setIsPlaying, undo, redo, removeClips, clearSelection, splitClip, setCurrentTime,
  ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ background: 'var(--color-bg-base)' }}
    >
      {/* Top bar */}
      <TopBar />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <LeftPanel />

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Preview */}
          <div className="flex-1 overflow-hidden">
            <PreviewPanel />
          </div>

          {/* Timeline */}
          <Timeline />
        </div>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Dialogs */}
      {showExportDialog && <ExportDialog />}
      {showProjectSettings && <ProjectSettings />}
    </div>
  )
}
