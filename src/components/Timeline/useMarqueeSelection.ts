import { useCallback, useState, type RefObject } from 'react'
import { useEditorStore } from '../../store/editorStore'

export interface MarqueeRect {
  x: number
  y: number
  w: number
  h: number
}

/** Shorter than this in time and the gesture is a click, not a selection. */
const MIN_MARQUEE_SECONDS = 0.05

interface Options {
  containerRef: RefObject<HTMLDivElement | null>
  pxPerSec: number
  /** Width of the track-label column, which the scroll area's coordinates exclude. */
  labelWidth: number
  /** Height of the ruler, which sits above the tracks inside the scroll area. */
  rulerHeight: number
}

/**
 * Rubber-band selection over the tracks. Dragging on empty track space draws a
 * box and, on release, selects every clip of every kind overlapping the time
 * range it covers. Only the horizontal extent matters: the box spans whole tracks
 * vertically in the UI but selects by time.
 */
export function useMarqueeSelection({ containerRef, pxPerSec, labelWidth, rulerHeight }: Options) {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    // Track-area coordinates: past the label column, below the ruler, and
    // following the container's live scroll position.
    const toLocal = (p: { clientX: number; clientY: number }) => ({
      x: p.clientX - rect.left + container.scrollLeft - labelWidth,
      y: p.clientY - rect.top + container.scrollTop - rulerHeight,
    })

    const start = toLocal(e)
    let cur = start

    // Arrow, not `function`: hoisted declarations lose the non-null narrowing of `container`.
    const onMove = (me: MouseEvent) => {
      cur = toLocal(me)
      setMarquee({
        x: Math.min(start.x, cur.x) + labelWidth,
        y: Math.min(start.y, cur.y) + rulerHeight,
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      })
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const xToTime = (x: number) => Math.max(0, x / pxPerSec)
      const t1 = xToTime(Math.min(start.x, cur.x))
      const t2 = xToTime(Math.max(start.x, cur.x))
      if (t2 - t1 < MIN_MARQUEE_SECONDS) { setMarquee(null); return }

      // Read on release, not on mousedown: the project may have changed while
      // the gesture was in flight.
      const s = useEditorStore.getState()
      const overlapping = <T extends { id: string; startTime: number; duration: number }>(list: T[]) =>
        list.filter(c => c.startTime < t2 && c.startTime + c.duration > t1).map(c => c.id)
      s.setSelected({
        clips: overlapping(s.project.clips),
        audios: overlapping(s.project.audioClips),
        texts: overlapping(s.project.textClips),
        stickers: overlapping(s.project.stickerClips),
      })
      setMarquee(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [containerRef, pxPerSec, labelWidth, rulerHeight])

  return { marquee, onMouseDown }
}
