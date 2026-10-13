import type { Track } from '../../types'

export const TRACK_COLORS: Record<Track['type'], string> = {
  video: 'var(--color-track-video)',
  audio: 'var(--color-track-audio)',
  text: 'var(--color-track-text)',
  sticker: 'var(--color-track-sticker)',
  fx: '#f472b6',
}
