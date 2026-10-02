import { kmeans } from './kmeans';
import { hexToSrgb, srgbToOklab, type Vec3 } from './oklab';

export interface Palette {
  /** Oklab colors, sorted dark → light. */
  colors: Vec3[];
  weights: number[];
}

/** RGBA8 pixels → flat Oklab array (alpha ignored). */
export function pixelsToOklab(pixels: ArrayLike<number>): Float32Array {
  const n = Math.floor(pixels.length / 4);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lab = srgbToOklab([(pixels[i * 4] ?? 0) / 255, (pixels[i * 4 + 1] ?? 0) / 255, (pixels[i * 4 + 2] ?? 0) / 255]);
    out[i * 3] = lab[0];
    out[i * 3 + 1] = lab[1];
    out[i * 3 + 2] = lab[2];
  }
  return out;
}

/** Dominant colors of an image (seeded k-means in Oklab), sorted by lightness. */
export function extractPalette(pixels: ArrayLike<number>, k: number, seed = 1): Palette {
  const { centers, weights } = kmeans(pixelsToOklab(pixels), k, seed);
  const order = centers.map((_, i) => i).sort((a, b) => (centers[a]?.[0] ?? 0) - (centers[b]?.[0] ?? 0));
  return { colors: order.map((i) => centers[i] as Vec3), weights: order.map((i) => weights[i] ?? 0) };
}

/**
 * Eases `prev` toward `next` so the live preview's palette doesn't flicker.
 * Both are sorted by lightness; when sizes differ, `next` wins outright.
 */
export function blendPalettes(prev: Vec3[] | null, next: Vec3[], t: number): Vec3[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((c, i) => {
    const p = prev[i] as Vec3;
    return [p[0] + (c[0] - p[0]) * t, p[1] + (c[1] - p[1]) * t, p[2] + (c[2] - p[2]) * t];
  });
}

export function hexPalette(hexes: readonly string[]): Vec3[] {
  return hexes.map((h) => srgbToOklab(hexToSrgb(h)));
}

/** Flattens up to `max` colors into a vec3 uniform array. */
export function paletteUniform(colors: readonly Vec3[], max = 12): Float32Array {
  const out = new Float32Array(max * 3);
  colors.slice(0, max).forEach((c, i) => out.set(c, i * 3));
  return out;
}
