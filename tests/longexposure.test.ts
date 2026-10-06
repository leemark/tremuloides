import { describe, expect, it } from 'vitest';
import { alignSize, emaAlpha, estimateShift, meanWeight } from '../src/lenses/long-exposure/align';

/** Smooth random-ish texture with features at several scales. */
function texture(w: number, h: number, ox = 0, oy = 0): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + ox;
      const Y = y + oy;
      g[y * w + x] = 128 + 50 * Math.sin(X * 0.21) * Math.cos(Y * 0.17) + 30 * Math.sin((X + 2 * Y) * 0.07) + 20 * Math.cos(X * 0.5 + Y * 0.03);
    }
  }
  return g;
}

describe('long exposure alignment', () => {
  it('finds integer shifts', () => {
    const w = 120;
    const h = 90;
    const ref = texture(w, h);
    for (const [dx, dy] of [[0, 0], [3, -2], [-7, 5], [9, 9]] as const) {
      const r = estimateShift(ref, texture(w, h, -dx, -dy), w, h);
      expect(Math.round(r.dx)).toBe(dx);
      expect(Math.round(r.dy)).toBe(dy);
    }
  });

  it('gets close on sub-pixel shifts', () => {
    const w = 120;
    const h = 90;
    const r = estimateShift(texture(w, h), texture(w, h, -2.5, 1.3), w, h);
    expect(Math.abs(r.dx - 2.5)).toBeLessThan(0.35);
    expect(Math.abs(r.dy + 1.3)).toBeLessThan(0.35);
  });

  it('sizes thumbnails and blend weights', () => {
    expect(alignSize(1920, 1080)).toEqual([160, 90]);
    expect(meanWeight(1)).toBe(1);
    expect(meanWeight(4)).toBe(0.25);
    expect(emaAlpha(3)).toBeCloseTo(1 / 45);
    expect(emaAlpha(0)).toBe(1);
  });
});
