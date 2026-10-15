import type { MouseEvent as ReactMouseEvent } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { draggedStartTimeSnapped, snappedTrimDxPx, trimChanges, type DraggableClip, type TrimChanges } from '../../shared/clip-drag'

// DOM glue for dragging and trimming clips on the timeline. All the arithmetic
// lives in shared/clip-drag.ts, which is pure and tested; this module only
// translates mouse events into calls to it and to the store.
//
// These replace seven near-identical handlers that used to live in the Timeline
// component - four for moving and three for trimming. Two of the trimming ones
// were mathematically identical, which is how a clamped-delta bug survived in
// more than one copy.

/** Which of the store's four selection buckets a clip belongs to. */
export type SelectionKind = 'clips' | 'texts' | 'stickers' | 'audios'

type Selection = { clips?: string[]; texts?: string[]; stickers?: string[]; audios?: string[] }
type MoveUpdate = (id: string, changes: { startTime: number }) => void
type TrimUpdate = (id: string, changes: TrimChanges) => void

function onlyKind(kind: SelectionKind, ids: string[]): Selection {
  return { [kind]: ids }
}

/** Runs `onMove` on every mousemove until the button is released. */
function trackDrag(onMove: (e: MouseEvent) => void) {
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

/**
 * Selects a clip and drags it along the timeline.
 *
 * Shift at mousedown toggles the clip in or out of the current selection; shift
 * held *during* the drag instead disables snapping, which is the existing
 * convention for moving something precisely.
 */
export function startClipMove(
  e: ReactMouseEvent,
  kind: SelectionKind,
  clipId: string,
  clipStart: number,
  update: MoveUpdate,
) {
  e.stopPropagation()
  e.preventDefault()
  const startX = e.clientX

  const store = useEditorStore.getState()
  const current = {
    clips: store.selectedClipIds,
    texts: store.selectedTextIds,
    stickers: store.selectedStickerIds,
    audios: store.selectedAudioIds,
  }
  if (e.shiftKey) {
    const ids = current[kind]
    store.setSelected({
      ...current,
      [kind]: ids.includes(clipId) ? ids.filter(id => id !== clipId) : [...ids, clipId],
    })
  } else {
    store.setSelected(onlyKind(kind, [clipId]))
  }

  trackDrag(me => {
    // Read the store on every move rather than capturing it at mousedown: a drag
    // spans many frames, and snapping against a stale playhead or zoom is wrong.
    const s = useEditorStore.getState()
    const startTime = draggedStartTimeSnapped({
      clipStart,
      dxPx: me.clientX - startX,
      pxPerSec: s.zoom,
      project: s.project,
      playhead: s.currentTime,
      excludeId: clipId,
      snap: s.snapEnabled && !me.shiftKey,
    })
    update(clipId, { startTime })
  })
}

/**
 * Trims a clip from one edge. Clips that address a window of a source file move
 * that window with the trim; text and stickers have none and only change timing.
 *
 * Edges snap like moves do - to the playhead, other clips' edges and markers -
 * which they did not before: a drag would land on a beat and a trim on a pixel
 * next to it. Shift held during the trim, or the magnet off, trims freely.
 */
export function startClipTrim(
  e: ReactMouseEvent,
  side: 'left' | 'right',
  clip: DraggableClip & { id: string },
  update: TrimUpdate,
) {
  e.stopPropagation()
  e.preventDefault()
  const startX = e.clientX

  trackDrag(me => {
    const s = useEditorStore.getState()
    const dxPx = snappedTrimDxPx({
      side,
      clip,
      dxPx: me.clientX - startX,
      pxPerSec: s.zoom,
      project: s.project,
      playhead: s.currentTime,
      snap: s.snapEnabled && !me.shiftKey,
    })
    update(clip.id, trimChanges(side, clip, dxPx, s.zoom))
  })
}
