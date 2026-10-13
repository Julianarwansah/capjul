import type { Clip } from './project-schema'

// One source of truth for clip color adjustment, consumed by both the preview
// (as a CSS filter string) and the encoder (as an ffmpeg filter chain). Parity
// holds by construction: the two sides cannot disagree about the numbers, only
// about how each backend expresses them.

export interface ColorAdjust {
  /** multiplicative, 1 = neutral — CSS brightness() semantics */
  brightness: number
  /** 1 = neutral — CSS contrast() semantics */
  contrast: number
  /** 1 = neutral — CSS saturate() semantics */
  saturation: number
}

export type ColorAdjustSource = Pick<Clip, 'brightness' | 'contrast' | 'saturation'>

const round4 = (n: number) => Math.round(n * 10000) / 10000

export function colorAdjustFactors(clip: ColorAdjustSource): ColorAdjust {
  return {
    brightness: 1 + clip.brightness / 100,
    contrast: 1 + clip.contrast / 100,
    saturation: 1 + clip.saturation / 100,
  }
}

export function buildCssFilter(f: ColorAdjust): string {
  return [
    f.brightness !== 1 ? `brightness(${round4(f.brightness)})` : '',
    f.contrast !== 1 ? `contrast(${round4(f.contrast)})` : '',
    f.saturation !== 1 ? `saturate(${round4(f.saturation)})` : '',
  ].filter(Boolean).join(' ')
}

export function buildFfmpegColorChain(f: ColorAdjust): string[] {
  const chain: string[] = []
  // CSS brightness() multiplies, while ffmpeg's eq brightness adds an offset,
  // so brightness goes through colorchannelmixer to match. eq's contrast and
  // saturation use the same mid-grey-relative model as CSS.
  if (f.brightness !== 1) {
    const b = round4(f.brightness)
    chain.push(`colorchannelmixer=rr=${b}:gg=${b}:bb=${b}`)
  }
  if (f.contrast !== 1 || f.saturation !== 1) {
    chain.push(`eq=contrast=${round4(f.contrast)}:saturation=${round4(f.saturation)}`)
  }
  return chain
}
