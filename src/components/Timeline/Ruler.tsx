// The time ruler above the tracks: ticks, labels, and the playhead marker.
// Clicking it seeks; the coordinate maths stays in the Timeline, which owns the
// scroll container this is measured against.

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Tick spacing in seconds, coarsening as the timeline zooms out so the labels
 *  never collide. */
function tickInterval(pxPerSec: number): number {
  if (pxPerSec > 100) return 1
  if (pxPerSec > 50) return 2
  if (pxPerSec > 25) return 5
  return 10
}

export interface RulerProps {
  height: number
  /** Display length of the ruler, which floors short projects so it stays usable. */
  duration: number
  pxPerSec: number
  currentTime: number
  onClick: (e: React.MouseEvent) => void
}

export function Ruler({ height, duration, pxPerSec, currentTime, onClick }: RulerProps) {
  const interval = tickInterval(pxPerSec)
  const ticks = []
  for (let t = 0; t <= duration; t += interval) {
    // Every fifth tick is taller, labelled, and brighter.
    const major = t % (interval * 5) === 0
    ticks.push(
      <div key={t} className="absolute flex flex-col items-start" style={{ left: t * pxPerSec }}>
        <div style={{ height: major ? 10 : 6, width: 1, background: major ? '#555' : '#333' }} />
        {major && (
          <span style={{ fontSize: 9, color: '#666', marginTop: 1, transform: 'translateX(-50%)', userSelect: 'none' }}>
            {formatTime(t)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="sticky top-0 relative cursor-pointer"
      style={{
        height, zIndex: 10,
        background: 'var(--color-bg-panel)',
        borderBottom: '1px solid var(--color-border)',
      }}
      onClick={onClick}
    >
      {ticks}

      {/* Playhead on ruler */}
      <div
        className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
        style={{ left: currentTime * pxPerSec, background: 'var(--color-primary)' }}
      >
        <div style={{
          position: 'absolute', top: 0, left: -5, width: 10, height: 10,
          background: 'var(--color-primary)',
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }} />
      </div>
    </div>
  )
}
