import { mulberry32 } from '../util/prng';
import { oklabDistanceSq, type Vec3 } from './oklab';

export interface KMeansResult {
  centers: Vec3[];
  /** Fraction of points assigned to each center (sums to 1). */
  weights: number[];
}

/**
 * Seeded k-means++ in Oklab (or any 3D space). Deterministic for a given seed and input.
 * `points` is a flat array [x0, y0, z0, x1, y1, z1, …].
 */
export function kmeans(points: Float32Array, k: number, seed: number, maxIter = 20): KMeansResult {
  const n = Math.floor(points.length / 3);
  if (n === 0 || k <= 0) return { centers: [], weights: [] };
  const kk = Math.min(k, n);
  const rand = mulberry32(seed);
  const pt = (i: number): Vec3 => [points[i * 3] ?? 0, points[i * 3 + 1] ?? 0, points[i * 3 + 2] ?? 0];

  // k-means++ initialisation
  const centers: Vec3[] = [pt(Math.floor(rand() * n))];
  const d2 = new Float64Array(n).fill(Infinity);
  while (centers.length < kk) {
    const last = centers[centers.length - 1] as Vec3;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = oklabDistanceSq(pt(i), last);
      if (d < (d2[i] ?? Infinity)) d2[i] = d;
      sum += d2[i] ?? 0;
    }
    if (sum === 0) break; // all remaining points coincide with centers
    let r = rand() * sum;
    let idx = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i] ?? 0;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centers.push(pt(idx));
  }

  const assign = new Int32Array(n);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const p = pt(i);
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = oklabDistanceSq(p, centers[c] as Vec3);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best || iter === 0) {
        if (assign[i] !== best) changed = true;
        assign[i] = best;
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[assign[i] ?? 0] as number[];
      const p = pt(i);
      s[0] = (s[0] ?? 0) + p[0];
      s[1] = (s[1] ?? 0) + p[1];
      s[2] = (s[2] ?? 0) + p[2];
      s[3] = (s[3] ?? 0) + 1;
    }
    sums.forEach((s, c) => {
      const count = s[3] ?? 0;
      if (count > 0) centers[c] = [(s[0] ?? 0) / count, (s[1] ?? 0) / count, (s[2] ?? 0) / count];
    });
    if (!changed && iter > 0) break;
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let i = 0; i < n; i++) counts[assign[i] ?? 0] = (counts[assign[i] ?? 0] ?? 0) + 1;
  return { centers, weights: counts.map((c) => c / n) };
}
