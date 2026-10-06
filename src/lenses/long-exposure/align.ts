/** Handheld steadying for Long Exposure: estimate each frame's shift against the first (pure, tested). */

/** Long edge of the grayscale thumbnails used for alignment. */
export const ALIGN_EDGE = 160;
/** Search radius in thumbnail px (±6% of the frame at 160 px). */
export const ALIGN_RADIUS = 10;

export function grayFromRgba(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.2126 * (rgba[i * 4] ?? 0) + 0.7152 * (rgba[i * 4 + 1] ?? 0) + 0.0722 * (rgba[i * 4 + 2] ?? 0);
  return g;
}

/** Mean absolute difference between ref and cur shifted by (dx, dy), over the overlap, sampling every `step` px. */
function sad(ref: Float32Array, cur: Float32Array, w: number, h: number, dx: number, dy: number, step: number): number {
  let s = 0;
  let n = 0;
  const x0 = Math.max(0, -dx);
  const x1 = Math.min(w, w - dx);
  const y0 = Math.max(0, -dy);
  const y1 = Math.min(h, h - dy);
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      s += Math.abs((ref[y * w + x] ?? 0) - (cur[(y + dy) * w + x + dx] ?? 0));
      n++;
    }
  }
  return n ? s / n : Infinity;
}

/**
 * Integer shift (dx, dy) such that cur(x + dx, y + dy) ≈ ref(x, y): coarse search every 2 px
 * over ±radius, then a ±2 px refinement at full resolution, then a parabolic sub-pixel fit.
 */
export function estimateShift(ref: Float32Array, cur: Float32Array, w: number, h: number, radius = ALIGN_RADIUS): { dx: number; dy: number; score: number } {
  let best = { dx: 0, dy: 0, s: sad(ref, cur, w, h, 0, 0, 2) };
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const s = sad(ref, cur, w, h, dx, dy, 2);
      if (s < best.s) best = { dx, dy, s };
    }
  }
  const c = best;
  let fine = { dx: c.dx, dy: c.dy, s: sad(ref, cur, w, h, c.dx, c.dy, 1) };
  for (let dy = c.dy - 2; dy <= c.dy + 2; dy++) {
    for (let dx = c.dx - 2; dx <= c.dx + 2; dx++) {
      if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
      const s = sad(ref, cur, w, h, dx, dy, 1);
      if (s < fine.s) fine = { dx, dy, s };
    }
  }
  const sub = (a: number, b: number, c0: number) => {
    const d = a - 2 * b + c0;
    return d > 1e-9 ? Math.max(-0.5, Math.min(0.5, (a - c0) / (2 * d))) : 0;
  };
  const sx = sub(sad(ref, cur, w, h, fine.dx - 1, fine.dy, 1), fine.s, sad(ref, cur, w, h, fine.dx + 1, fine.dy, 1));
  const sy = sub(sad(ref, cur, w, h, fine.dx, fine.dy - 1, 1), fine.s, sad(ref, cur, w, h, fine.dx, fine.dy + 1, 1));
  return { dx: fine.dx + sx, dy: fine.dy + sy, score: fine.s };
}

/** Thumbnail size for alignment. */
export function alignSize(w: number, h: number): [number, number] {
  const s = Math.min(1, ALIGN_EDGE / Math.max(w, h));
  return [Math.max(8, Math.round(w * s)), Math.max(8, Math.round(h * s))];
}

/** Long-exposure weight for frame n (1-based) in a running mean. */
export function meanWeight(n: number): number {
  return 1 / Math.max(1, n);
}

/** Preview: per-frame blend factor for an exponential moving average spanning `seconds` at `fps`. */
export function emaAlpha(seconds: number, fps = 30): number {
  return Math.min(1, Math.max(0.01, 1 / Math.max(1, seconds * fps * 0.5)));
}
