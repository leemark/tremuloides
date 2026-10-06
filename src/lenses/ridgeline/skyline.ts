import { srgbToOklab } from '../../color/oklab';

/** Width of the image sample used for skyline detection (same for preview, final and audio). */
export const RIDGE_SAMPLE_W = 256;

export interface Ridge {
  /** Ridge height per sample column as y / height (0 = top), cleaned and gap-filled. */
  y: Float32Array;
  /** Fraction of columns where the sky scan found a clean ridge. */
  confidence: number;
  method: 'sky' | 'edge';
}

interface Planes {
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
  tex: Float32Array; // local std-dev of L (3×3)
}

function planes(rgba: ArrayLike<number>, w: number, h: number): Planes {
  const n = w * h;
  const L = new Float32Array(n);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lab = srgbToOklab([(rgba[i * 4] ?? 0) / 255, (rgba[i * 4 + 1] ?? 0) / 255, (rgba[i * 4 + 2] ?? 0) / 255]);
    L[i] = lab[0];
    a[i] = lab[1];
    b[i] = lab[2];
  }
  const tex = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let s2 = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const v = L[yy * w + xx] ?? 0;
          s += v;
          s2 += v * v;
          k++;
        }
      }
      tex[y * w + x] = Math.sqrt(Math.max(0, s2 / k - (s / k) ** 2));
    }
  }
  return { L, a, b, tex };
}

/**
 * Sky = blue (Oklab b < −0.02, reasonably light) or bright and nearly neutral (clouds, haze,
 * snow) and not strongly textured. Fluffy clouds are allowed more texture than blue sky.
 */
export function isSky(L: number, a: number, b: number, texture: number): boolean {
  const C = Math.hypot(a, b);
  const blue = b < -0.025 && L > 0.5 && a < 0.03 && texture < 0.05;
  const cloud = L > 0.6 && C < 0.07 && texture < 0.07;
  return blue || cloud;
}

function median(values: number[]): number {
  const s = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  return s.length ? (s[Math.floor(s.length / 2)] ?? NaN) : NaN;
}

function medianFilter(y: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) {
    const win: number[] = [];
    for (let k = -radius; k <= radius; k++) win.push(y[Math.min(y.length - 1, Math.max(0, i + k))] ?? NaN);
    out[i] = median(win);
  }
  return out;
}

/** Fills NaN gaps by linear interpolation (and flat at the ends). */
function fillGaps(y: Float32Array): Float32Array {
  const out = Float32Array.from(y);
  const known = [...out.keys()].filter((i) => Number.isFinite(out[i]));
  if (known.length === 0) return out.fill(0.5);
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) continue;
    const prev = [...known].reverse().find((k) => k < i);
    const next = known.find((k) => k > i);
    if (prev === undefined) out[i] = out[next as number] ?? 0.5;
    else if (next === undefined) out[i] = out[prev] ?? 0.5;
    else out[i] = (out[prev] ?? 0) + (((out[next] ?? 0) - (out[prev] ?? 0)) * (i - prev)) / (next - prev);
  }
  return out;
}

function clean(raw: Float32Array): Float32Array {
  const med = medianFilter(raw, 6);
  const y = Float32Array.from(raw);
  for (let i = 0; i < y.length; i++) {
    if (!Number.isFinite(y[i]) || Math.abs((y[i] ?? 0) - (med[i] ?? 0)) > 0.06) y[i] = med[i] ?? NaN;
  }
  return medianFilter(fillGaps(y), 2);
}

/** Sky must start this high in the frame to count (seeds for the flood fill). */
export const SKY_SEED_FRACTION = 0.35;

/**
 * Finds the skyline as the lower edge of the sky that is CONNECTED to the top of the frame.
 * Sky pixels in the top 35% seed a flood fill (4-connected) through sky; for each column the
 * ridge is just below the lowest connected sky pixel.
 * - Lakes reflecting the sky are separated from the real sky by mountains and shore, so they
 *   never connect (v0.17.1: a mirror-calm lake fooled the old bottom-up scan).
 * - Clouds that don't read as sky are flowed around, not stopped at (the reason v0.7 scanned
 *   from the ground up).
 * Falls back to the strongest horizontal edge when fewer than half the columns find sky.
 */
export function detectRidge(rgba: ArrayLike<number>, w: number, h: number): Ridge {
  const p = planes(rgba, w, h);
  const raw0 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) raw0[i] = isSky(p.L[i] ?? 0, p.a[i] ?? 0, p.b[i] ?? 0, p.tex[i] ?? 1) ? 1 : 0;
  // Sky is wide: require sky 3 px to each side too, so white aspen trunks, bright rocks and
  // snow streaks (narrow, bright, neutral) don't read as sky.
  const sky = (x: number, y: number) => {
    const r = y * w;
    return raw0[r + x] === 1 && raw0[r + Math.max(0, x - 3)] === 1 && raw0[r + Math.min(w - 1, x + 3)] === 1;
  };
  const connected = topConnectedSky(w, h, sky);
  const raw = new Float32Array(w).fill(NaN);
  let good = 0;
  for (let x = 0; x < w; x++) {
    let low = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (connected[y * w + x]) {
        low = y;
        break;
      }
    }
    if (low < 0) continue;
    // The wide-sky test biases the edge up on steep slopes; slide down to the exact
    // per-pixel boundary, at most 5 rows (so a trunk can't drag it down).
    let ry = low + 1;
    for (let k = 0; k < 5 && ry < h && raw0[ry * w + x] === 1; k++) ry++;
    const ridgeY = ry / h;
    if (ridgeY > 0.03 && ridgeY < 0.97) {
      raw[x] = ridgeY;
      good++;
    }
  }
  const confidence = good / w;
  if (confidence >= 0.5) return { y: clean(raw), confidence, method: 'sky' };

  // Fallback: strongest vertical change (light + colour) in the top 80% of each column.
  const edge = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let best = -1;
    let bestY = Math.floor(h / 3);
    for (let y = Math.floor(h * 0.05); y < Math.floor(h * 0.8); y++) {
      const i = y * w + x;
      const j = Math.min(h - 1, y + 2) * w + x;
      const g = Math.abs((p.L[j] ?? 0) - (p.L[i] ?? 0)) + 1.5 * Math.abs((p.b[j] ?? 0) - (p.b[i] ?? 0));
      if (g > best) {
        best = g;
        bestY = y;
      }
    }
    edge[x] = (bestY + 1) / h;
  }
  return { y: clean(edge), confidence, method: 'edge' };
}

/** Flood fill (4-connected) through `sky` from sky pixels in the top SKY_SEED_FRACTION of rows. */
export function topConnectedSky(w: number, h: number, sky: (x: number, y: number) => boolean): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const seedRows = Math.max(1, Math.floor(h * SKY_SEED_FRACTION));
  for (let y = 0; y < seedRows; y++) {
    for (let x = 0; x < w; x++) {
      if (sky(x, y)) {
        seen[y * w + x] = 1;
        stack.push(y * w + x);
      }
    }
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx;
      if (seen[j] || !sky(nx, ny)) return;
      seen[j] = 1;
      stack.push(j);
    };
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  return seen;
}

/** Ridge y (0–1 from top) at horizontal position u (0–1), linearly interpolated. */
export function ridgeAt(ridge: Float32Array, u: number): number {
  const f = Math.min(ridge.length - 1, Math.max(0, u * ridge.length - 0.5));
  const i = Math.floor(f);
  const t = f - i;
  return (ridge[i] ?? 0) * (1 - t) + (ridge[Math.min(ridge.length - 1, i + 1)] ?? 0) * t;
}
