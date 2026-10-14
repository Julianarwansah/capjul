import { useState } from 'react'
import {
  Save, Download, Undo2, Redo2, Settings,
  FilePlus, FolderOpen, Share2, Scissors, Copy, Trash2,
  ZoomIn, ZoomOut, Grid3X3, Layers
} from 'lucide-react'
import { selectHasSelection, useEditorStore } from '../store/editorStore'

export function TopBar() {
  const {
    project, setProjectName, undo, redo, history, historyIndex,
    setShowExportDialog, setShowProjectSettings, newProject,
    zoom, setZoom, splitAtPlayhead, duplicateSelection, deleteSelection,
  } = useEditorStore()
  const hasSelection = useEditorStore(selectHasSelection)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(project.name)

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  async function handleOpen() {
    const opened = await window.electronAPI?.openProject()
    if (!opened) return
    if (!opened.ok) {
      if (opened.error.code !== 'E_CANCELLED') {
        alert(`Failed to open project: ${opened.error.message}`)
      }
      return
    }
    useEditorStore.getState().loadProject(opened.value)
  }

  async function handleSave() {
    const saved = await window.electronAPI?.saveProject(project)
    if (saved && !saved.ok && saved.error.code !== 'E_CANCELLED') {
      alert(`Save failed: ${saved.error.message}`)
    }
  }

  function handleNew() {
    if (confirm('Start new project? Unsaved changes will be lost.')) newProject()
  }

  return (
    <div
      className="flex items-center h-12 px-3 gap-2 border-b shrink-0"
      style={{
        background: 'var(--color-bg-panel)',
        borderColor: 'var(--color-border)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Traffic light space for macOS */}
      <div className="w-16 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />

      {/* File actions */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TopBtn icon={<FilePlus size={15} />} title="New Project" onClick={handleNew} />
        <TopBtn icon={<FolderOpen size={15} />} title="Open Project" onClick={handleOpen} />
        <TopBtn icon={<Save size={15} />} title="Save (⌘S)" onClick={handleSave} />
      </div>

      <Divider />

      {/* Undo/Redo */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TopBtn icon={<Undo2 size={15} />} title="Undo (⌘Z)" onClick={undo} disabled={!canUndo} />
        <TopBtn icon={<Redo2 size={15} />} title="Redo (⌘⇧Z)" onClick={redo} disabled={!canRedo} />
      </div>

      <Divider />

      {/* Edit actions */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TopBtn
          icon={<Scissors size={15} />}
          title="Split at playhead (⌘B)"
          onClick={splitAtPlayhead}
          disabled={!hasSelection}
        />
        <TopBtn
          icon={<Copy size={15} />}
          title="Duplicate (⌘D)"
          onClick={duplicateSelection}
          disabled={!hasSelection}
        />
        <TopBtn
          icon={<Trash2 size={15} />}
          title="Delete selected (Delete)"
          onClick={deleteSelection}
          disabled={!hasSelection}
        />
      </div>

      <Divider />

      {/* Zoom */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TopBtn icon={<ZoomOut size={15} />} title="Zoom out" onClick={() => setZoom(zoom - 20)} />
        <span
          className="text-xs w-10 text-center cursor-pointer"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => setZoom(80)}
          title="Reset zoom"
        >
          {Math.round((zoom / 80) * 100)}%
        </span>
        <TopBtn icon={<ZoomIn size={15} />} title="Zoom in" onClick={() => setZoom(zoom + 20)} />
      </div>

      {/* Project name — center */}
      <div
        className="flex-1 flex justify-center items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={() => { setProjectName(nameInput); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setProjectName(nameInput); setEditingName(false) } }}
            className="text-sm font-medium bg-transparent border-b outline-none text-center w-48"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text-primary)' }}
          />
        ) : (
          <span
            className="text-sm font-medium cursor-pointer hover:opacity-70 px-3 py-1 rounded"
            style={{ color: 'var(--color-text-primary)' }}
            onClick={() => { setNameInput(project.name); setEditingName(true) }}
          >
            {project.name}
          </span>
        )}
      </div>

      {/* Right actions */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TopBtn icon={<Grid3X3 size={15} />} title="Templates" onClick={() => {}} />
        <TopBtn icon={<Layers size={15} />} title="Layers" onClick={() => {}} />
        <TopBtn icon={<Settings size={15} />} title="Project Settings" onClick={() => setShowProjectSettings(true)} />
        <TopBtn icon={<Share2 size={15} />} title="Share" onClick={() => {}} />
        <button
          className="btn-primary flex items-center gap-1.5 text-xs h-8 px-4"
          onClick={() => setShowExportDialog(true)}
        >
          <Download size={14} />
          Export
        </button>
      </div>
    </div>
  )
}

function TopBtn({
  icon, title, onClick, disabled = false
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="topbar-btn"
      style={{
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return (
    <div
      className="w-px h-6 shrink-0"
      style={{ background: 'var(--color-border)' }}
    />
  )
}
