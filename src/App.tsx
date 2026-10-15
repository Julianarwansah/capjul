import { useEffect, useCallback, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { PreviewPanel } from './components/Preview'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'
import { ProjectSettings } from './components/ProjectSettings'
import { useEditorStore } from './store/editorStore'
import { stepFrames } from './shared/frame-time'
import { neighborMarker } from './shared/markers'
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
    splitAtPlayhead, duplicateSelection, deleteSelection,
    toggleMarker,
  } = useEditorStore()

  // Keyboard shortcuts. This is the only place global keys are bound; the
  // timeline keeps just copy/paste, which needs its own clipboard state.
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    const mod = e.metaKey || e.ctrlKey

    // Stepping in whole frames rather than adding 1/fps: repeated addition
    // drifts (thirty steps at 30fps land 1.11e-16 short of a second), and the
    // timecode truncates, so it then displays the wrong second.
    const fps = project.fps
    const seekBy = (frames: number) =>
      setCurrentTime(Math.max(0, Math.min(project.duration, stepFrames(currentTime, fps, frames))))
    const second = Math.round(fps)
    const fiveSeconds = Math.round(5 * fps)

    if (e.code === 'Space') {
      e.preventDefault()
      setIsPlaying(!isPlaying)
    } else if (mod && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault()
      deleteSelection()
    } else if (e.code === 'KeyS' && mod) {
      e.preventDefault()
      const saved = await window.electronAPI?.saveProject(project)
      if (saved && !saved.ok && saved.error.code !== 'E_CANCELLED') {
        alert(`Save failed: ${saved.error.message}`)
      }
    } else if (e.code === 'KeyB') {
      // Split at playhead. Bound with and without the modifier: plain B was the
      // original binding, Cmd+B is what CapCut users reach for.
      e.preventDefault()
      splitAtPlayhead()
    } else if (mod && e.code === 'KeyD') {
      e.preventDefault()
      duplicateSelection()
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault()
      seekBy(e.shiftKey ? -fiveSeconds : -1)
    } else if (e.code === 'ArrowRight') {
      e.preventDefault()
      seekBy(e.shiftKey ? fiveSeconds : 1)
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
    } else if (e.code === 'KeyJ') {
      e.preventDefault()
      seekBy(e.shiftKey ? -fiveSeconds : -second)
    } else if (e.code === 'KeyK') {
      e.preventDefault()
      setIsPlaying(false)
    } else if (e.code === 'KeyL') {
      e.preventDefault()
      seekBy(e.shiftKey ? fiveSeconds : second)
    } else if (e.code === 'Comma') {
      // Previous frame
      e.preventDefault()
      seekBy(-1)
    } else if (e.code === 'Period') {
      // Next frame
      e.preventDefault()
      seekBy(1)
    } else if (e.code === 'KeyM' && !mod) {
      // Toggle a marker on the playhead's frame. One binding both adds and
      // removes, so undoing a marker never means aiming at a 7px flag. Cmd is
      // excluded because Cmd+M minimises the window on macOS.
      e.preventDefault()
      toggleMarker(currentTime)
    } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      // Jump to the previous or next marker. Swallowed only when there is one to
      // jump to, so the keys stay free for anything else in an unmarked project.
      const target = neighborMarker(
        project.markers, currentTime, e.code === 'BracketRight' ? 1 : -1,
      )
      if (target) {
        e.preventDefault()
        setCurrentTime(target.time)
      }
    }
  }, [
    isPlaying, currentTime, project,
    setIsPlaying, undo, redo, setCurrentTime,
    splitAtPlayhead, duplicateSelection, deleteSelection, toggleMarker,
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
