// Renderer-only: bundles the sticker SVGs as raw strings so they can be drawn
// to a canvas via data URLs. Data URLs keep the canvas untainted, which a
// file:// image source would not in the packaged app.
import star from '../assets/stickers/star.svg?raw'
import heart from '../assets/stickers/heart.svg?raw'
import smiley from '../assets/stickers/smiley.svg?raw'
import bolt from '../assets/stickers/bolt.svg?raw'
import fire from '../assets/stickers/fire.svg?raw'
import check from '../assets/stickers/check.svg?raw'
import cross from '../assets/stickers/cross.svg?raw'
import arrowUp from '../assets/stickers/arrow-up.svg?raw'
import speech from '../assets/stickers/speech.svg?raw'
import music from '../assets/stickers/music.svg?raw'
import crown from '../assets/stickers/crown.svg?raw'
import sun from '../assets/stickers/sun.svg?raw'

const SVG_BY_ID: Record<string, string> = {
  star, heart, smiley, bolt, fire, check, cross,
  'arrow-up': arrowUp, speech, music, crown, sun,
}

export function stickerSvg(id: string): string | null {
  return SVG_BY_ID[id] ?? null
}

export function stickerDataUrl(id: string): string | null {
  const svg = stickerSvg(id)
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}
