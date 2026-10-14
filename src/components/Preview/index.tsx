import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { PreviewControls } from './PreviewControls'
import { PreviewGuideToggles, PreviewZoomControls } from './Toolbar'
import {
  CaptionOverlay, EffectOverlays, GuideOverlays, StickerOverlay, TextOverlay,
} from './Overlays'
import { buildCssFilter, colorAdjustFactors } from '../../shared/color-adjust'
import { buildEffectsCssFilter } from '../../shared/effects'
import { findActiveTransition, transitionStyles } from '../../shared/transitions'
import { BaseMediaLayer, IncomingMediaLayer, OverlayVideos } from './MediaLayers'
import { useAudioClips } from './useAudioClips'
import { useChromaKey } from './useChromaKey'

export function PreviewPanel() {
  const {
    project, currentTime, isPlaying, playbackSpeed,
    setCurrentTime, setIsPlaying, setPlaybackSpeed,
    updateTextClip, updateStickerClip, setSelected,
  } = useEditorStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoRefB = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  // Use a ref so the RAF callback always reads the latest currentTime
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(project.duration)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [showGrid, setShowGrid] = useState(false)
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // The whole panel goes fullscreen, not just the canvas, so the transport
  // controls stay reachable. Escape exits through the browser, which is why the
  // button state is driven by the fullscreenchange event rather than by the
  // toggle function - otherwise leaving with Escape would desync the icon.
  useEffect(() => {
    function onChange() { setIsFullscreen(document.fullscreenElement === rootRef.current) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    const pending = document.fullscreenElement
      ? document.exitFullscreen()
      : rootRef.current?.requestFullscreen()
    // Rejection is not an error worth surfacing; the state syncs from the event.
    pending?.catch(() => {})
  }

  // Keep refs in sync with state/props
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { durationRef.current = project.duration }, [project.duration])

  // All video tracks sorted by their index (first track = background)
  const videoTracks = project.tracks.filter(t => t.type === 'video')

  // Find the video clip at current time for each track
  const allActiveClips = videoTracks
    .map(track => project.clips.find(c =>
      c.trackId === track.id && c.startTime <= currentTime && c.startTime + c.duration > currentTime
    ))
    .filter(Boolean) as typeof project.clips

  // Primary clip is the first track's clip
  const activeClip = allActiveClips[0] ?? null
  const activeMedia = activeClip ? project.media.find(m => m.id === activeClip.mediaId) : null

  // Secondary (overlay) clips — tracks 1+
  const overlayClips = allActiveClips.slice(1)

  // Video refs for overlays (up to 3 extra tracks). Individually stable refs
  // collected into a memoised array, so the sync effect below can list the array
  // as a dependency without re-running on every render.
  const overlayVideoRef1 = useRef<HTMLVideoElement>(null)
  const overlayVideoRef2 = useRef<HTMLVideoElement>(null)
  const overlayVideoRef3 = useRef<HTMLVideoElement>(null)
  const overlayVideoRefs = useMemo(
    () => [overlayVideoRef1, overlayVideoRef2, overlayVideoRef3],
    [overlayVideoRef1, overlayVideoRef2, overlayVideoRef3],
  )

  const activeTransition = findActiveTransition(project, currentTime)
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

  // Sync overlay video clips (multi-layer)
  useEffect(() => {
    overlayClips.forEach((clip, i) => {
      const ref = overlayVideoRefs[i]?.current
      if (!ref) return
      const media = project.media.find(m => m.id === clip.mediaId)
      const newSrc = media ? `media://${media.path}` : ''
      if (ref.src !== newSrc) ref.src = newSrc
      const clipTime = currentTime - clip.startTime + clip.mediaStart
      if (Math.abs(ref.currentTime - clipTime) > 0.1) ref.currentTime = Math.max(0, clipTime)
      if (isPlaying) ref.play().catch(() => {})
      else ref.pause()
    })
  }, [currentTime, isPlaying, overlayClips, project.media, overlayVideoRefs])

  // Sync video B during transitions
  useEffect(() => {
    const video = videoRefB.current
    if (!video || !activeTransition) return
    const { clipB } = activeTransition
    const clipTime = currentTime - clipB.startTime + clipB.mediaStart
    if (Math.abs(video.currentTime - clipTime) > 0.1) {
      video.currentTime = Math.max(0, clipTime)
    }
  }, [currentTime, activeTransition])

  useAudioClips({
    audioClips: project.audioClips,
    media: project.media,
    tracks: project.tracks,
    currentTime,
    isPlaying,
    muted,
  })

  useChromaKey(
    videoRef,
    chromaCanvasRef,
    {
      enabled: activeClip?.chromaEnabled ?? false,
      color: activeClip?.chromaColor,
      tolerance: activeClip?.chromaTolerance,
    },
    isPlaying,
  )

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

  function makeOverlayDragHandler(
    startX: number, startY: number,
    startNX: number, startNY: number,
    onMove: (nx: number, ny: number) => void,
  ) {
    function handleMove(me: MouseEvent) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dx = (me.clientX - startX) / rect.width
      const dy = (me.clientY - startY) / rect.height
      onMove(Math.max(0, Math.min(1, startNX + dx)), Math.max(0, Math.min(1, startNY + dy)))
    }
    function handleUp() {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  // Get CSS filter for active clip. The numeric adjustments come from the same
  // factors the encoder uses; clip.filter is a preset string with no export
  // equivalent yet (tech debt D7).
  const clipFilter = activeClip
    ? [
        activeClip.filter ?? '',
        buildCssFilter(colorAdjustFactors(activeClip)),
        buildEffectsCssFilter(activeClip.effects ?? []),
      ].filter(Boolean).join(' ')
    : ''

  return (
    <div ref={rootRef} className="flex flex-col h-full" style={{ background: 'var(--color-bg-base)' }}>
      {/* Preview area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        style={{ background: '#0a0a0a', containerType: 'size' }}
      >
        {/* Canvas container */}
        <div
          ref={canvasRef}
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
          {/* Background video/image — the clip at the playhead, or the outgoing
              half while a transition runs */}
          <BaseMediaLayer
            media={activeTransition ? activeTransition.mediaA : activeMedia}
            clip={activeTransition ? activeTransition.clipA : activeClip}
            currentTime={currentTime}
            filter={clipFilter}
            transitionStyle={activeTransition
              ? transitionStyles(activeTransition.transition.type, activeTransition.progress)[0]
              : {}}
            muted={muted}
            videoRef={videoRef}
            chromaCanvasRef={chromaCanvasRef}
          />

          {/* Video B — incoming clip during a transition */}
          {activeTransition && (
            <IncomingMediaLayer
              activeTransition={activeTransition}
              muted={muted}
              videoRef={videoRefB}
            />
          )}

          {/* Overlay video clips (multi-layer/PIP) */}
          <OverlayVideos
            clips={overlayClips}
            videoRefs={overlayVideoRefs}
            media={project.media}
            tracks={project.tracks}
            currentTime={currentTime}
            muted={muted}
          />

          {/* Text overlays */}
          {activeTextClips.map(t => (
            <TextOverlay
              key={t.id}
              clip={t}
              currentTime={currentTime}
              canvasH={canvasH}
              onMouseDown={e => {
                e.stopPropagation()
                setSelected({ texts: [t.id] })
                makeOverlayDragHandler(e.clientX, e.clientY, t.x, t.y,
                  (nx, ny) => updateTextClip(t.id, { x: nx, y: ny }))
              }}
            />
          ))}

          {/* Sticker overlays */}
          {activeStickerClips.map(s => (
            <StickerOverlay
              key={s.id}
              clip={s}
              currentTime={currentTime}
              onMouseDown={e => {
                e.stopPropagation()
                setSelected({ stickers: [s.id] })
                makeOverlayDragHandler(e.clientX, e.clientY, s.x, s.y,
                  (nx, ny) => updateStickerClip(s.id, { x: nx, y: ny }))
              }}
            />
          ))}

          {/* Caption overlays */}
          {project.captions
            .filter(c => currentTime >= c.startTime && currentTime <= c.endTime)
            .map(c => <CaptionOverlay key={c.id} caption={c} canvasH={canvasH} />)}

          {/* CSS-only effects: vignette, grain, letterbox */}
          {activeClip && <EffectOverlays effects={activeClip.effects ?? []} />}

          <GuideOverlays showGrid={showGrid} showSafeZone={showSafeZone} />

          {/* Placeholder when no media */}
          {!activeMedia && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ color: 'rgba(255,255,255,0.15)' }}>
              <Play size={48} />
              <p className="text-sm">Add media to start editing</p>
            </div>
          )}
        </div>

        <PreviewZoomControls
          onZoomIn={() => setPreviewScale(s => Math.min(2, s + 0.1))}
          onZoomOut={() => setPreviewScale(s => Math.max(0.2, s - 0.1))}
          onResetZoom={() => setPreviewScale(1)}
        />

        <PreviewGuideToggles
          showGrid={showGrid}
          showSafeZone={showSafeZone}
          onToggleGrid={() => setShowGrid(v => !v)}
          onToggleSafeZone={() => setShowSafeZone(v => !v)}
        />
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
        isFullscreen={isFullscreen}
        onSeek={handleSeek}
        onPlayPause={handlePlayPause}
        onSetCurrentTime={setCurrentTime}
        onSetPlaybackSpeed={setPlaybackSpeed}
        onToggleMuted={() => setMuted(m => !m)}
        onVolume={v => { setVolume(v); if (videoRef.current) videoRef.current.volume = v }}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
