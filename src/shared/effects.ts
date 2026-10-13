export interface EffectDef {
  id: string
  name: string
  css: (intensity: number) => string
}

export const EFFECTS: EffectDef[] = [
  { id: 'blur', name: 'Blur', css: i => `blur(${i * 10}px)` },
  { id: 'glow', name: 'Glow', css: i => `brightness(${1 + i * 0.3}) drop-shadow(0 0 ${i * 12}px rgba(255,255,200,0.8))` },
  { id: 'sharpen', name: 'Sharpen', css: i => `contrast(${1 + i * 0.3}) brightness(${1 + i * 0.05})` },
  { id: 'vignette', name: 'Vignette', css: _i => '' }, // handled separately
  { id: 'grain', name: 'Film Grain', css: _i => '' }, // CSS animation only
  { id: 'letterbox', name: 'Letterbox', css: _i => '' }, // overlay
  { id: 'chromatic', name: 'Chromatic', css: i => `drop-shadow(${i * 3}px 0 0 rgba(255,0,0,0.5)) drop-shadow(${-i * 3}px 0 0 rgba(0,0,255,0.5))` },
  { id: 'noir', name: 'Noir', css: i => `grayscale(${i}) contrast(${1 + i * 0.2})` },
  { id: 'warm', name: 'Warm', css: i => `sepia(${i * 0.5}) saturate(${1 + i * 0.3})` },
  { id: 'cool', name: 'Cool', css: i => `hue-rotate(${i * 20}deg) saturate(${1 + i * 0.2})` },
  { id: 'vivid', name: 'Vivid', css: i => `saturate(${1 + i * 1.5}) contrast(${1 + i * 0.1})` },
  { id: 'matte', name: 'Matte', css: i => `contrast(${1 - i * 0.1}) saturate(${1 - i * 0.2}) brightness(${1 + i * 0.05})` },
]

export function buildEffectsCssFilter(effects: { id: string; intensity: number }[]): string {
  return effects
    .map(e => {
      const def = EFFECTS.find(d => d.id === e.id)
      return def ? def.css(e.intensity) : ''
    })
    .filter(Boolean)
    .join(' ')
}
