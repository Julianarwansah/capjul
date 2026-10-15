import { Eraser, Flag, Magnet, Plus, Scissors, Trash2 } from 'lucide-react'

// The strip above the tracks: add a track, split or delete the selection, mark
// the playhead, and zoom. Presentational only - the actions and the selection
// state live in the store and are passed in.

export interface TimelineToolbarProps {
  zoom: number
  hasSelection: boolean
  markerCount: number
  /** A marker sits on the playhead's frame, so the button removes rather than adds. */
  markerAtPlayhead: boolean
  snapEnabled: boolean
  onAddTrack: () => void
  onSplit: () => void
  onDelete: () => void
  onToggleMarker: () => void
  onClearMarkers: () => void
  onToggleSnap: () => void
  onZoom: (zoom: number) => void
}

/** Zoom is displayed as a percentage of the default 80 px/s. */
export const DEFAULT_PX_PER_SEC = 80

const TOOL_BUTTON = 'text-xs px-2 h-6 rounded flex items-center gap-1'

export function TimelineToolbar({
  zoom, hasSelection, markerCount, markerAtPlayhead, snapEnabled,
  onAddTrack, onSplit, onDelete, onToggleMarker, onClearMarkers, onToggleSnap, onZoom,
}: TimelineToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{ height: 36, borderBottom: '1px solid var(--color-border)' }}
    >
      <button
        className={TOOL_BUTTON}
        style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
        onClick={onAddTrack}
      >
        <Plus size={11} /> Track
      </button>
      <button
        className={TOOL_BUTTON}
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
        className={TOOL_BUTTON}
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
      <button
        className={TOOL_BUTTON}
        title={markerAtPlayhead
          ? 'Hapus marker di playhead (M) · lompat antar marker ([ dan ])'
          : 'Tambah marker di playhead (M) · lompat antar marker ([ dan ])'}
        aria-pressed={markerAtPlayhead}
        style={{
          background: markerAtPlayhead ? 'rgba(245,158,11,0.14)' : 'var(--color-bg-surface)',
          color: markerAtPlayhead ? '#f59e0b' : 'var(--color-text-secondary)',
          border: 'none', cursor: 'pointer',
        }}
        onClick={onToggleMarker}
      >
        <Flag size={11} /> {markerAtPlayhead ? 'Hapus Marker' : 'Marker'}
      </button>
      {markerCount > 0 && (
        <button
          className={TOOL_BUTTON}
          title="Hapus semua marker"
          aria-label={`Hapus semua ${markerCount} marker`}
          style={{
            background: 'transparent', color: 'var(--color-text-muted)',
            border: 'none', cursor: 'pointer',
          }}
          onClick={onClearMarkers}
        >
          <Eraser size={11} /> {markerCount}
        </button>
      )}
      {/* The icon changes shape as well as colour, so the state does not rest on
          colour alone; aria-pressed carries it for assistive tech. */}
      <button
        className={TOOL_BUTTON}
        title={snapEnabled
          ? 'Snap mati: geser dan trim bebas (shift tetap membebaskan)'
          : 'Snap nyala: geser dan trim menempel ke playhead, tepi clip dan marker'}
        aria-label={snapEnabled ? 'Matikan snap' : 'Nyalakan snap'}
        aria-pressed={snapEnabled}
        style={{
          background: snapEnabled ? 'var(--color-bg-surface)' : 'transparent',
          color: snapEnabled ? 'var(--color-primary)' : 'var(--color-text-muted)',
          border: 'none', cursor: 'pointer',
          opacity: snapEnabled ? 1 : 0.6,
        }}
        onClick={onToggleSnap}
      >
        {/* lucide has no magnet-off glyph, so the off state strikes the magnet
            through: a shape change, not only a colour change. */}
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Magnet size={11} />
          {!snapEnabled && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', left: -1, right: -1, top: '50%', height: 1,
                background: 'currentColor', transform: 'rotate(-45deg)',
              }}
            />
          )}
        </span>
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
