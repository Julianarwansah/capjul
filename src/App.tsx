import { useEffect, useCallback, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { PreviewPanel } from './components/Preview'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'
import { ProjectSettings } from './components/ProjectSettings'
import { ShortcutsOverlay } from './components/ShortcutsOverlay'
import { useEditorStore } from './store/editorStore'
import { stepFrames } from './shared/frame-time'
import { neighborMarker } from './shared/markers'
import { findShortcut, type ShortcutEntry } from './shared/shortcuts'
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
    toggleMarker, setSelected, clearSelection,
    setLoopIn, setLoopOut,
  } = useEditorStore()

  // Keyboard shortcuts. This is the only place global keys are dispatched; the
  // timeline keeps just paste, which needs its own clipboard state. What each key
  // *means* - its matcher and its label - lives in shared/shortcuts.ts, which the
  // shortcuts overlay renders from, so a binding cannot be live here and missing
  // there. The switch is exhaustive over the table's ids on purpose: adding a row
  // to the table without handling it is a compile error.
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    const def = findShortcut(e)
    // Timeline-scoped rows (paste) are documented in the table but dispatched by
    // the component that owns their state, so they stop here.
    if (!def || def.scope !== 'global') return

    // Stepping in whole frames rather than adding 1/fps: repeated addition
    // drifts (thirty steps at 30fps land 1.11e-16 short of a second), and the
    // timecode truncates, so it then displays the wrong second.
    const fps = project.fps
    const seekBy = (frames: number) =>
      setCurrentTime(Math.max(0, Math.min(project.duration, stepFrames(currentTime, fps, frames))))
    const second = Math.round(fps)
    const fiveSeconds = Math.round(5 * fps)

    switch (def.id) {
      case 'play-pause': e.preventDefault(); setIsPlaying(!isPlaying); break
      case 'pause': e.preventDefault(); setIsPlaying(false); break
      case 'undo': e.preventDefault(); undo(); break
      case 'redo': e.preventDefault(); redo(); break
      case 'delete-selection': e.preventDefault(); deleteSelection(); break
      case 'save': {
        e.preventDefault()
        const saved = await window.electronAPI?.saveProject(project)
        if (saved && !saved.ok && saved.error.code !== 'E_CANCELLED') {
          alert(`Save failed: ${saved.error.message}`)
        }
        break
      }
      case 'split': e.preventDefault(); splitAtPlayhead(); break
      case 'duplicate': e.preventDefault(); duplicateSelection(); break
      case 'select-all': {
        e.preventDefault()
        const p = project
        setSelected({
          clips: p.clips.map(c => c.id),
          texts: p.textClips.map(c => c.id),
          stickers: p.stickerClips.map(c => c.id),
          audios: p.audioClips.map(c => c.id),
        })
        break
      }
      case 'clear-selection': e.preventDefault(); clearSelection(); break
      case 'step-back-frame': e.preventDefault(); seekBy(-1); break
      case 'step-fwd-frame': e.preventDefault(); seekBy(1); break
      case 'step-back-5s': e.preventDefault(); seekBy(-fiveSeconds); break
      case 'step-fwd-5s': e.preventDefault(); seekBy(fiveSeconds); break
      case 'prev-frame': e.preventDefault(); seekBy(-1); break
      case 'next-frame': e.preventDefault(); seekBy(1); break
      case 'back-1s': e.preventDefault(); seekBy(-second); break
      case 'back-5s': e.preventDefault(); seekBy(-fiveSeconds); break
      case 'fwd-1s': e.preventDefault(); seekBy(second); break
      case 'fwd-5s': e.preventDefault(); seekBy(fiveSeconds); break
      case 'home': setCurrentTime(0); break
      case 'loop-in': e.preventDefault(); setLoopIn(currentTime); break
      case 'loop-out': e.preventDefault(); setLoopOut(currentTime); break
      case 'end': setCurrentTime(project.duration); break
      case 'zoom-in':
        e.preventDefault()
        useEditorStore.getState().setZoom(useEditorStore.getState().zoom + 20)
        break
      case 'zoom-out':
        e.preventDefault()
        useEditorStore.getState().setZoom(useEditorStore.getState().zoom - 20)
        break
      case 'toggle-marker': e.preventDefault(); toggleMarker(currentTime); break
      case 'prev-marker':
      case 'next-marker': {
        // Swallowed only when there is one to jump to, so the keys stay free for
        // anything else in an unmarked project.
        const target = neighborMarker(
          project.markers, currentTime, def.id === 'next-marker' ? 1 : -1,
        )
        if (target) {
          e.preventDefault()
          setCurrentTime(target.time)
        }
        break
      }
      case 'shortcuts':
        e.preventDefault()
        useEditorStore.getState().setShowShortcuts(!useEditorStore.getState().showShortcuts)
        break
      default: {
        // Exhaustiveness: a table entry with no case above is a compile error,
        // which is the whole point of the literal id union.
        const unhandled: never = def
        throw new Error(`shortcut without a handler: ${(unhandled as ShortcutEntry).id}`)
      }
    }
  }, [
    isPlaying, currentTime, project,
    setIsPlaying, undo, redo, setCurrentTime,
    splitAtPlayhead, duplicateSelection, deleteSelection, toggleMarker,
    setSelected, clearSelection, setLoopIn, setLoopOut,
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
      <ShortcutsOverlay />
    </div>
  )
}
