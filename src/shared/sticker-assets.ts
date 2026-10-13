// Sticker assets are original vectors bundled with the app (src/assets/stickers).
// They replaced emoji strings because the renderer's canvas cannot rasterize
// color emoji fonts (design doc F4), while SVG shapes draw without issue.
// This module stays free of asset bytes so the main process can import it.

export const STICKER_BASE_RATIO = 0.25 // base sticker height as a fraction of canvas height

export interface StickerAsset {
  id: string
  label: string
}

export const STICKER_ASSETS: StickerAsset[] = [
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'smiley', label: 'Smiley' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'fire', label: 'Fire' },
  { id: 'check', label: 'Check' },
  { id: 'cross', label: 'Cross' },
  { id: 'arrow-up', label: 'Arrow Up' },
  { id: 'speech', label: 'Speech Bubble' },
  { id: 'music', label: 'Music' },
  { id: 'crown', label: 'Crown' },
  { id: 'sun', label: 'Sun' },
]

export function isKnownSticker(src: string): boolean {
  return STICKER_ASSETS.some(a => a.id === src)
}

export function stickerLabel(src: string): string {
  return STICKER_ASSETS.find(a => a.id === src)?.label ?? src
}
