import { useEffect, useRef, useState } from 'react'
import { selectHasSelection, useEditorStore } from '../../store/editorStore'
import { MEDIA_DRAG_MIME, makeAudioClipFromMedia, makeClipFromMedia } from '../../shared/clip-factory'
import { TrackLabel } from './ClipItems'
import { ContextMenu } from './ContextMenu'
import { Ruler } from './Ruler'
import { TimelineToolbar } from './TimelineToolbar'
import { TrackRow } from './TrackRow'
import { useClipContextMenu } from './useClipContextMenu'
import { useMarqueeSelection } from './useMarqueeSelection'
import type { Track } from '../../types'

const RULER_HEIGHT = 28
const LABEL_WIDTH = 140
// Short and empty projects still get a usable ruler. project.duration stays the
// real content length — this floor is display-only.
const MIN_TIMELINE_SECONDS = 60

export function Timeline() {
  const {
    project, currentTime, setCurrentTime, zoom, setZoom, isPlaying,
    addTrack, addClip, addAudioClip,
    splitAtPlayhead, deleteSelection,
  } = useEditorStore()
  const hasSelection = useEditorStore(selectHasSelection)

  const timelineRef = useRef<HTMLDivElement>(null)
  const [dropTrackId, setDropTrackId] = useState<string | null>(null)

  const pxPerSec = zoom
  const timelineDuration = Math.max(project.duration, MIN_TIMELINE_SECONDS)
  const totalWidth = Math.max(timelineDuration * pxPerSec + 200, 800)

  const ctxMenu = useClipContextMenu()
  const { marquee, onMouseDown: onMarqueeMouseDown } = useMarqueeSelection({
    containerRef: timelineRef, pxPerSec, labelWidth: LABEL_WIDTH, rulerHeight: RULER_HEIGHT,
  })

  function timeToX(t: number) { return t * pxPerSec }
  /** Absolute timeline position from a pixel offset inside the track area.
   *  Drag and trim deltas go through shared/clip-drag.ts instead, which must not
   *  clamp: dragging left and trimming shorter are both negative. */
  function xToTime(x: number) { return Math.max(0, x / pxPerSec) }

  // Auto-scroll timeline to keep playhead visible during playback
  useEffect(() => {
    if (!isPlaying) return
    const el = timelineRef.current
    if (!el) return
    const playheadX = currentTime * pxPerSec
    const visibleLeft = el.scrollLeft
    const visibleRight = el.scrollLeft + el.clientWidth - LABEL_WIDTH
    if (playheadX > visibleRight - 40 || playheadX < visibleLeft) {
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth * 0.3)
    }
  }, [currentTime, isPlaying, pxPerSec])

  // Click on ruler to seek
  function handleRulerClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const scrollLeft = timelineRef.current.scrollLeft
    const x = e.clientX - rect.left + scrollLeft - LABEL_WIDTH
    setCurrentTime(xToTime(x))
  }

  // Drop media from the Media panel onto a track at the drop position.
  function handleTrackDrop(e: React.DragEvent, track: Track) {
    e.preventDefault()
    setDropTrackId(null)
    const mediaId = e.dataTransfer.getData(MEDIA_DRAG_MIME)
    const media = project.media.find(m => m.id === mediaId)
    if (!media || !timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft - LABEL_WIDTH
    const startTime = xToTime(x)
    if (track.type === 'video') {
      const clip = makeClipFromMedia(media, track.id, startTime)
      if (clip) addClip(clip)
    } else if (track.type === 'audio') {
      const audioClip = makeAudioClipFromMedia(media, track.id, startTime)
      if (audioClip) addAudioClip(audioClip)
    }
  }

  const allTracks = project.tracks

  return (
    <>
    <div
      className="flex flex-col shrink-0"
      style={{ height: 280, borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}
    >
      <TimelineToolbar
        zoom={zoom}
        hasSelection={hasSelection}
        onAddTrack={() => addTrack('video')}
        onSplit={splitAtPlayhead}
        onDelete={deleteSelection}
        onZoom={setZoom}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Track labels */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{ width: LABEL_WIDTH, borderRight: '1px solid var(--color-border)' }}
        >
          {/* Ruler placeholder */}
          <div style={{ height: RULER_HEIGHT, borderBottom: '1px solid var(--color-border)' }} />

          {/* Track labels */}
          {allTracks.map(track => (
            <TrackLabel key={track.id} track={track} />
          ))}
        </div>

        {/* Timeline scroll area */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-auto"
          onScroll={() => {}}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY > 0 ? -15 : 15
              setZoom(Math.max(10, Math.min(500, zoom + delta)))
            }
          }}
        >
          <div style={{ width: totalWidth, minHeight: '100%' }}>
            <Ruler
              height={RULER_HEIGHT}
              duration={timelineDuration}
              pxPerSec={pxPerSec}
              currentTime={currentTime}
              fps={project.fps}
              onClick={handleRulerClick}
              onSeek={t => setCurrentTime(Math.min(project.duration, t))}
            />

            {/* Marquee selection box */}
            {marquee && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  border: '1.5px solid var(--color-primary)',
                  background: 'rgba(255,71,87,0.08)',
                  zIndex: 20,
                }}
              />
            )}

            {/* Tracks */}
            {allTracks.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                pxPerSec={pxPerSec}
                timelineDuration={timelineDuration}
                isDropTarget={dropTrackId === track.id}
                onMarqueeMouseDown={onMarqueeMouseDown}
                onDragStateChange={setDropTrackId}
                onDropMedia={handleTrackDrop}
                onClipContextMenu={ctxMenu.open}
              />
            ))}

            {/* Playhead line across tracks */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: timeToX(currentTime),
                width: 2,
                top: RULER_HEIGHT,
                background: 'rgba(255,71,87,0.5)',
                zIndex: 15,
              }}
            />
          </div>
        </div>
      </div>
    </div>

    {ctxMenu.target && (
      <ContextMenu
        x={ctxMenu.target.x}
        y={ctxMenu.target.y}
        items={ctxMenu.items()}
        onClose={ctxMenu.close}
      />
    )}
    </>
  )
}
