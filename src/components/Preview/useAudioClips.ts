import { useEffect, useRef } from 'react'
import { interpolate } from '../../shared/keyframe-interpolate'
import type { AudioClip, MediaFile, Track } from '../../types'

export interface AudioClipsPlayback {
  audioClips: AudioClip[]
  media: MediaFile[]
  tracks: Track[]
  currentTime: number
  isPlaying: boolean
  /** Master mute from the transport controls; clip and track mute are separate. */
  muted: boolean
}

/**
 * Owns one HTMLAudioElement per audio clip and keeps it in step with the
 * timeline. Elements are created and discarded as clips come and go, then
 * volume (keyframed), mute, rate and position are re-synced on every change.
 *
 * The elements live in a ref rather than state because nothing renders from
 * them; putting them in state would re-render the whole preview on every seek.
 */
export function useAudioClips({
  audioClips, media, tracks, currentTime, isPlaying, muted,
}: AudioClipsPlayback) {
  const elemsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Create and destroy elements as clips enter and leave the project.
  useEffect(() => {
    const map = elemsRef.current
    const activeIds = new Set(audioClips.map(c => c.id))

    for (const [id, el] of map) {
      if (!activeIds.has(id)) { el.pause(); el.src = ''; map.delete(id) }
    }

    for (const clip of audioClips) {
      if (map.has(clip.id)) continue
      const file = media.find(m => m.id === clip.mediaId)
      if (!file) continue
      const el = new Audio()
      el.src = `media://${file.path}`
      el.preload = 'auto'
      map.set(clip.id, el)
    }
  }, [audioClips, media])

  // Volume, mute and rate. Volume is keyframed, resolved at the same timeline
  // instant the export expression uses.
  useEffect(() => {
    const map = elemsRef.current
    for (const clip of audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const trackMuted = tracks.find(t => t.id === clip.trackId)?.muted ?? false
      const interpVol = interpolate(clip.keyframes ?? [], 'volume', currentTime, clip.volume)
      el.volume = Math.max(0, Math.min(1, interpVol * (muted ? 0 : 1)))
      el.muted = clip.muted || trackMuted || muted
      el.playbackRate = clip.speed
    }
  }, [currentTime, audioClips, tracks, muted])

  // Re-seek after a jump. The 0.15s slack avoids fighting the element's own
  // playback position on every frame.
  useEffect(() => {
    const map = elemsRef.current
    for (const clip of audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const inRange = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
      if (!inRange) continue
      const clipTime = currentTime - clip.startTime + clip.mediaStart
      if (Math.abs(el.currentTime - clipTime) > 0.15) el.currentTime = clipTime
    }
  }, [currentTime, audioClips])

  useEffect(() => {
    const map = elemsRef.current
    for (const clip of audioClips) {
      const el = map.get(clip.id)
      if (!el) continue
      const inRange = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
      if (isPlaying && inRange) el.play().catch(() => {})
      else el.pause()
    }
  }, [isPlaying, currentTime, audioClips])
}
