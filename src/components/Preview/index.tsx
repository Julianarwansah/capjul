import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { PreviewControls } from './PreviewControls'
import { PreviewGuideToggles, PreviewZoomControls } from './Toolbar'
import {
  CaptionOverlay, EffectOverlays, GuideOverlays, StickerOverlay, TextOverlay,
} from './Overlays'
import { findActiveTransition } from '../../shared/transitions'
import { transitionPose as poseAt } from '../../shared/transition-pose'
import { activePaintAt, type PaintItem } from '../../shared/paint-order'
import { clipMediaTimeAt } from '../../shared/scene'
import { nextPlaybackTime, type LoopWindow } from '../../shared/playback-loop'
import { mediaLayerFilter } from '../../shared/layer-filter'
import { trackMuted } from '../../shared/track-audio'
import { IncomingMediaLayer, MediaLayer } from './MediaLayers'
import { useAudioClips } from './useAudioClips'
import { useChromaKey } from './useChromaKey'
import type { Clip } from '../../types'

type ClipPaintItem = Extract<PaintItem, { kind: 'clip' }>

// The CSS filter a media layer draws with. Both engines compose it through
// mediaLayerFilter, so the string the preview shows is the string the compositor
// draws - including the clip effects, which used to stop at the preview (D23).
function layerFilter(clip: Clip | null): string {
  return clip ? mediaLayerFilter(clip) : ''
}

export function PreviewPanel() {
  const {
    project, currentTime, isPlaying, playbackSpeed,
    setCurrentTime, setIsPlaying, setPlaybackSpeed,
    updateTextClip, updateStickerClip, setSelected,
    loopIn, loopOut, loopEnabled, setLoopIn, setLoopOut, setLoopEnabled, clearLoop,
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
  const loopRef = useRef<LoopWindow>({ in: loopIn, out: loopOut, enabled: loopEnabled })
  useEffect(() => {
    loopRef.current = { in: loopIn, out: loopOut, enabled: loopEnabled }
  }, [loopIn, loopOut, loopEnabled])
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

  // Everything on screen at the playhead, in paint order. This list is shared
  // with the export compositor: `compileScene` maps the same `paintOrder()` onto
  // canvas layers, and the JSX below maps it onto DOM elements in the same order.
  // Deriving it here instead was how the two came to disagree about which clips
  // are visible and which covers which (tech debt D16).
  const paint = useMemo(() => activePaintAt(project, currentTime), [project, currentTime])

  // The bottom-most media clip is the base layer: the one that can carry a
  // transition, and the one the video sync and chroma key effects follow.
  const baseIndex = paint.findIndex(item => item.kind === 'clip')
  const basePaintItem = baseIndex >= 0 ? paint[baseIndex] : undefined
  const baseItem = basePaintItem?.kind === 'clip' ? basePaintItem : undefined
  const activeClip = baseItem?.clip ?? null
  const activeMedia = baseItem?.media ?? null

  // Every other media layer, each needing its own video element for time sync.
  // Held in a map keyed by clip id rather than a fixed pool of refs, so the count
  // is not capped at three.
  const overlayItems = useMemo(() => {
    const items: ClipPaintItem[] = []
    for (let i = 0; i < paint.length; i++) {
      const item = paint[i]
      if (item.kind === 'clip' && i !== baseIndex) items.push(item)
    }
    return items
  }, [paint, baseIndex])

  const overlayVideos = useRef(new Map<string, HTMLVideoElement>())

  const activeTransition = findActiveTransition(project, currentTime)

  // Sync video with timeline. The seek and the playback rate both come from the
  // shared source-time formula, so a clip set to 2x advances its source at 2x
  // instead of playing at natural rate and being dragged forward by the next seek
  // correction (tech debt D22).
  //
  // The rate is the clip's own speed and deliberately not multiplied by the
  // transport's playbackSpeed: useAudioClips sets audio elements to clip.speed
  // alone, so scaling video by the transport as well would desync the two while
  // the transport is not at 1x. Transport speed still works by seek correction,
  // as it did before.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.playbackRate = activeClip.speed || 1
    const clipTime = clipMediaTimeAt(activeClip, currentTime)
    if (Math.abs(video.currentTime - clipTime) > 0.1) {
      video.currentTime = clipTime
    }
  }, [currentTime, activeClip])

  // Sync overlay video clips (multi-layer)
  useEffect(() => {
    for (const item of overlayItems) {
      const el = overlayVideos.current.get(item.clip.id)
      if (!el) continue
      el.playbackRate = item.clip.speed || 1
      const clipTime = clipMediaTimeAt(item.clip, currentTime)
      if (Math.abs(el.currentTime - clipTime) > 0.1) el.currentTime = Math.max(0, clipTime)
      if (isPlaying) el.play().catch(() => {})
      else el.pause()
    }
  }, [currentTime, isPlaying, overlayItems])

  // Sync video B during transitions
  useEffect(() => {
    const video = videoRefB.current
    if (!video || !activeTransition) return
    const { clipB } = activeTransition
    video.playbackRate = clipB.speed || 1
    const clipTime = clipMediaTimeAt(clipB, currentTime)
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
      // The wrap rule lives in shared/playback-loop.ts so it can be tested
      // without a requestAnimationFrame loop running.
      const step = nextPlaybackTime(currentTimeRef.current, dt, durationRef.current, loopRef.current)
      setCurrentTime(step.time)
      if (step.ended) { setIsPlaying(false); return }
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

  // The base layer grades the clip at the playhead. During a transition it still
  // shows the outgoing clip's grading, which is what it did before the layer list
  // was shared; the incoming clip deliberately carries none.
  const clipFilter = layerFilter(activeClip)

  // Master mute, or the clip's own track mute. A muted track is silent in the
  // preview exactly as it now is in both export engines (tech debt D24); before
  // this, only audio-track clips were silenced here and nothing was silenced on
  // export.
  const mutedFor = (clip: Clip | null) => muted || (clip ? trackMuted(project, clip.trackId) : false)

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
          {/* Every paintable layer, in paint order. DOM order is paint order: no
              layer sets a z-index of its own, so what the compositor draws last
              is what the browser paints last. The base media layer is special
              only in that it can carry a transition, the chroma key and the
              primary video ref. */}
          {paint.map((item, i) => {
            if (item.kind === 'text') {
              const t = item.clip
              return (
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
              )
            }

            if (item.kind === 'sticker') {
              const s = item.clip
              return (
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
              )
            }

            if (i === baseIndex) {
              return (
                <Fragment key={`base-${item.clip.id}`}>
                  <MediaLayer
                    clip={activeTransition ? activeTransition.clipA : activeClip}
                    media={activeTransition ? activeTransition.mediaA : activeMedia}
                    currentTime={currentTime}
                    filter={clipFilter}
                    transitionPose={activeTransition
                      ? poseAt(activeTransition.transition.type, activeTransition.progress)[0]
                      : undefined}
                    muted={mutedFor(activeTransition ? activeTransition.clipA : activeClip)}
                    videoRef={videoRef}
                    chromaCanvasRef={chromaCanvasRef}
                  />
                  {/* The incoming clip of a transition, painted straight above the
                      outgoing one and below everything else. */}
                  {activeTransition && (
                    <IncomingMediaLayer
                      key={activeTransition.mediaB?.id}
                      activeTransition={activeTransition}
                      transitionPose={poseAt(activeTransition.transition.type, activeTransition.progress)[1]}
                      currentTime={currentTime}
                      muted={mutedFor(activeTransition.clipB)}
                      videoRef={videoRefB}
                    />
                  )}
                </Fragment>
              )
            }

            return (
              <MediaLayer
                key={item.clip.id}
                clip={item.clip}
                media={item.media}
                currentTime={currentTime}
                filter={layerFilter(item.clip)}
                muted={mutedFor(item.clip)}
                videoRef={el => {
                  if (!el) return
                  overlayVideos.current.set(item.clip.id, el)
                  return () => { overlayVideos.current.delete(item.clip.id) }
                }}
              />
            )
          })}

          {/* Caption overlays */}
          {project.captions
            .filter(c => currentTime >= c.startTime && currentTime <= c.endTime)
            .map(c => <CaptionOverlay key={c.id} caption={c} canvasW={canvasW} canvasH={canvasH} />)}

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
        loopIn={loopIn}
        loopOut={loopOut}
        loopEnabled={loopEnabled}
        onSetLoopIn={() => setLoopIn(currentTime)}
        onSetLoopOut={() => setLoopOut(currentTime)}
        onToggleLoop={() => setLoopEnabled(!loopEnabled)}
        onClearLoop={clearLoop}
      />
    </div>
  )
}
