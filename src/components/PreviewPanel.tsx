import { useRef, useEffect, useState } from 'react'
import { Play, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { PreviewControls } from './PreviewControls'
import { STICKER_BASE_RATIO } from '../shared/sticker-assets'
import { stickerDataUrl } from '../shared/sticker-svgs'

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
  // An empty project has duration 0; guard so the bar renders 0% instead of NaN%.
  const progressPct = project.duration > 0 ? (currentTime / project.duration) * 100 : 0

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
        style={{ background: '#0a0a0a', containerType: 'size' }}
      >
        {/* Canvas container */}
        <div
          className="relative"
          style={{
            // Fit the project's aspect ratio inside the preview area exactly.
            // The previous expression ("80vh * 1.77px") was invalid CSS, so the
            // width declaration was dropped and the canvas collapsed to 0x0.
            width: `min(100cqw, calc(100cqh * ${aspectRatio}))`,
            aspectRatio: `${canvasW}/${canvasH}`,
            background: project.backgroundColor,
            overflow: 'hidden',
            transform: `scale(${previewScale})`,
            // Overlays size themselves in cqh so they track the rendered canvas
            // height, not the root font-size.
            containerType: 'size',
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
                fontSize: `${(t.fontSize / canvasH) * 100}cqh`,
                color: t.fontColor,
                fontWeight: t.bold ? 'bold' : 'normal',
                fontStyle: t.italic ? 'italic' : 'normal',
                textDecoration: t.underline ? 'underline' : 'none',
                textAlign: t.align,
                textShadow: `${(t.shadowX / canvasH) * 100}cqh ${(t.shadowY / canvasH) * 100}cqh ${(t.shadowBlur / canvasH) * 100}cqh ${t.shadowColor}`,
                WebkitTextStroke: t.strokeWidth ? `${(t.strokeWidth / canvasH) * 100}cqh ${t.strokeColor}` : undefined,
                letterSpacing: `${(t.letterSpacing / canvasH) * 100}cqh`,
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
          {activeStickerClips.map(s => {
            const url = stickerDataUrl(s.src)
            if (!url) return null
            return (
              <img
                key={s.id}
                src={url}
                alt=""
                className="absolute"
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${STICKER_BASE_RATIO * 100 * s.scaleX}cqh`,
                  transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                  opacity: s.opacity,
                  cursor: 'move',
                }}
              />
            )
          })}

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

      <PreviewControls
        currentTime={currentTime}
        duration={project.duration}
        fps={project.fps}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        progressPct={progressPct}
        volume={volume}
        muted={muted}
        onSeek={handleSeek}
        onPlayPause={handlePlayPause}
        onSetCurrentTime={setCurrentTime}
        onSetPlaybackSpeed={setPlaybackSpeed}
        onToggleMuted={() => setMuted(m => !m)}
        onVolume={v => { setVolume(v); if (videoRef.current) videoRef.current.volume = v }}
      />
    </div>
  )
}
