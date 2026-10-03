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

/**
 * Hue-aware palette (deterministic). Unlike plain k-means, which averages oranges, golds and
 * greens into muddy browns, each significant hue family gets its own entry:
 * - chromatic pixels (C ≥ 0.03 + 0.04·L, so tinted whites count as neutral) are binned into 20° hue
 *   sectors; sectors holding ≥ 1% of the image become entries, large ones split into light/dark;
 * - neutrals are split into 2–4 lightness bands;
 * - each entry takes the median lightness, mean hue and 70th-percentile chroma of its pixels,
 *   so colors stay vivid instead of being averaged toward grey.
 * Returns up to `k` colors sorted dark → light.
 */
export function huePalette(pixels: ArrayLike<number>, k: number): Palette {
  const lab = pixelsToOklab(pixels);
  const n = lab.length / 3;
  if (n === 0 || k <= 0) return { colors: [], weights: [] };
  const L = new Float32Array(n);
  const C = new Float32Array(n);
  const H = new Float32Array(n);
  const chrom = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = lab[i * 3] ?? 0;
    const a = lab[i * 3 + 1] ?? 0;
    const b = lab[i * 3 + 2] ?? 0;
    L[i] = l;
    C[i] = Math.hypot(a, b);
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    H[i] = h;
    chrom[i] = (C[i] ?? 0) >= 0.03 + 0.04 * l ? 1 : 0;
  }
  const SECTOR = 20;
  const groups: { weight: number; idx: number[] }[] = [];
  for (let s = 0; s < 360 / SECTOR; s++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (chrom[i] && (H[i] ?? 0) >= s * SECTOR && (H[i] ?? 0) < (s + 1) * SECTOR) idx.push(i);
    const w = idx.length / n;
    if (w < 0.01) continue;
    const ls = idx.map((i) => L[i] ?? 0).sort((x, y) => x - y);
    const q = (p: number) => ls[Math.min(ls.length - 1, Math.floor(p * ls.length))] ?? 0;
    if (w > 0.1 && q(0.9) - q(0.1) > 0.2) {
      const med = q(0.5);
      groups.push({ weight: w / 2, idx: idx.filter((i) => (L[i] ?? 0) < med) }, { weight: w / 2, idx: idx.filter((i) => (L[i] ?? 0) >= med) });
    } else groups.push({ weight: w, idx });
  }
  groups.sort((x, y) => y.weight - x.weight);
  const neutral: number[] = [];
  for (let i = 0; i < n; i++) if (!chrom[i]) neutral.push(i);
  const na = neutral.length < n * 0.01 ? 0 : Math.max(2, Math.min(4, k - groups.length));
  const chosen = groups.slice(0, Math.max(0, k - na));
  if (na > 0) {
    neutral.sort((x, y) => (L[x] ?? 0) - (L[y] ?? 0));
    for (let b = 0; b < na; b++) {
      const idx = neutral.slice(Math.floor((b * neutral.length) / na), Math.floor(((b + 1) * neutral.length) / na));
      if (idx.length) chosen.push({ weight: idx.length / n, idx });
    }
  }
  const entries = chosen
    .filter((g) => g.idx.length > 0)
    .map((g) => {
      let sa = 0;
      let sb = 0;
      const ls: number[] = [];
      const cs: number[] = [];
      for (const i of g.idx) {
        sa += lab[i * 3 + 1] ?? 0;
        sb += lab[i * 3 + 2] ?? 0;
        ls.push(L[i] ?? 0);
        cs.push(C[i] ?? 0);
      }
      ls.sort((x, y) => x - y);
      cs.sort((x, y) => x - y);
      const h = Math.atan2(sb, sa);
      const c = cs[Math.min(cs.length - 1, Math.floor(0.7 * cs.length))] ?? 0;
      const color: Vec3 = [ls[Math.floor(ls.length / 2)] ?? 0, c * Math.cos(h), c * Math.sin(h)];
      return { color, weight: g.weight };
    })
    .sort((x, y) => x.color[0] - y.color[0]);
  // Weights are shares of the palette (sum to 1); pixels of dropped minor sectors map to the nearest entry.
  const sum = entries.reduce((a, e) => a + e.weight, 0) || 1;
  return { colors: entries.map((e) => e.color), weights: entries.map((e) => e.weight / sum) };
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
