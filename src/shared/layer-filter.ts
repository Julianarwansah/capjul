import { buildCssFilter, colorAdjustFactors } from './color-adjust'
import { buildEffectsCssFilter } from './effects'
import type { Clip } from './project-schema'

/**
 * The CSS filter string a media layer draws with, composed in the order both
 * engines apply it: the preset, then the numeric grading factors, then the clip
 * effects.
 *
 * One function for both sides. The preview used to build this inline and the
 * compositor built a shorter version without the effects, so nine of the twelve
 * effects were visible while editing and absent from the export (tech debt D23).
 * `ctx.filter` accepts the same function list CSS does, so carrying the effects
 * through the layer is all the compositor needed.
 *
 * The three overlay effects - vignette, grain, letterbox - contribute nothing
 * here because they are not filters; they remain preview-only DOM, and D23
 * records what it would take to draw them on a canvas.
 */
export function mediaLayerFilter(clip: Clip): string {
  return [
    clip.filter ?? '',
    buildCssFilter(colorAdjustFactors(clip)),
    buildEffectsCssFilter(clip.effects ?? []),
  ].filter(Boolean).join(' ')
}
