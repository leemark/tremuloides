import { mulberry32 } from '../../util/prng';

/** Long edge of the image sample used for seed placement (same for preview and final). */
export const SAMPLE_EDGE = 320;

/**
 * Sobel gradient magnitude of luma, normalised so the 95th percentile is 1 (clamped).
 * For scenes with few edges (p95 near zero) the reference falls back to a quarter of the maximum.
 */
export function edgeMagnitude(rgba: ArrayLike<number>, w: number, h: number, smooth = 2): Float32Array {
  let lum: Float32Array = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.2126 * (rgba[i * 4] ?? 0) + 0.7152 * (rgba[i * 4 + 1] ?? 0) + 0.0722 * (rgba[i * 4 + 2] ?? 0)) / 255;
  }
  // Light blur first so fine texture (grass, gravel) doesn't read as structure and fill
  // the foreground with tiny panes; ridgelines and tree edges survive it.
  for (let pass = 0; pass < smooth; pass++) lum = boxBlur3(lum, w, h);
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] ?? 0;
  const mag = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      mag[y * w + x] = Math.hypot(gx, gy);
    }
  }
  const sorted = Float32Array.from(mag).sort();
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const ref = Math.max(p95, max * 0.25);
  const scale = ref > 1e-6 ? 1 / ref : 0;
  for (let i = 0; i < mag.length; i++) mag[i] = Math.min(1, (mag[i] ?? 0) * scale);
  return mag;
}

function boxBlur3(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = src[y * w + Math.max(0, x - 1)] ?? 0;
      const r = src[y * w + Math.min(w - 1, x + 1)] ?? 0;
      tmp[y * w + x] = (l + (src[y * w + x] ?? 0) + r) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = tmp[Math.max(0, y - 1) * w + x] ?? 0;
      const d = tmp[Math.min(h - 1, y + 1) * w + x] ?? 0;
      out[y * w + x] = (u + (tmp[y * w + x] ?? 0) + d) / 3;
    }
  }
  return out;
}

/**
 * Places `count` seeds (uv pairs, image space, v = 0 at the top) with probability
 * proportional to (1 - attraction) × 0.12 + attraction × 8 × edge. Deterministic for a given seed.
 * v3: flat areas (open sky, still water) get ~100× fewer seeds than strong edges at the default
 * attraction (was ~10×), so skies read as a few large panes and detail gets the small ones.
 */
export function placeSeeds(edges: Float32Array, w: number, h: number, count: number, attraction: number, seed: number): Float32Array {
  const a = Math.min(1, Math.max(0, attraction));
  const cdf = new Float64Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    total += (1 - a) * 0.12 + a * 8 * (edges[i] ?? 0);
    cdf[i] = total;
  }
  const rand = mulberry32(seed);
  const out = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) {
    const r = rand() * total;
    let lo = 0;
    let hi = w * h - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cdf[mid] ?? 0) < r) lo = mid + 1;
      else hi = mid;
    }
    out[k * 2] = ((lo % w) + rand()) / w;
    out[k * 2 + 1] = (Math.floor(lo / w) + rand()) / h;
  }
  return out;
}

/** 16-bit fixed-point seed position packed into RGBA8 (0 = empty). Mirrors decodeSeed() in GLSL. */
export function encodeSeed(u: number, v: number): [number, number, number, number] {
  const x = 1 + Math.round(Math.min(1, Math.max(0, u)) * 65534);
  const y = 1 + Math.round(Math.min(1, Math.max(0, v)) * 65534);
  return [x >> 8, x & 255, y >> 8, y & 255];
}

export function decodeSeed(r: number, g: number, b: number, a: number): [number, number] | null {
  const x = r * 256 + g;
  const y = b * 256 + a;
  if (x === 0) return null;
  return [(x - 1) / 65534, (y - 1) / 65534];
}

/** Initial jump-flooding texture: each seed written into the texel it falls in. */
export function seedTexture(seeds: Float32Array, w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let k = 0; k < seeds.length / 2; k++) {
    const u = seeds[k * 2] ?? 0;
    const v = seeds[k * 2 + 1] ?? 0;
    const x = Math.min(w - 1, Math.floor(u * w));
    const y = Math.min(h - 1, Math.floor(v * h));
    data.set(encodeSeed(u, v), (y * w + x) * 4);
  }
  return data;
}

/** Jump-flooding step sizes: powers of two from half the larger dimension down to 1, plus a final 1 (JFA+1). */
export function jfaSteps(w: number, h: number): number[] {
  const steps: number[] = [];
  let k = 2 ** Math.floor(Math.log2(Math.max(1, Math.max(w, h))));
  for (k = Math.max(1, k / 2); k >= 1; k = Math.floor(k / 2)) steps.push(k);
  steps.push(1);
  return steps;
}

/** JFA grid size: the render size capped at `maxEdge` on the long side. */
export function jfaSize(w: number, h: number, maxEdge: number): [number, number] {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}
