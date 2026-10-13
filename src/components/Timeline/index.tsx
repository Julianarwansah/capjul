import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { MEDIA_DRAG_MIME, makeAudioClipFromMedia, makeClipFromMedia } from '../../shared/clip-factory'
import { AudioClipItem, StickerClipItem, TextClipItem, TrackLabel, VideoClipItem } from './ClipItems'
import type { Clip, Track } from '../../types'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const RULER_HEIGHT = 28
const LABEL_WIDTH = 140
// Short and empty projects still get a usable ruler. project.duration stays the
// real content length — this floor is display-only.
const MIN_TIMELINE_SECONDS = 60

export function Timeline() {
  const {
    project, currentTime, setCurrentTime, zoom, setZoom,
    selectedClipIds, setSelected, updateClip, addTrack,
    addClip, addAudioClip,
  } = useEditorStore()

  const timelineRef = useRef<HTMLDivElement>(null)
  const [dropTrackId, setDropTrackId] = useState<string | null>(null)

  const pxPerSec = zoom
  const timelineDuration = Math.max(project.duration, MIN_TIMELINE_SECONDS)
  const totalWidth = Math.max(timelineDuration * pxPerSec + 200, 800)

  function timeToX(t: number) { return t * pxPerSec }
  function xToTime(x: number) { return Math.max(0, x / pxPerSec) }

  // Click on ruler to seek
  function handleRulerClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const scrollLeft = timelineRef.current.scrollLeft
    const x = e.clientX - rect.left + scrollLeft - LABEL_WIDTH
    setCurrentTime(xToTime(x))
  }

  // Drag clip
  function handleClipMouseDown(e: React.MouseEvent, clipId: string, clipStart: number) {
    e.stopPropagation()
    e.preventDefault()
    const x = e.clientX
    setSelected({ clips: [clipId] })

    function onMove(me: MouseEvent) {
      const dx = me.clientX - x
      const newStart = Math.max(0, clipStart + xToTime(dx))
      updateClip(clipId, { startTime: newStart })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Resize clip
  function handleResizeMouseDown(e: React.MouseEvent, clipId: string, side: 'left' | 'right', clip: Clip) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX

    function onMove(me: MouseEvent) {
      const dx = xToTime(me.clientX - startX)
      if (side === 'right') {
        const newDur = Math.max(0.1, clip.duration + dx)
        updateClip(clipId, { duration: newDur, mediaEnd: clip.mediaStart + newDur })
      } else {
        const newStart = Math.max(0, clip.startTime + dx)
        const newDur = Math.max(0.1, clip.duration - dx)
        updateClip(clipId, { startTime: newStart, duration: newDur, mediaStart: clip.mediaStart + dx })
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function isDroppableTrack(track: Track) {
    return track.type === 'video' || track.type === 'audio'
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

  // Ruler ticks
  function renderRuler() {
    const ticks = []
    const interval = zoom > 100 ? 1 : zoom > 50 ? 2 : zoom > 25 ? 5 : 10
    for (let t = 0; t <= timelineDuration; t += interval) {
      ticks.push(
        <div key={t} className="absolute flex flex-col items-start" style={{ left: timeToX(t) }}>
          <div style={{ height: t % (interval * 5) === 0 ? 10 : 6, width: 1, background: t % (interval * 5) === 0 ? '#555' : '#333' }} />
          {t % (interval * 5) === 0 && (
            <span style={{ fontSize: 9, color: '#666', marginTop: 1, transform: 'translateX(-50%)', userSelect: 'none' }}>
              {formatTime(t)}
            </span>
          )}
        </div>
      )
    }
    return ticks
  }

  const allTracks = project.tracks

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ height: 280, borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ height: 36, borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          className="text-xs px-2 h-6 rounded flex items-center gap-1"
          style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
          onClick={() => addTrack('video')}
        >
          <Plus size={11} /> Track
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Zoom</span>
          <input
            type="range" min={20} max={300} step={10} value={zoom}
            onChange={e => setZoom(+e.target.value)}
            style={{ width: 80 }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)', width: 32 }}>{Math.round(zoom / 80 * 100)}%</span>
        </div>
      </div>

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
        >
          <div style={{ width: totalWidth, minHeight: '100%' }}>
            {/* Ruler */}
            <div
              className="sticky top-0 relative cursor-pointer"
              style={{
                height: RULER_HEIGHT, zIndex: 10,
                background: 'var(--color-bg-panel)',
                borderBottom: '1px solid var(--color-border)',
              }}
              onClick={handleRulerClick}
            >
              {renderRuler()}

              {/* Playhead on ruler */}
              <div
                className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                style={{ left: timeToX(currentTime), background: 'var(--color-primary)' }}
              >
                <div style={{
                  position: 'absolute', top: 0, left: -5, width: 10, height: 10,
                  background: 'var(--color-primary)',
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                }} />
              </div>
            </div>

            {/* Tracks */}
            {allTracks.map(track => (
              <div
                key={track.id}
                className={`relative${dropTrackId === track.id ? ' drag-over' : ''}`}
                style={{
                  height: track.height,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-base)',
                }}
                onDragOver={e => {
                  if (!isDroppableTrack(track)) return
                  if (!e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) return
                  e.preventDefault()
                  setDropTrackId(track.id)
                }}
                onDragLeave={e => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setDropTrackId(cur => (cur === track.id ? null : cur))
                }}
                onDrop={e => handleTrackDrop(e, track)}
              >
                {/* Beat lines */}
                {Array.from({ length: Math.ceil(timelineDuration) }).map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px"
                    style={{ left: timeToX(i), background: i % 5 === 0 ? '#222' : '#1a1a1a' }} />
                ))}

                {/* Video clips */}
                {track.type === 'video' && project.clips.filter(c => c.trackId === track.id).map(clip => (
                  <VideoClipItem
                    key={clip.id}
                    clip={clip}
                    track={track}
                    pxPerSec={pxPerSec}
                    selected={selectedClipIds.includes(clip.id)}
                    onMouseDown={e => handleClipMouseDown(e, clip.id, clip.startTime)}
                    onResizeLeft={e => handleResizeMouseDown(e, clip.id, 'left', clip)}
                    onResizeRight={e => handleResizeMouseDown(e, clip.id, 'right', clip)}
                    media={project.media.find(m => m.id === clip.mediaId)}
                  />
                ))}

                {/* Audio clips */}
                {track.type === 'audio' && project.audioClips.filter(c => c.trackId === track.id).map(clip => (
                  <AudioClipItem
                    key={clip.id}
                    clip={clip}
                    pxPerSec={pxPerSec}
                  />
                ))}

                {/* Text clips */}
                {track.type === 'text' && project.textClips.filter(c => c.trackId === track.id).map(clip => (
                  <TextClipItem key={clip.id} clip={clip} pxPerSec={pxPerSec} />
                ))}

                {/* Sticker clips */}
                {track.type === 'sticker' && project.stickerClips.filter(c => c.trackId === track.id).map(clip => (
                  <StickerClipItem key={clip.id} clip={clip} pxPerSec={pxPerSec} />
                ))}
              </div>
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
  )
}
