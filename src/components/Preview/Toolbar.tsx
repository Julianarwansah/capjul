import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

// The two floating button clusters over the preview canvas. Presentational only:
// zoom scale and guide visibility stay in the panel, which owns that state.

export interface PreviewZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

export function PreviewZoomControls({ onZoomIn, onZoomOut, onResetZoom }: PreviewZoomControlsProps) {
  const buttons = [
    { icon: <ZoomIn size={14} />, onClick: onZoomIn, title: 'Zoom In' },
    { icon: <ZoomOut size={14} />, onClick: onZoomOut, title: 'Zoom Out' },
    { icon: <RotateCcw size={14} />, onClick: onResetZoom, title: 'Reset' },
  ]
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1">
      {buttons.map(b => (
        <button
          key={b.title}
          title={b.title}
          aria-label={b.title}
          onClick={b.onClick}
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          {b.icon}
        </button>
      ))}
    </div>
  )
}

export interface PreviewGuideTogglesProps {
  showGrid: boolean
  showSafeZone: boolean
  onToggleGrid: () => void
  onToggleSafeZone: () => void
}

export function PreviewGuideToggles({
  showGrid, showSafeZone, onToggleGrid, onToggleSafeZone,
}: PreviewGuideTogglesProps) {
  const buttons = [
    { label: '⊞', active: showGrid, onClick: onToggleGrid, title: 'Grid' },
    { label: '⊡', active: showSafeZone, onClick: onToggleSafeZone, title: 'Safe Zone' },
  ]
  return (
    <div className="absolute top-2 left-2 flex gap-1">
      {buttons.map(b => (
        <button
          key={b.title}
          title={b.title}
          aria-label={b.title}
          aria-pressed={b.active}
          onClick={b.onClick}
          className="h-6 px-2 rounded text-xs"
          style={{
            background: b.active ? 'var(--color-primary)' : 'rgba(0,0,0,0.6)',
            color: 'white', border: 'none', cursor: 'pointer',
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
