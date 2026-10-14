// Keyframe interpolation curves, expressed twice: once as arithmetic for the
// preview and the canvas compositor, once as an ffmpeg expression for the
// filtergraph engine. Both live here, beside each other, for the same reason
// color-adjust.ts holds buildCssFilter and buildFfmpegColorChain together - so
// the two backends cannot drift apart about what a curve means.
//
// The parity test evaluates the emitted ffmpeg expression numerically and
// compares it against ease(), which is what makes the pairing checked rather
// than merely intended.
//
// This module deliberately imports nothing. The easing vocabulary lives here
// rather than in project-schema.ts so that UI code can list the curves without
// pulling zod into the renderer bundle; project-schema builds its enum from
// EASINGS, which keeps one definition of the set.

/**
 * Interpolation curve from a keyframe to the next one for the same property.
 *
 * Stored on the outgoing keyframe, so a segment's shape belongs to where it
 * starts - the convention other editors use, and the one that means adding a
 * keyframe cannot silently change the curve of the segment before it.
 */
export const EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const

export type Easing = typeof EASINGS[number]

/**
 * Normalized progress through a keyframe segment, remapped by the curve.
 *
 * `u` is 0 at the outgoing keyframe and 1 at the next one; the result stays
 * within [0, 1] and is monotonic for every curve here, so a segment never
 * overshoots or runs backwards.
 */
export function ease(easing: Easing, u: number): number {
  switch (easing) {
    case 'ease-in':
      return u * u
    case 'ease-out':
      return 1 - (1 - u) * (1 - u)
    case 'ease-in-out': {
      const inv = 2 - 2 * u
      return u < 0.5 ? 2 * u * u : 1 - (inv * inv) / 2
    }
    default:
      return u
  }
}

/**
 * The same curve as an ffmpeg expression, where `u` is itself an expression
 * string (normally `(t-a)/(b-a)`).
 *
 * Every substituted `u` is parenthesised by the caller's construction and again
 * here where it is negated or scaled, because ffmpeg's expression grammar has
 * the usual precedence and a bare `t-a/b-a` would parse wrongly. Unary minus is
 * avoided entirely - `2-2*(u)` rather than `-2*(u)+2` - so the output stays
 * inside the subset the parity evaluator understands.
 */
export function easeFfmpeg(easing: Easing, u: string): string {
  switch (easing) {
    case 'ease-in':
      return `pow(${u},2)`
    case 'ease-out':
      return `(1-pow(1-(${u}),2))`
    case 'ease-in-out':
      return `if(lt(${u},0.5),2*pow(${u},2),1-pow(2-2*(${u}),2)/2)`
    default:
      return u
  }
}
