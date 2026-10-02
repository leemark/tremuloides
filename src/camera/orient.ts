/**
 * Picks how to rotate a captured photo so it matches the live preview frame.
 * Some devices return ImageCapture photos in sensor orientation; the preview
 * stream is always upright, so we compare small grayscale thumbnails.
 */

export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Rotates a grayscale image clockwise by `deg`. */
export function rotateGray(img: Gray, deg: Rotation): Gray {
  if (deg === 0) return img;
  const { width: w, height: h, data } = img;
  const swap = deg === 90 || deg === 270;
  const ow = swap ? h : w;
  const oh = swap ? w : h;
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (deg === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (deg === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      out[ny * ow + nx] = data[y * w + x] ?? 0;
    }
  }
  return { width: ow, height: oh, data: out };
}

/** Nearest-neighbour resample to a fixed size, normalised to zero mean / unit variance. */
export function normalizeGray(img: Gray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) / w) * img.width));
      const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) / h) * img.height));
      out[y * w + x] = img.data[sy * img.width + sx] ?? 0;
    }
  }
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  let variance = 0;
  for (const v of out) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / out.length) || 1;
  for (let i = 0; i < out.length; i++) out[i] = ((out[i] ?? 0) - mean) / sd;
  return out;
}

function mse(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return s / a.length;
}

/**
 * Returns the clockwise rotation to apply to `photo` so it best matches `reference`.
 * Only orientations whose aspect matches the reference (portrait vs landscape) are considered.
 */
export function pickRotation(photo: Gray, reference: Gray): Rotation {
  const refPortrait = reference.height > reference.width;
  const photoPortrait = photo.height > photo.width;
  const candidates: Rotation[] = refPortrait === photoPortrait ? [0, 180] : [90, 270];
  const W = 32;
  const H = Math.max(8, Math.round((W * reference.height) / reference.width));
  const ref = normalizeGray(reference, W, H);
  let best: Rotation = candidates[0] ?? 0;
  let bestErr = Infinity;
  for (const c of candidates) {
    const err = mse(normalizeGray(rotateGray(photo, c), W, H), ref);
    // Prefer 0° unless another orientation is clearly better.
    const biased = c === 0 ? err * 0.85 : err;
    if (biased < bestErr) {
      bestErr = biased;
      best = c;
    }
  }
  return best;
}
