import { X } from 'lucide-react'
import { formatTimecode } from '../../shared/frame-time'
import type { Marker } from '../../types'

// Marker flags, painted over the ruler.
//
// This is a sibling of the ruler rather than a child of it on purpose. The ruler
// is role="slider", and a slider must not contain focusable descendants, so the
// delete buttons have to live in their own layer. The layer itself is
// pointer-events-none, which keeps the ruler's click-to-seek working everywhere
// except on the small delete target.

// Amber, matching the keyframe diamonds: both mean "a point the editor was told
// to care about", and neither is a ruler graduation.
const MARKER_COLOR = '#f59e0b'

export interface MarkerFlagsProps {
  markers: Marker[]
  pxPerSec: number
  fps: number
  height: number
  onRemove: (id: string) => void
}

export function MarkerFlags({ markers, pxPerSec, fps, height, onRemove }: MarkerFlagsProps) {
  if (markers.length === 0) return null

  // A marker on the playhead's exact frame is visually subsumed by the playhead
  // head, which carries z-20 inside the ruler and so paints above this layer.
  // That is intended: the playhead is the primary cursor and must never be
  // covered, and a marker under it is not lost - the toolbar flips to "Hapus
  // Marker" and [ ] still land on it. Raising this layer above z-20 would trade
  // a hidden marker for a hidden playhead, which is the worse of the two.
  return (
    <div className="absolute inset-0 pointer-events-none">
      {markers.map(m => {
        const timecode = formatTimecode(m.time, fps)
        return (
          <div
            key={m.id}
            className="absolute top-0 group"
            style={{ left: m.time * pxPerSec, height }}
          >
            {/* The flag: a diamond on the ruler's top edge and a hairline down
                through it. Distinct from a tick by colour and by the diamond, so
                a marker is not mistaken for a ruler graduation. */}
            <div style={{
              position: 'absolute', top: 0, left: -3,
              width: 7, height: 7, transform: 'rotate(45deg)',
              background: MARKER_COLOR, borderRadius: 1,
            }} />
            <div style={{
              position: 'absolute', top: 6, left: 0, width: 1, height: height - 6,
              background: MARKER_COLOR, opacity: 0.75,
            }} />

            <button
              className="pointer-events-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
              style={{
                position: 'absolute', top: 1, left: 6,
                width: 12, height: 12, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-bg-surface)', color: MARKER_COLOR,
                border: `1px solid ${MARKER_COLOR}`, borderRadius: 2,
                cursor: 'pointer', transition: 'opacity 0.12s',
              }}
              onClick={e => { e.stopPropagation(); onRemove(m.id) }}
              aria-label={`Hapus marker pada ${timecode}`}
              title={`Hapus marker pada ${timecode}`}
            >
              <X size={8} />
            </button>

            {/* Read-only announcement of the marker for assistive tech. It is not
                focusable, so it adds nothing to the tab order; jumping to a
                marker is the [ and ] bindings, surfaced in the toolbar. */}
            <span className="sr-only">Marker pada {timecode}</span>
          </div>
        )
      })}
    </div>
  )
}
