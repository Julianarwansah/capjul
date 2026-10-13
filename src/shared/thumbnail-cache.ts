const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

export function getThumbnail(filePath: string): string | null {
  return cache.get(filePath) ?? null
}

export function loadThumbnail(filePath: string, seekTime = 0.5): Promise<string | null> {
  const key = `${filePath}@${Math.round(seekTime * 10) / 10}`
  if (cache.has(key)) return Promise.resolve(cache.get(key)!)
  if (pending.has(key)) return pending.get(key)!

  const p = new Promise<string | null>(resolve => {
    const video = document.createElement('video')
    video.src = `media://${filePath}`
    video.muted = true
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'

    function capture() {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 90
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(video, 0, 0, 160, 90)
        const url = canvas.toDataURL('image/jpeg', 0.6)
        cache.set(key, url)
        pending.delete(key)
        resolve(url)
      } catch {
        resolve(null)
      }
    }

    video.addEventListener('seeked', capture, { once: true })
    video.addEventListener('error', () => { pending.delete(key); resolve(null) }, { once: true })
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(seekTime, video.duration * 0.1)
    }, { once: true })
  })

  pending.set(key, p)
  return p
}
