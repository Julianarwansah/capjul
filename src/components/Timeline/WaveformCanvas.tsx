import { useEffect, useRef } from 'react'

/**
 * Draws one waveform centred in its box.
 *
 * The canvas is sized at the display's pixel ratio and the context scaled to
 * match, so the bars stay crisp instead of blurring across scaled pixels.
 */
export function WaveformCanvas({ waveform, width, height }: { waveform: Float32Array; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || width <= 0 || height <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const barW = width / waveform.length
    ctx.fillStyle = 'rgba(74,222,128,0.7)'
    for (let i = 0; i < waveform.length; i++) {
      const barH = Math.max(1, waveform[i] * height * 0.9)
      ctx.fillRect(i * barW, (height - barH) / 2, Math.max(1, barW - 0.5), barH)
    }
  }, [waveform, width, height])

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
