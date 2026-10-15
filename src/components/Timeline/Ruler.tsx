// The time ruler above the tracks: ticks, labels, and the playhead marker. It is
// also the timeline's seek surface, so it is a real slider - focusable,
// announced, and operable with the keyboard rather than only by clicking.

import { stepFrames } from '../../shared/frame-time'

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
  /** Display length of the ruler, which floors short projects so it stays usable. */
  duration: number
  pxPerSec: number
  currentTime: number
  fps: number
  onClick: (e: React.MouseEvent) => void
  /** Receives an unclamped target time; the caller owns the real project bounds. */
  onSeek: (t: number) => void
}

/**
 * The ruler fills its wrapper, which owns the height and the sticky positioning.
 * It used to own both itself; they moved out so that the marker layer could be a
 * sibling rather than a descendant, which a role="slider" element cannot have.
 */
export function Ruler({ duration, pxPerSec, currentTime, fps, onClick, onSeek }: RulerProps) {
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

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Stepping in whole frames rather than adding 1/fps: repeated addition
    // drifts, and a truncating timecode then shows the wrong second.
    const frames = e.shiftKey ? Math.round(5 * fps) : 1
    let next: number
    switch (e.key) {
      case 'ArrowLeft': next = stepFrames(currentTime, fps, -frames); break
      case 'ArrowRight': next = stepFrames(currentTime, fps, frames); break
      case 'Home': next = 0; break
      case 'End': next = duration; break
      default: return
    }
    // App.tsx binds these same keys globally. Without stopping propagation one
    // keypress would seek twice, which is exactly the bug the preview scrubber
    // had to guard against.
    e.preventDefault()
    e.stopPropagation()
    onSeek(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Timeline position"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      aria-valuetext={formatTime(currentTime)}
      className="absolute inset-0 cursor-pointer"
      style={{
        background: 'var(--color-bg-panel)',
        borderBottom: '1px solid var(--color-border)',
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
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
