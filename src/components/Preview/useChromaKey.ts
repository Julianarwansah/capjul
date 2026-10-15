import { useEffect, useRef, type RefObject } from 'react'
import {
  DEFAULT_CHROMA_COLOR, DEFAULT_CHROMA_TOLERANCE, applyChromaKey, parseChromaColor,
} from '../../shared/chroma-key'

export interface ChromaKeySettings {
  enabled: boolean
  color?: string
  tolerance?: number
}

// Keying runs per pixel, so the preview downscales the source frame to at most
// this wide before the loop. The export keys at full resolution instead; the two
// agree on which pixels survive and differ only in how finely the soft edge is
// sampled, which is a deliberate preview performance trade.
const MAX_PROCESSING_WIDTH = 640

/**
 * Chroma-key preview: reads each video frame, drops the alpha of pixels close to
 * the keyed colour, and paints the result to a canvas laid over the (hidden)
 * video element. Runs on a requestAnimationFrame loop for as long as it is
 * enabled. The pixel math is shared with the export compositor.
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

    const target = parseChromaColor(color ?? DEFAULT_CHROMA_COLOR)
    const keyTolerance = tolerance ?? DEFAULT_CHROMA_TOLERANCE

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
      applyChromaKey(imgData.data, target, keyTolerance)
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
