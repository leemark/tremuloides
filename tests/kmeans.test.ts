import { describe, expect, it } from 'vitest';
import { kmeans } from '../src/color/kmeans';
import { mulberry32 } from '../src/util/prng';

function cluster(centers: [number, number, number][], perCluster: number, seed: number): Float32Array {
  const r = mulberry32(seed);
  const out: number[] = [];
  for (const c of centers) for (let i = 0; i < perCluster; i++) out.push(c[0] + (r() - 0.5) * 0.02, c[1] + (r() - 0.5) * 0.02, c[2] + (r() - 0.5) * 0.02);
  return new Float32Array(out);
}

describe('kmeans', () => {
  const truth: [number, number, number][] = [
    [0.2, 0.0, 0.0],
    [0.8, 0.1, 0.1],
    [0.5, -0.1, 0.05],
  ];
  const pts = cluster(truth, 50, 1);

  it('is deterministic for a given seed', () => {
    expect(kmeans(pts, 3, 42)).toEqual(kmeans(pts, 3, 42));
  });

  it('recovers well-separated clusters', () => {
    const { centers, weights } = kmeans(pts, 3, 9);
    expect(centers).toHaveLength(3);
    for (const t of truth) {
      const d = Math.min(...centers.map((c) => Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2])));
      expect(d).toBeLessThan(0.02);
    }
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('handles k larger than the number of points and empty input', () => {
    expect(kmeans(new Float32Array([0.1, 0.2, 0.3]), 5, 1).centers).toHaveLength(1);
    expect(kmeans(new Float32Array(), 3, 1).centers).toHaveLength(0);
  });
});
