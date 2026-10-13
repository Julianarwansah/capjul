// Loads and caches audio waveform data for a given file path.
// Fetches via the media:// Electron protocol; fails gracefully in plain browser.

const cache = new Map<string, Float32Array>()
const inFlight = new Map<string, Promise<Float32Array>>()

export async function loadWaveform(filePath: string, bars = 200): Promise<Float32Array> {
  const key = `${filePath}:${bars}`
  const hit = cache.get(key)
  if (hit) return hit
  const inflight = inFlight.get(key)
  if (inflight) return inflight

  const promise = (async (): Promise<Float32Array> => {
    const response = await fetch(`media://${filePath}`)
    if (!response.ok) throw new Error('fetch failed')

    const arrayBuffer = await response.arrayBuffer()
    const audioCtx = new AudioContext()
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    } finally {
      audioCtx.close()
    }

    const channel = audioBuffer.getChannelData(0)
    const blockSize = Math.max(1, Math.floor(channel.length / bars))
    const waveform = new Float32Array(bars)

    for (let i = 0; i < bars; i++) {
      const start = i * blockSize
      let peak = 0
      for (let j = 0; j < blockSize; j++) {
        const abs = Math.abs(channel[start + j] ?? 0)
        if (abs > peak) peak = abs
      }
      waveform[i] = peak
    }

    let max = 0
    for (let i = 0; i < waveform.length; i++) {
      if (waveform[i] > max) max = waveform[i]
    }
    if (max > 0) {
      for (let i = 0; i < waveform.length; i++) waveform[i] /= max
    }

    cache.set(key, waveform)
    inFlight.delete(key)
    return waveform
  })()

  inFlight.set(key, promise)
  promise.catch(() => inFlight.delete(key))
  return promise
}
