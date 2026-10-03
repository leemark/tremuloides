import { huePalette } from '../color/palette';
import { oklabToOklch, oklabToSrgb, srgbToHex, srgbToOklab, type Vec3 } from '../color/oklab';
import type { FieldLogData } from '../storage/types';

/** Bump when the analysis changes; older results are recomputed by the backfill. */
export const FIELDLOG_VERSION = 2;
export const PALETTE_SIZE = 6;
export const SAMPLE_EDGE = 160;

/**
 * Autumn-foliage test in Oklch. Aspen gold (h≈85°), orange (h≈50°) and the red-orange stands
 * seen in the field (h 25–40°, L 0.43–0.59, C 0.11–0.15) all count. Red-orange aspens overlap
 * iron-red rock (h≈33°, C≈0.135) in color, so red rock now counts too: fall color mattered more.
 * Snow, sky, spruce, granite and dull browns still fail on chroma or hue.
 */
export const WARM = { hueMin: 28, hueMax: 105, chromaMin: 0.08, lMin: 0.42, lMax: 0.92 } as const;

export function isWarmFoliage(lab: Vec3): boolean {
  const [L, C, h] = oklabToOklch(lab);
  return C >= WARM.chromaMin && L >= WARM.lMin && L <= WARM.lMax && h >= WARM.hueMin && h <= WARM.hueMax;
}

/** Fraction (0–1) of RGBA pixels that look like autumn foliage. */
export function warmIndex(pixels: ArrayLike<number>): number {
  const n = Math.floor(pixels.length / 4);
  if (n === 0) return 0;
  let warm = 0;
  for (let i = 0; i < n; i++) {
    const lab = srgbToOklab([(pixels[i * 4] ?? 0) / 255, (pixels[i * 4 + 1] ?? 0) / 255, (pixels[i * 4 + 2] ?? 0) / 255]);
    if (isWarmFoliage(lab)) warm++;
  }
  return warm / n;
}

/** Palette (hex + weight, sorted by weight) and warm index for one image. */
export function analyzePixels(pixels: ArrayLike<number>): FieldLogData {
  const pal = huePalette(pixels, PALETTE_SIZE);
  const palette = pal.colors
    .map((c, i) => ({ hex: srgbToHex(oklabToSrgb(c)), weight: Number((pal.weights[i] ?? 0).toFixed(4)) }))
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  return { palette, warmIndex: Number(warmIndex(pixels).toFixed(4)), version: FIELDLOG_VERSION };
}

/** The colour that best represents a capture: its heaviest warm colour, else its heaviest colour. */
export function accentHex(data: FieldLogData | undefined): string {
  if (!data || data.palette.length === 0) return '#8b8781';
  const warm = data.palette.find((p) => {
    const m = /^#([0-9a-f]{6})$/i.exec(p.hex);
    if (!m?.[1]) return false;
    const n = parseInt(m[1], 16);
    return isWarmFoliage(srgbToOklab([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]));
  });
  return (warm ?? data.palette[0])?.hex ?? '#8b8781';
}

/** Decodes a blob to a small RGBA sample (works in workers and on the main thread). */
export async function samplePixels(blob: Blob, edge = SAMPLE_EDGE): Promise<Uint8ClampedArray> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const s = Math.min(1, edge / Math.max(full.width, full.height));
  const w = Math.max(1, Math.round(full.width * s));
  const h = Math.max(1, Math.round(full.height * s));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(full, 0, 0, w, h);
  full.close();
  return ctx.getImageData(0, 0, w, h).data;
}
