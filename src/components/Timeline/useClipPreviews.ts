import { useEffect, useState } from 'react'
import { loadWaveform } from '../../shared/waveform-cache'
import { getThumbnail, loadThumbnail } from '../../shared/thumbnail-cache'

// Asynchronous media previews for timeline clips. Kept out of ClipItems.tsx so
// the clip components stay markup, and in a hooks-only file because mixing a
// component export in would break React Fast Refresh.

/** A thumbnail for `filePath`, served from the cache when it is already there.
 *  Returns null until one loads, and never rejects into the caller: a missing or
 *  undecodable file should cost a thumbnail, not the clip. */
export function useThumbnail(filePath: string | undefined, seekTime = 0.5): string | null {
  const [url, setUrl] = useState<string | null>(() => filePath ? getThumbnail(filePath) : null)
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    loadThumbnail(filePath, seekTime).then(u => { if (!cancelled) setUrl(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [filePath, seekTime])
  return url
}

/** Peak samples for `filePath`, or null until they load. */
export function useWaveform(filePath: string | undefined): Float32Array | null {
  const [data, setData] = useState<Float32Array | null>(null)
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    loadWaveform(filePath).then(w => { if (!cancelled) setData(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [filePath])
  return data
}
