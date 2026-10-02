import { describe, expect, it } from 'vitest';
import { decodeSeed, edgeMagnitude, encodeSeed, jfaSize, jfaSteps, placeSeeds, seedTexture } from '../src/lenses/stained-glass/seeds';

function halfImage(w: number, h: number): Uint8ClampedArray {
  // Left half black, right half white: a single vertical edge at x = w/2.
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(x >= w / 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * w + x) * 4);
  return px;
}

describe('stained glass seeds', () => {
  const w = 64;
  const h = 48;
  const edges = edgeMagnitude(halfImage(w, h), w, h);

  it('finds the edge', () => {
    expect(edges[10 * w + 32]).toBeGreaterThan(0.9);
    expect(edges[10 * w + 5]).toBe(0);
  });

  it('places seeds deterministically, inside the image', () => {
    const a = placeSeeds(edges, w, h, 500, 0.6, 42);
    expect(a).toEqual(placeSeeds(edges, w, h, 500, 0.6, 42));
    expect(a).not.toEqual(placeSeeds(edges, w, h, 500, 0.6, 43));
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('packs seeds near edges when attraction is high, evenly when it is zero', () => {
    const near = (pts: Float32Array) => {
      let n = 0;
      for (let k = 0; k < pts.length / 2; k++) if (Math.abs((pts[k * 2] ?? 0) - 0.5) < 0.05) n++;
      return n / (pts.length / 2);
    };
    expect(near(placeSeeds(edges, w, h, 2000, 0, 1))).toBeLessThan(0.15);
    expect(near(placeSeeds(edges, w, h, 2000, 1, 1))).toBeGreaterThan(0.5);
  });

  it('round-trips the RGBA8 seed encoding with sub-pixel precision at 4096 px', () => {
    for (const [u, v] of [[0, 0], [1, 1], [0.123456, 0.987654], [0.5, 0.25]] as const) {
      const [r, g, b, a] = encodeSeed(u, v);
      const out = decodeSeed(r, g, b, a);
      expect(out).not.toBeNull();
      expect(Math.abs((out?.[0] ?? 0) - u) * 4096).toBeLessThan(0.1);
      expect(Math.abs((out?.[1] ?? 0) - v) * 4096).toBeLessThan(0.1);
    }
    expect(decodeSeed(0, 0, 0, 0)).toBeNull();
  });

  it('writes seeds into their texels', () => {
    const tex = seedTexture(new Float32Array([0.15, 0.15, 0.95, 0.65]), 10, 10);
    const at = (x: number, y: number) => decodeSeed(tex[(y * 10 + x) * 4]!, tex[(y * 10 + x) * 4 + 1]!, tex[(y * 10 + x) * 4 + 2]!, tex[(y * 10 + x) * 4 + 3]!);
    expect(at(1, 1)?.[0]).toBeCloseTo(0.15, 4);
    expect(at(9, 6)?.[1]).toBeCloseTo(0.65, 4);
    expect(at(5, 5)).toBeNull();
  });

  it('plans JFA steps and grid sizes', () => {
    expect(jfaSteps(1000, 600)).toEqual([256, 128, 64, 32, 16, 8, 4, 2, 1, 1]);
    expect(jfaSteps(1, 1)).toEqual([1, 1]);
    expect(jfaSize(4080, 3072, 2048)).toEqual([2048, 1542]);
    expect(jfaSize(720, 1280, 1024)).toEqual([576, 1024]);
  });
});
