import { useEffect, useCallback, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'
import { ProjectSettings } from './components/ProjectSettings'
import { useEditorStore } from './store/editorStore'
import type { ElectronApi, RecoveryInfo } from './shared/ipc-contract'

declare global {
  interface Window {
    electronAPI?: ElectronApi
  }
}

const AUTOSAVE_DEBOUNCE_MS = 5000

// Writes a recovery copy to userData once editing has been idle for a while.
// The slot never touches the user's document; an explicit save clears it.
function useAutosave() {
  const project = useEditorStore(s => s.project)
  const skipFirst = useRef(true)
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    const timer = setTimeout(() => {
      window.electronAPI?.autosaveProject(project)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [project])
}

function RecoveryBanner() {
  const [info, setInfo] = useState<RecoveryInfo | null>(null)

  useEffect(() => {
    let alive = true
    window.electronAPI?.recoveryInfo().then(result => {
      if (alive && result?.ok && result.value) setInfo(result.value)
    })
    return () => { alive = false }
  }, [])

  async function restore() {
    const result = await window.electronAPI?.restoreAutosave()
    if (result?.ok) useEditorStore.getState().loadProject(result.value)
    setInfo(null)
  }

  async function discard() {
    // The current state becomes the recovery point, so the prompt stays gone
    // instead of reappearing on every launch.
    await window.electronAPI?.autosaveProject(useEditorStore.getState().project)
    setInfo(null)
  }

  if (!info) return null
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 text-xs shrink-0"
      style={{
        background: 'rgba(255,71,87,0.12)',
        color: 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span className="flex-1">
        A recovered copy of “{info.name}” from {new Date(info.at).toLocaleString()} was found. Restore it?
      </span>
      <button className="btn-primary" onClick={restore}>Restore</button>
      <button className="btn-secondary" onClick={discard}>Discard</button>
    </div>
  )
}

export default function App() {
  useAutosave()
  const {
    showExportDialog, showProjectSettings,
    undo, redo, setIsPlaying, isPlaying,
    currentTime, setCurrentTime, project,
    selectedClipIds, removeClips, clearSelection, splitClip,
  } = useEditorStore()

  // Keyboard shortcuts
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
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
      const saved = await window.electronAPI?.saveProject(project)
      if (saved && !saved.ok && saved.error.code !== 'E_CANCELLED') {
        alert(`Save failed: ${saved.error.message}`)
      }
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
      {/* Crash recovery prompt */}
      <RecoveryBanner />

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
