import { useRef, useEffect, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize2, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useEditorStore } from '../store/editorStore'

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

export function PreviewPanel() {
  const {
    project, currentTime, isPlaying, playbackSpeed,
    setCurrentTime, setIsPlaying, setPlaybackSpeed,
  } = useEditorStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  // Use a ref so the RAF callback always reads the latest currentTime
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(project.duration)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [showGrid, setShowGrid] = useState(false)
  const [showSafeZone, setShowSafeZone] = useState(false)

  // Keep refs in sync with state/props
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { durationRef.current = project.duration }, [project.duration])

  // Find the video clip at current time
  const activeClip = project.clips.find(c =>
    c.startTime <= currentTime && c.startTime + c.duration > currentTime
  )
  const activeMedia = activeClip ? project.media.find(m => m.id === activeClip.mediaId) : null
  const activeTextClips = project.textClips.filter(t =>
    t.startTime <= currentTime && t.startTime + t.duration > currentTime
  )
  const activeStickerClips = project.stickerClips.filter(s =>
    s.startTime <= currentTime && s.startTime + s.duration > currentTime
  )

  // Sync video with timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeMedia) return
    const clipTime = currentTime - (activeClip?.startTime ?? 0) + (activeClip?.mediaStart ?? 0)
    if (Math.abs(video.currentTime - clipTime) > 0.1) {
      video.currentTime = clipTime
    }
  }, [currentTime, activeMedia, activeClip?.startTime, activeClip?.mediaStart])

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current)
      videoRef.current?.pause()
      return
    }
    videoRef.current?.play().catch(() => {})

    let last = performance.now()
    function tick(now: number) {
      const dt = (now - last) / 1000 * playbackSpeed
      last = now
      const next = Math.min(currentTimeRef.current + dt, durationRef.current)
      setCurrentTime(next)
      if (next >= durationRef.current) { setIsPlaying(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, playbackSpeed, setCurrentTime, setIsPlaying])

  function handlePlayPause() {
    if (currentTime >= project.duration) setCurrentTime(0)
    setIsPlaying(!isPlaying)
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const bar = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - bar.left) / bar.width
    setCurrentTime(Math.max(0, Math.min(project.duration, ratio * project.duration)))
  }

  const canvasW = project.width
  const canvasH = project.height
  const aspectRatio = canvasW / canvasH

  // Get CSS filter for active clip
  const clipFilter = activeClip
    ? [
        activeClip.filter ?? '',
        activeClip.brightness ? `brightness(${1 + activeClip.brightness / 100})` : '',
        activeClip.contrast ? `contrast(${1 + activeClip.contrast / 100})` : '',
        activeClip.saturation ? `saturate(${1 + activeClip.saturation / 100})` : '',
      ].filter(Boolean).join(' ')
    : ''

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-base)' }}>
      {/* Preview area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        style={{ background: '#0a0a0a' }}
      >
        {/* Canvas container */}
        <div
          className="relative"
          style={{
            width: `min(100%, ${aspectRatio > 1 ? '80vh * ' + aspectRatio : '60vw'}px)`,
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: `${canvasW}/${canvasH}`,
            background: project.backgroundColor,
            overflow: 'hidden',
            transform: `scale(${previewScale})`,
          }}
        >
          {/* Background video/image */}
          {activeMedia?.type === 'video' && (
            <video
              ref={videoRef}
              src={`media://${activeMedia.path}`}
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: 'contain',
                filter: clipFilter,
                opacity: activeClip?.opacity ?? 1,
                transform: `translate(${(activeClip?.x ?? 0) * 100}%, ${(activeClip?.y ?? 0) * 100}%) scale(${activeClip?.scaleX ?? 1}, ${activeClip?.scaleY ?? 1}) rotate(${activeClip?.rotation ?? 0}deg)`,
              }}
              muted={muted}
              playsInline
            />
          )}
          {activeMedia?.type === 'image' && (
            <img
              src={`media://${activeMedia.path}`}
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'contain', filter: clipFilter, opacity: activeClip?.opacity ?? 1 }}
              alt=""
            />
          )}

          {/* Text overlays */}
          {activeTextClips.map(t => (
            <div
              key={t.id}
              className="absolute"
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scaleX}, ${t.scaleY})`,
                fontFamily: t.fontFamily,
                fontSize: `${t.fontSize / canvasH * 100}%`,
                color: t.fontColor,
                fontWeight: t.bold ? 'bold' : 'normal',
                fontStyle: t.italic ? 'italic' : 'normal',
                textDecoration: t.underline ? 'underline' : 'none',
                textAlign: t.align,
                textShadow: `${t.shadowX}px ${t.shadowY}px ${t.shadowBlur}px ${t.shadowColor}`,
                WebkitTextStroke: t.strokeWidth ? `${t.strokeWidth}px ${t.strokeColor}` : undefined,
                whiteSpace: 'pre-wrap',
                userSelect: 'none',
                cursor: 'move',
                padding: '4px 8px',
                background: t.backgroundColor !== 'transparent' ? t.backgroundColor : undefined,
              }}
            >
              {t.text}
            </div>
          ))}

          {/* Sticker overlays */}
          {activeStickerClips.map(s => (
            <div
              key={s.id}
              className="absolute text-4xl"
              style={{
                left: `${s.x * 100}%`, top: `${s.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${s.rotation}deg) scale(${s.scaleX}, ${s.scaleY})`,
                opacity: s.opacity, cursor: 'move',
              }}
            >
              {s.src}
            </div>
          ))}

          {/* Safe zone overlay */}
          {showSafeZone && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute" style={{ inset: '10%', border: '1px dashed rgba(255,255,255,0.3)' }} />
              <div className="absolute" style={{ inset: '20%', border: '1px dashed rgba(255,255,255,0.15)' }} />
            </div>
          )}

          {/* Grid overlay */}
          {showGrid && (
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '33.33% 33.33%',
            }} />
          )}

          {/* Placeholder when no media */}
          {!activeMedia && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ color: 'rgba(255,255,255,0.15)' }}>
              <Play size={48} />
              <p className="text-sm">Add media to start editing</p>
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            { icon: <ZoomIn size={14} />, onClick: () => setPreviewScale(s => Math.min(2, s + 0.1)), title: 'Zoom In' },
            { icon: <ZoomOut size={14} />, onClick: () => setPreviewScale(s => Math.max(0.2, s - 0.1)), title: 'Zoom Out' },
            { icon: <RotateCcw size={14} />, onClick: () => setPreviewScale(1), title: 'Reset' },
          ].map((b, i) => (
            <button key={i} title={b.title} onClick={b.onClick}
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer' }}>
              {b.icon}
            </button>
          ))}
        </div>

        {/* Grid / Safe zone toggles */}
        <div className="absolute top-2 left-2 flex gap-1">
          {[
            { label: '⊞', active: showGrid, onClick: () => setShowGrid(v => !v), title: 'Grid' },
            { label: '⊡', active: showSafeZone, onClick: () => setShowSafeZone(v => !v), title: 'Safe Zone' },
          ].map((b, i) => (
            <button key={i} title={b.title} onClick={b.onClick}
              className="h-6 px-2 rounded text-xs"
              style={{
                background: b.active ? 'var(--color-primary)' : 'rgba(0,0,0,0.6)',
                color: 'white', border: 'none', cursor: 'pointer',
              }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div
        className="shrink-0 px-4 py-2"
        style={{ background: 'var(--color-bg-panel)', borderTop: '1px solid var(--color-border)' }}
      >
        {/* Progress bar */}
        <div
          className="h-1 rounded-full mb-3 cursor-pointer relative group"
          style={{ background: 'var(--color-bg-hover)' }}
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${(currentTime / project.duration) * 100}%`, background: 'var(--color-primary)' }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: `${(currentTime / project.duration) * 100}%`,
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-primary)',
            }}
          />
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-3">
          {/* Time */}
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)', minWidth: 80 }}>
            {formatTime(currentTime)}
          </span>

          {/* Main controls */}
          <div className="flex items-center gap-1 mx-auto">
            <CtrlBtn icon={<SkipBack size={16} />} onClick={() => setCurrentTime(0)} title="Go to start" />
            <CtrlBtn icon={<ChevronLeft size={16} />} onClick={() => setCurrentTime(Math.max(0, currentTime - 1 / project.fps))} title="Previous frame" />
            <button
              onClick={handlePlayPause}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <CtrlBtn icon={<ChevronRight size={16} />} onClick={() => setCurrentTime(Math.min(project.duration, currentTime + 1 / project.fps))} title="Next frame" />
            <CtrlBtn icon={<SkipForward size={16} />} onClick={() => setCurrentTime(project.duration)} title="Go to end" />
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Speed */}
            <div className="relative">
              <button
                className="text-xs px-2 h-7 rounded"
                style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowSpeedMenu(v => !v)}
              >
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div
                  className="absolute bottom-9 right-0 rounded overflow-hidden shadow-lg z-50"
                  style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
                >
                  {PLAYBACK_SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => { setPlaybackSpeed(s); setShowSpeedMenu(false) }}
                      className="block w-full px-4 py-1.5 text-xs text-left"
                      style={{
                        background: playbackSpeed === s ? 'var(--color-primary)' : 'transparent',
                        color: playbackSpeed === s ? 'white' : 'var(--color-text-secondary)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume */}
            <button
              onClick={() => setMuted(m => !m)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={e => { setVolume(+e.target.value); if (videoRef.current) videoRef.current.volume = +e.target.value }}
              style={{ width: 64 }}
            />

            {/* Duration */}
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)', minWidth: 60 }}>
              / {formatTime(project.duration)}
            </span>

            <CtrlBtn icon={<Maximize2 size={15} />} onClick={() => {}} title="Fullscreen" />
          </div>
        </div>
      </div>
    </div>
  )
}

function CtrlBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-8 h-8 rounded flex items-center justify-center"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      {icon}
    </button>
  )
}
