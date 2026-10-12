import { useRef, useMemo } from 'react'
import { Plus, Lock, Unlock, Volume2, VolumeX } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { Clip, TextClip, AudioClip, StickerClip, Track, MediaFile } from '../../types'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const TRACK_COLORS: Record<Track['type'], string> = {
  video: 'var(--color-track-video)',
  audio: 'var(--color-track-audio)',
  text: 'var(--color-track-text)',
  sticker: 'var(--color-track-sticker)',
  fx: '#f472b6',
}

const RULER_HEIGHT = 28
const LABEL_WIDTH = 140

export function Timeline() {
  const {
    project, currentTime, setCurrentTime, zoom, setZoom,
    selectedClipIds, setSelected, updateClip, addTrack,
  } = useEditorStore()

  const timelineRef = useRef<HTMLDivElement>(null)

  const pxPerSec = zoom
  const totalWidth = Math.max(project.duration * pxPerSec + 200, 800)

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

  // Ruler ticks
  function renderRuler() {
    const ticks = []
    const interval = zoom > 100 ? 1 : zoom > 50 ? 2 : zoom > 25 ? 5 : 10
    for (let t = 0; t <= project.duration; t += interval) {
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
                className="relative"
                style={{
                  height: track.height,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-base)',
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => e.preventDefault()}
              >
                {/* Beat lines */}
                {Array.from({ length: Math.ceil(project.duration) }).map((_, i) => (
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

function TrackLabel({ track }: { track: Track }) {
  const { updateTrack } = useEditorStore()
  return (
    <div
      className="flex items-center gap-1.5 px-2"
      style={{
        height: track.height,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-panel)',
      }}
    >
      <div
        className="w-2 h-4 rounded-sm shrink-0"
        style={{ background: TRACK_COLORS[track.type] }}
      />
      <span className="text-xs truncate flex-1" style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
        {track.label}
      </span>
      <div className="flex items-center gap-0.5">
        <TinyBtn
          icon={track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          active={track.muted}
        />
        <TinyBtn
          icon={track.locked ? <Lock size={10} /> : <Unlock size={10} />}
          onClick={() => updateTrack(track.id, { locked: !track.locked })}
          active={track.locked}
        />
      </div>
    </div>
  )
}

function TinyBtn({ icon, onClick, active }: { icon: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 rounded flex items-center justify-center"
      style={{
        background: active ? 'rgba(255,71,87,0.15)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      {icon}
    </button>
  )
}

function VideoClipItem({
  clip, track, pxPerSec, selected, onMouseDown, onResizeLeft, onResizeRight, media
}: {
  clip: Clip; track: Track; pxPerSec: number; selected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onResizeLeft: (e: React.MouseEvent) => void
  onResizeRight: (e: React.MouseEvent) => void
  media: MediaFile | undefined
}) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec

  return (
    <div
      className="absolute top-1 timeline-clip"
      style={{
        left, width, height: track.height - 8,
        background: selected ? '#2a4a6e' : '#1a3a5e',
        border: selected ? '1.5px solid var(--color-primary)' : '1.5px solid #2a5082',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
    >
      {/* Thumbnail strip */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(74,158,255,0.15), rgba(74,158,255,0.05))' }} />

      {/* Clip name */}
      <div className="absolute inset-0 flex items-center px-2 gap-1">
        <span className="text-xs font-medium truncate" style={{ color: '#fff', fontSize: 10, userSelect: 'none' }}>
          {media?.name ?? 'Video'}
        </span>
        {clip.speed !== 1 && (
          <span className="text-xs px-1 rounded" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 9 }}>
            {clip.speed}x
          </span>
        )}
      </div>

      {/* Resize handles */}
      <div className="range-handle left-0" onMouseDown={onResizeLeft} />
      <div className="range-handle right-0" style={{ right: 0, left: 'auto' }} onMouseDown={onResizeRight} />
    </div>
  )
}

/** Deterministic pseudo-random seeded by string hash + index — stable across renders */
function seededHeight(seed: string, index: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0
  h = (Math.imul(h ^ index, 0xbf58476d)) | 0
  return (((h >>> 0) % 10) + 2)
}

function AudioClipItem({ clip, pxPerSec }: { clip: AudioClip; pxPerSec: number }) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  const barCount = Math.floor(width / 4)
  const bars = useMemo(
    () => Array.from({ length: barCount }, (_, i) => seededHeight(clip.id, i)),
    [clip.id, barCount],
  )

  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height: 38,
        background: '#1a3e2a',
        border: '1.5px solid #2a5e3a',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
    >
      <div className="absolute inset-0 flex items-center px-2">
        <span className="text-xs truncate" style={{ color: '#4ade80', fontSize: 10 }}>Audio</span>
      </div>
      {/* Stable fake waveform */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 12 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            className="absolute bottom-0 w-px"
            style={{ left: i * 4, height: h, background: 'rgba(74,222,128,0.4)' }}
          />
        ))}
      </div>
    </div>
  )
}

function TextClipItem({ clip, pxPerSec }: { clip: TextClip; pxPerSec: number }) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height: 38,
        background: '#2e1f00',
        border: '1.5px solid #5e3a00',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
    >
      <div className="absolute inset-0 flex items-center px-2">
        <span className="text-xs truncate" style={{ color: '#f59e0b', fontSize: 10 }}>T: {clip.text}</span>
      </div>
    </div>
  )
}

function StickerClipItem({ clip, pxPerSec }: { clip: StickerClip; pxPerSec: number }) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height: 38,
        background: '#1f0e3e',
        border: '1.5px solid #4a2e7e',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
    >
      <div className="absolute inset-0 flex items-center px-2 gap-1">
        <span>{clip.src}</span>
        <span className="text-xs" style={{ color: '#a78bfa', fontSize: 10 }}>Sticker</span>
      </div>
    </div>
  )
}
