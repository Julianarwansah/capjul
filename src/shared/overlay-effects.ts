// Geometry and colour for the two overlay effects a canvas can draw exactly:
// letterbox bars and a vignette. The preview paints them as DOM, the compositor
// paints them after every layer; both take their numbers from here, so a
// vignette seen while editing is the vignette that exports.
//
// Grain is deliberately absent. It is animated noise with a blend mode, which a
// deterministic frame pump cannot reproduce without a seeded per-frame noise
// source; it stays preview-only and D23 says so.

/** Letterbox bar height as a fraction of canvas height, per edge. */
export function letterboxFraction(intensity: number): number {
  return intensity * 0.12
}

/**
 * The vignette's gradient stops: where the transparent centre ends, as a
 * fraction of the gradient radius, and the colour at the rim as an rgba string.
 */
export function vignetteStops(intensity: number): { inner: number; rim: string } {
  return { inner: (30 + (1 - intensity) * 40) / 100, rim: `rgba(0,0,0,${round3(intensity * 0.85)})` }
}

/**
 * The vignette ellipse's radii as fractions of canvas width and height.
 *
 * These are the CSS `farthest-corner` ellipse radii for a centred ellipse: the
 * one whose axis ratio matches the box and which passes through its corner,
 * which is sqrt(2)/2 of each axis. Stating them explicitly is what lets the
 * canvas draw the same ellipse the CSS gradient describes - a canvas radial
 * gradient is a circle, so the compositor scales the context by rx/ry and the
 * preview writes the radii in container-query units.
 */
export const VIGNETTE_RADIUS_FRACTIONS = { rx: Math.SQRT2 / 2, ry: Math.SQRT2 / 2 } as const

const round3 = (n: number) => Math.round(n * 1000) / 1000
