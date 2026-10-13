import { useRef, useEffect, useState } from 'react'
import { Play, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { PreviewControls } from './PreviewControls'
import { STICKER_BASE_RATIO } from '../shared/sticker-assets'
import { stickerDataUrl } from '../shared/sticker-svgs'
import { buildCssFilter, colorAdjustFactors } from '../shared/color-adjust'
import { buildEffectsCssFilter } from '../shared/effects'
import { clipAnimCss } from '../shared/text-animation'
import { interpolate } from '../shared/keyframe-interpolate'
import { textTransformAt, transformAt } from '../shared/scene'

export function PreviewPanel() {
  const {
    project, currentTime, isPlaying, playbackSpeed,
    setCurrentTime, setIsPlaying, setPlaybackSpeed,
    updateTextClip, updateStickerClip, setSelected,
  } = useEditorStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoRefB = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null)
  const chromaOffscreenRef = useRef<HTMLCanvasElement | null>(null)
  const chromaRafRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const audioElemsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
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

  // Video refs for overlays (up to 3 extra tracks)
  const overlayVideoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]

  // Active transition detection
  const activeTransitionData = (() => {
    for (const tr of project.transitions) {
      const clipA = project.clips.find(c => c.id === tr.clipId)
      if (!clipA) continue
      const boundary = clipA.startTime + clipA.duration
      const trStart = boundary - tr.duration / 2
      const trEnd = boundary + tr.duration / 2
      if (currentTime < trStart || currentTime > trEnd) continue
      const trackClips = project.clips
        .filter(c => c.trackId === clipA.trackId)
        .sort((a, b) => a.startTime - b.startTime)
      const aIdx = trackClips.findIndex(c => c.id === clipA.id)
      const clipB = aIdx >= 0 ? trackClips[aIdx + 1] : undefined
      if (!clipB) continue
      const mediaA = project.media.find(m => m.id === clipA.mediaId)
      const mediaB = project.media.find(m => m.id === clipB.mediaId)
      const progress = Math.min(1, Math.max(0, (currentTime - trStart) / tr.duration))
      return { tr, clipA, clipB, mediaA, mediaB, progress }
    }
    return null
  })()
  const activeTextClips = project.textClips.filter(t =>
    t.startTime <= currentTime && t.startTime + t.duration > currentTime
  )
  const activeStickerClips = project.stickerClips.filter(s =>
    s.startTime <= currentTime && s.startTime + s.duration > currentTime
  )

  function clipTransform(clip: typeof activeClip, t: number) {
    if (!clip) return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
    return transformAt(clip.keyframes ?? [], {
      x: clip.x, y: clip.y,
      scaleX: clip.scaleX, scaleY: clip.scaleY,
      rotation: clip.rotation, opacity: clip.opacity,
    }, t)
  }

  // CSS styles for transition effects
  function transitionStyles(type: string, progress: number): [React.CSSProperties, React.CSSProperties] {
    switch (type) {
      case 'fade':
      case 'dissolve':
        return [{ opacity: 1 - progress }, { opacity: progress }]
      case 'wipe-left':
        return [
          { clipPath: `inset(0 ${progress * 100}% 0 0)` },
          { clipPath: `inset(0 0 0 ${(1 - progress) * 100}%)` },
        ]
      case 'wipe-right':
        return [
          { clipPath: `inset(0 0 0 ${progress * 100}%)` },
          { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` },
        ]
      case 'wipe-up':
        return [
          { clipPath: `inset(${progress * 100}% 0 0 0)` },
          { clipPath: `inset(0 0 ${(1 - progress) * 100}% 0)` },
        ]
      case 'wipe-down':
        return [
          { clipPath: `inset(0 0 ${progress * 100}% 0)` },
          { clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` },
        ]
      case 'slide-left':
        return [
          { transform: `translateX(${-progress * 100}%)` },
          { transform: `translateX(${(1 - progress) * 100}%)` },
        ]
      case 'slide-right':
        return [
          { transform: `translateX(${progress * 100}%)` },
          { transform: `translateX(${-(1 - progress) * 100}%)` },
        ]
      case 'zoom-in':
        return [
          { transform: `scale(${1 + progress * 0.5})`, opacity: 1 - progress },
          { opacity: progress },
        ]
      case 'zoom-out':
        return [
          { opacity: 1 - progress },
          { transform: `scale(${2 - progress})`, opacity: progress },
        ]
      case 'blur':
        return [
          { filter: `blur(${progress * 16}px)`, opacity: 1 - progress * 0.5 },
          { filter: `blur(${(1 - progress) * 16}px)`, opacity: progress },
        ]
      case 'flash':
        return [
          { opacity: progress < 0.5 ? 1 - progress * 2 : 0 },
          { opacity: progress > 0.5 ? (progress - 0.5) * 2 : 0 },
        ]
      default:
        return [{ opacity: 1 - progress }, { opacity: progress }]
    }
  }

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
  }, [currentTime, isPlaying, overlayClips, project.media])

  // Sync video B during transitions
  useEffect(() => {
    const video = videoRefB.current
    if (!video || !activeTransitionData) return
    const { clipB } = activeTransitionData
    const clipTime = currentTime - clipB.startTime + clipB.mediaStart
    if (Math.abs(video.currentTime - clipTime) > 0.1) {
      video.currentTime = Math.max(0, clipTime)
    }
  }, [currentTime, activeTransitionData])

  // Manage audio clip elements — create/destroy as clips enter/leave
  useEffect(() => {
    const map = audioElemsRef.current
    const activeIds = new Set(project.audioClips.map(c => c.id))

    // Remove elements for clips that no longer exist
    for (const [id, el] of map) {
      if (!activeIds.has(id)) { el.pause(); el.src = ''; map.delete(id) }
    }

    // Create elements for new clips
    for (const clip of project.audioClips) {
      if (!map.has(clip.id)) {
        const media = project.media.find(m => m.id === clip.mediaId)
        if (!media) continue
        const el = new Audio()
        el.src = `media://${media.path}`
        el.preload = 'auto'
        map.set(clip.id, el)
      }
    }
  }, [project.audioClips, project.media])

  // Sync audio clips volume, muted, and position
  useEffect(() => {
    const map = audioElemsRef.current
    for (const clip of project.audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const track = project.tracks.find(t => t.id === clip.trackId)
      const trackMuted = track?.muted ?? false
      const kfs = clip.keyframes ?? []
      const interpVol = interpolate(kfs, 'volume', currentTime, clip.volume)
      el.volume = Math.max(0, Math.min(1, interpVol * (muted ? 0 : 1)))
      el.muted = clip.muted || trackMuted || muted
      el.playbackRate = clip.speed
    }
  }, [currentTime, project.audioClips, project.tracks, muted])

  // Sync audio on seek
  useEffect(() => {
    const map = audioElemsRef.current
    for (const clip of project.audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const inRange = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
      if (inRange) {
        const clipTime = currentTime - clip.startTime + clip.mediaStart
        if (Math.abs(el.currentTime - clipTime) > 0.15) el.currentTime = clipTime
      }
    }
  }, [currentTime, project.audioClips])

  // Play/pause audio clips
  useEffect(() => {
    const map = audioElemsRef.current
    for (const clip of project.audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const inRange = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
      if (isPlaying && inRange) {
        el.play().catch(() => {})
      } else {
        el.pause()
      }
    }
  }, [isPlaying, currentTime, project.audioClips])

  // Chroma key preview — draw video frames to canvas with color removal
  useEffect(() => {
    const video = videoRef.current
    const canvas = chromaCanvasRef.current
    cancelAnimationFrame(chromaRafRef.current)
    if (!activeClip?.chromaEnabled || !video || !canvas) return

    const hexColor = activeClip.chromaColor ?? '#00ff00'
    const tol = activeClip.chromaTolerance ?? 0.3
    const h = hexColor.replace('#', '')
    const tr = parseInt(h.slice(0, 2), 16)
    const tg = parseInt(h.slice(2, 4), 16)
    const tb = parseInt(h.slice(4, 6), 16)
    const maxDist = tol * 441

    if (!chromaOffscreenRef.current) {
      chromaOffscreenRef.current = document.createElement('canvas')
    }
    const offscreen = chromaOffscreenRef.current

    function drawFrame() {
      if (!video || !canvas) return
      const vw = video.videoWidth || 640
      const vh = video.videoHeight || 360
      const scale = Math.min(1, 640 / Math.max(vw, 1))
      const pw = Math.round(vw * scale)
      const ph = Math.round(vh * scale)
      if (offscreen.width !== pw || offscreen.height !== ph) {
        offscreen.width = pw; offscreen.height = ph
      }
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph
      }
      const octx = offscreen.getContext('2d')!
      octx.drawImage(video, 0, 0, pw, ph)
      const imgData = octx.getImageData(0, 0, pw, ph)
      const d = imgData.data
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb
        const dist = Math.sqrt(dr * dr + dg * dg + db * db)
        if (dist < maxDist) {
          d[i + 3] = Math.round((dist / maxDist) * 255)
        }
      }
      const outCtx = canvas.getContext('2d')!
      outCtx.clearRect(0, 0, pw, ph)
      outCtx.putImageData(imgData, 0, 0)
      chromaRafRef.current = requestAnimationFrame(drawFrame)
    }

    chromaRafRef.current = requestAnimationFrame(drawFrame)
    return () => cancelAnimationFrame(chromaRafRef.current)
  }, [activeClip?.chromaEnabled, activeClip?.chromaColor, activeClip?.chromaTolerance, isPlaying])

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
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-base)' }}>
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
          {/* Background video/image — Video A (current or outgoing) */}
          {(() => {
            const trData = activeTransitionData
            const [styleA] = trData
              ? transitionStyles(trData.tr.type, trData.progress)
              : [{}]
            const displayMedia = trData ? trData.mediaA : activeMedia
            const displayClip = trData ? trData.clipA : activeClip
            const tf = clipTransform(displayClip, currentTime)
            const combinedStyle: React.CSSProperties = {
              objectFit: 'contain',
              filter: clipFilter,
              opacity: tf.opacity,
              transform: `translate(${tf.x * 100}%, ${tf.y * 100}%) scale(${tf.scaleX}, ${tf.scaleY}) rotate(${tf.rotation}deg)`,
              ...styleA,
            }
            if (displayMedia?.type === 'video') {
              const chromaOn = displayClip?.chromaEnabled ?? false
              return (
                <>
                  <video
                    ref={videoRef}
                    src={`media://${displayMedia.path}`}
                    className="absolute inset-0 w-full h-full"
                    style={{ ...combinedStyle, opacity: chromaOn ? 0 : (combinedStyle.opacity ?? 1) }}
                    muted={muted}
                    playsInline
                  />
                  {chromaOn && (
                    <canvas
                      ref={chromaCanvasRef}
                      className="absolute inset-0 w-full h-full"
                      style={{
                        filter: clipFilter || undefined,
                        opacity: tf.opacity,
                        transform: combinedStyle.transform,
                        objectFit: 'contain',
                      }}
                    />
                  )}
                </>
              )
            }
            if (displayMedia?.type === 'image') return (
              <img
                src={`media://${displayMedia.path}`}
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'contain', filter: clipFilter, opacity: displayClip?.opacity ?? 1, ...styleA }}
                alt=""
              />
            )
            return null
          })()}

          {/* Video B — incoming clip during transition */}
          {activeTransitionData && (() => {
            const { tr, clipB, mediaB, progress } = activeTransitionData
            const [, styleB] = transitionStyles(tr.type, progress)
            const combinedStyle: React.CSSProperties = {
              objectFit: 'contain',
              opacity: clipB.opacity,
              transform: `translate(${clipB.x * 100}%, ${clipB.y * 100}%) scale(${clipB.scaleX}, ${clipB.scaleY}) rotate(${clipB.rotation}deg)`,
              ...styleB,
            }
            if (mediaB?.type === 'video') return (
              <video
                ref={videoRefB}
                key={mediaB.id}
                src={`media://${mediaB.path}`}
                className="absolute inset-0 w-full h-full"
                style={combinedStyle}
                muted={muted}
                playsInline
              />
            )
            if (mediaB?.type === 'image') return (
              <img
                src={`media://${mediaB.path}`}
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'contain', ...styleB }}
                alt=""
              />
            )
            return null
          })()}

          {/* Overlay video clips (multi-layer/PIP) */}
          {overlayClips.map((clip, i) => {
            const media = project.media.find(m => m.id === clip.mediaId)
            if (!media || media.type !== 'video') return null
            const tf = clipTransform(clip, currentTime)
            const track = project.tracks.find(t => t.id === clip.trackId)
            if (track?.muted) return null
            return (
              <video
                key={clip.id}
                ref={overlayVideoRefs[i]}
                src={`media://${media.path}`}
                className="absolute"
                style={{
                  left: `${tf.x * 100}%`,
                  top: `${tf.y * 100}%`,
                  width: `${tf.scaleX * 40}%`,
                  height: 'auto',
                  aspectRatio: '16/9',
                  transform: `translate(-50%, -50%) rotate(${tf.rotation}deg)`,
                  opacity: tf.opacity,
                  objectFit: 'contain',
                  zIndex: i + 2,
                  border: '2px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                }}
                muted={muted}
                playsInline
              />
            )
          })}

          {/* Text overlays */}
          {activeTextClips.map(t => {
            const elapsed = currentTime - t.startTime
            const remaining = t.startTime + t.duration - currentTime
            const anim = clipAnimCss(t.animation, t.outAnimation, elapsed, remaining)
            const tf = textTransformAt(t, currentTime)
            const baseTransform = `translate(-50%, -50%) rotate(${tf.rotation}deg) scale(${tf.scaleX}, ${tf.scaleY})`
            return (
              <div
                key={t.id}
                className="absolute"
                style={{
                  left: `${tf.x * 100}%`,
                  top: `${tf.y * 100}%`,
                  transform: anim.extraTransform
                    ? `${baseTransform} ${anim.extraTransform}`
                    : baseTransform,
                  opacity: anim.opacity,
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
                onMouseDown={e => {
                  e.stopPropagation()
                  setSelected({ texts: [t.id] })
                  makeOverlayDragHandler(e.clientX, e.clientY, t.x, t.y,
                    (nx, ny) => updateTextClip(t.id, { x: nx, y: ny }))
                }}
              >
                {t.text}
              </div>
            )
          })}

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
                onMouseDown={e => {
                  e.stopPropagation()
                  setSelected({ stickers: [s.id] })
                  makeOverlayDragHandler(e.clientX, e.clientY, s.x, s.y,
                    (nx, ny) => updateStickerClip(s.id, { x: nx, y: ny }))
                }}
              />
            )
          })}

          {/* Caption overlays */}
          {project.captions
            .filter(c => currentTime >= c.startTime && currentTime <= c.endTime)
            .map(c => (
              <div
                key={c.id}
                className="absolute pointer-events-none"
                style={{
                  bottom: '8%',
                  left: '10%',
                  right: '10%',
                  textAlign: 'center',
                  fontSize: `${(32 / canvasH) * 100}cqh`,
                  color: '#ffffff',
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 'bold',
                  textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
                  WebkitTextStroke: '1px rgba(0,0,0,0.6)',
                  userSelect: 'none',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.3,
                }}
              >
                {c.text}
              </div>
            ))
          }

          {/* CSS-only effects: vignette, grain */}
          {activeClip && (activeClip.effects ?? []).map(e => {
            if (e.id === 'vignette') return (
              <div
                key="vignette"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at center, transparent ${30 + (1 - e.intensity) * 40}%, rgba(0,0,0,${e.intensity * 0.85}) 100%)`,
                }}
              />
            )
            if (e.id === 'grain') return (
              <div
                key="grain"
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  opacity: e.intensity * 0.3,
                  mixBlendMode: 'overlay',
                }}
              />
            )
            if (e.id === 'letterbox') return (
              <>
                <div key="lb-top" className="absolute pointer-events-none" style={{ top: 0, left: 0, right: 0, height: `${e.intensity * 12}%`, background: 'black' }} />
                <div key="lb-bot" className="absolute pointer-events-none" style={{ bottom: 0, left: 0, right: 0, height: `${e.intensity * 12}%`, background: 'black' }} />
              </>
            )
            return null
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
