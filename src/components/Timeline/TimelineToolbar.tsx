import { Plus, Scissors, Trash2 } from 'lucide-react'

// The strip above the tracks: add a track, split or delete the selection, and
// zoom. Presentational only - the actions and the selection state live in the
// store and are passed in.

export interface TimelineToolbarProps {
  zoom: number
  hasSelection: boolean
  onAddTrack: () => void
  onSplit: () => void
  onDelete: () => void
  onZoom: (zoom: number) => void
}

/** Zoom is displayed as a percentage of the default 80 px/s. */
export const DEFAULT_PX_PER_SEC = 80

export function TimelineToolbar({
  zoom, hasSelection, onAddTrack, onSplit, onDelete, onZoom,
}: TimelineToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{ height: 36, borderBottom: '1px solid var(--color-border)' }}
    >
      <button
        className="text-xs px-2 h-6 rounded flex items-center gap-1"
        style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
        onClick={onAddTrack}
      >
        <Plus size={11} /> Track
      </button>
      <button
        className="text-xs px-2 h-6 rounded flex items-center gap-1"
        title="Split di posisi playhead (⌘B)"
        style={{
          background: hasSelection ? 'var(--color-bg-surface)' : 'transparent',
          color: hasSelection ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
          border: 'none', cursor: hasSelection ? 'pointer' : 'default',
          opacity: hasSelection ? 1 : 0.4,
        }}
        onClick={onSplit}
        disabled={!hasSelection}
      >
        <Scissors size={11} /> Split
      </button>
      <button
        className="text-xs px-2 h-6 rounded flex items-center gap-1"
        title="Hapus yang dipilih (Delete)"
        style={{
          background: hasSelection ? 'rgba(255,71,87,0.1)' : 'transparent',
          color: hasSelection ? 'var(--color-primary)' : 'var(--color-text-muted)',
          border: 'none', cursor: hasSelection ? 'pointer' : 'default',
          opacity: hasSelection ? 1 : 0.4,
        }}
        onClick={onDelete}
        disabled={!hasSelection}
      >
        <Trash2 size={11} /> Hapus
      </button>
      <div className="flex items-center gap-1 ml-auto">
        <label className="text-xs" htmlFor="timeline-zoom" style={{ color: 'var(--color-text-muted)' }}>Zoom</label>
        <input
          id="timeline-zoom"
          type="range" min={20} max={300} step={10} value={zoom}
          onChange={e => onZoom(+e.target.value)}
          style={{ width: 80 }}
        />
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', width: 32 }}>
          {Math.round(zoom / DEFAULT_PX_PER_SEC * 100)}%
        </span>
      </div>
    </div>
  )
}
