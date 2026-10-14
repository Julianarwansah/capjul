import { useEffect, useRef, type RefObject } from 'react'

export interface ChromaKeySettings {
  enabled: boolean
  color?: string
  tolerance?: number
}

// 441 is the largest distance between two RGB triples, ~sqrt(3 * 255^2). The
// tolerance is a fraction of it, so a pixel is keyed once its distance to the
// target colour falls inside that fraction.
const MAX_RGB_DISTANCE = 441
const DEFAULT_CHROMA_COLOR = '#00ff00'
const DEFAULT_CHROMA_TOLERANCE = 0.3
// Keying runs per pixel, so the source frame is downscaled to at most this wide
// before the loop. Preview-only; the export path keys at full resolution.
const MAX_PROCESSING_WIDTH = 640

/**
 * Chroma-key preview: reads each video frame, drops the alpha of pixels close to
 * the keyed colour, and paints the result to a canvas laid over the (hidden)
 * video element. Runs on a requestAnimationFrame loop for as long as it is
 * enabled.
 */
export function useChromaKey(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  settings: ChromaKeySettings,
  isPlaying: boolean,
) {
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  // Destructured so the effect re-runs on a setting change rather than on every
  // new clip object identity.
  const { enabled, color, tolerance } = settings

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    cancelAnimationFrame(rafRef.current)
    if (!enabled || !video || !canvas) return

    const hex = (color ?? DEFAULT_CHROMA_COLOR).replace('#', '')
    const targetR = parseInt(hex.slice(0, 2), 16)
    const targetG = parseInt(hex.slice(2, 4), 16)
    const targetB = parseInt(hex.slice(4, 6), 16)
    const maxDist = (tolerance ?? DEFAULT_CHROMA_TOLERANCE) * MAX_RGB_DISTANCE

    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas')
    const offscreen = offscreenRef.current

    function drawFrame() {
      if (!video || !canvas) return
      const vw = video.videoWidth || 640
      const vh = video.videoHeight || 360
      const scale = Math.min(1, MAX_PROCESSING_WIDTH / Math.max(vw, 1))
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
        const dr = d[i] - targetR, dg = d[i + 1] - targetG, db = d[i + 2] - targetB
        const dist = Math.sqrt(dr * dr + dg * dg + db * db)
        // Fade alpha with distance rather than cutting it, so the edge of the
        // keyed region does not alias.
        if (dist < maxDist) d[i + 3] = Math.round((dist / maxDist) * 255)
      }
      const outCtx = canvas.getContext('2d')!
      outCtx.clearRect(0, 0, pw, ph)
      outCtx.putImageData(imgData, 0, 0)
      rafRef.current = requestAnimationFrame(drawFrame)
    }

    rafRef.current = requestAnimationFrame(drawFrame)
    return () => cancelAnimationFrame(rafRef.current)
    // isPlaying is not read above; it is a dependency so the loop restarts when
    // playback toggles, matching the behaviour before this was extracted.
  }, [enabled, color, tolerance, isPlaying, videoRef, canvasRef])
}
