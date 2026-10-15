// The chroma-key pixel math, shared by the preview and the export compositor.
//
// It used to live inside a React hook, and the hook's comment claimed an export
// path that did not exist: a keyed clip previewed with its background removed
// and exported with the green still in it. Both sides now call applyChromaKey,
// so the key seen while editing is the key that is encoded.

/** The largest distance between two RGB triples, ~sqrt(3 * 255^2). Tolerance is
 *  a fraction of it, so 1 keys everything and 0 nothing. */
export const MAX_RGB_DISTANCE = 441

export const DEFAULT_CHROMA_COLOR = '#00ff00'
export const DEFAULT_CHROMA_TOLERANCE = 0.3

export function parseChromaColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * The fraction of a pixel's alpha that survives the key, from its RGB
 * distance to the keyed colour.
 *
 * Distance fades the alpha rather than cutting it, so the edge of the keyed
 * region does not alias. Outside the tolerance the factor is 1 and the pixel is
 * untouched; at the target colour it is 0 and the pixel vanishes.
 */
export function chromaAlphaFactor(
  r: number,
  g: number,
  b: number,
  target: [number, number, number],
  tolerance: number,
): number {
  const maxDist = tolerance * MAX_RGB_DISTANCE
  if (maxDist <= 0) return 1
  const dr = r - target[0]
  const dg = g - target[1]
  const db = b - target[2]
  const dist = Math.sqrt(dr * dr + dg * dg + db * db)
  if (dist >= maxDist) return 1
  return dist / maxDist
}

/**
 * Keys an RGBA buffer in place: each pixel's alpha is multiplied by the factor
 * its colour distance allows.
 *
 * Multiplying rather than assigning is what makes this correct for sources that
 * already carry transparency - an image with a soft edge keeps it - while for an
 * opaque video frame it is exactly the assignment the preview always performed.
 */
export function applyChromaKey(
  data: Uint8ClampedArray,
  target: [number, number, number],
  tolerance: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    const factor = chromaAlphaFactor(data[i], data[i + 1], data[i + 2], target, tolerance)
    if (factor !== 1) data[i + 3] = Math.round(data[i + 3] * factor)
  }
}
