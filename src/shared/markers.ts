import type { Marker } from './project-schema'

// Markers: points on the timeline the playhead can jump to and dragged clips can
// snap to. They are an editing aid - nothing here reaches the export. Pure
// arithmetic only, so the toggle, the "is one already here" test and the
// neighbour search can be tested without a timeline.

/**
 * Half a frame. A marker counts as being at the playhead when both land on the
 * same frame, which is the tightest reading that still survives the float
 * arithmetic of stepping the playhead by whole frames: one frame away is
 * `1 / fps`, strictly outside this.
 */
export function markerTolerance(fps: number): number {
  return 0.5 / fps
}

/** The marker on the same frame as `time`, if any. */
export function markerAt(markers: Marker[], time: number, fps: number): Marker | undefined {
  const tolerance = markerTolerance(fps)
  return markers.find(m => Math.abs(m.time - time) <= tolerance)
}

/**
 * Add a marker at `time`, or remove the one already there. One operation does
 * both so that pressing the binding twice cannot stack two markers on the same
 * frame, and so the user never has to aim at a 1px flag to undo adding one.
 *
 * The result is sorted by time, which keeps the stored array canonical whatever
 * order markers were added in — a file that was hand-edited or migrated is not
 * required to be pre-sorted for anything here to work.
 */
export function toggleMarker(
  markers: Marker[],
  time: number,
  fps: number,
  newId: string,
): { markers: Marker[]; added: boolean } {
  const existing = markerAt(markers, time, fps)
  if (existing) {
    return { markers: markers.filter(m => m.id !== existing.id), added: false }
  }
  const next = [...markers, { id: newId, time }]
  next.sort((a, b) => a.time - b.time)
  return { markers: next, added: true }
}

/**
 * The nearest marker strictly in one direction from `time`, or undefined at the
 * ends. Strict inequality is what makes the binding repeatable: jumping forward
 * from a marker lands on the next one instead of re-selecting the marker the
 * playhead is already sitting on, which would make the key feel dead.
 */
export function neighborMarker(
  markers: Marker[],
  time: number,
  direction: 1 | -1,
): Marker | undefined {
  let best: Marker | undefined
  for (const m of markers) {
    if (direction === 1 ? m.time <= time : m.time >= time) continue
    if (!best || (direction === 1 ? m.time < best.time : m.time > best.time)) best = m
  }
  return best
}
