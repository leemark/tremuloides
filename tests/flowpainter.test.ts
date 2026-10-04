import { describe, expect, it } from 'vitest';
import { BATCH, PREVIEW_BUDGET, batches, coprimeMultiplier, planLayers, previewLayers } from '../src/lenses/flow-painter/plan';

const DEF = { detail: 1, strokeLength: 40, strokeWidth: 6, layers: 3 };

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

describe('flow painter plan', () => {
  it('goes coarse to fine, doubling the brush per layer', () => {
    const l = planLayers(1080, 1440, DEF);
    expect(l.map((x) => x.width)).toEqual([24, 12, 6]);
    expect(l[0]?.prevLod).toBe(-1);
    expect(l[1]?.prevLod).toBe(l[0]?.lod);
    expect(l[2]?.lod).toBeLessThan(l[1]?.lod ?? 0);
    for (const x of l) expect(x.cols * x.cell).toBeGreaterThanOrEqual(1080);
  });

  it('is resolution independent: same stroke counts at any size', () => {
    const a = planLayers(1080, 1440, DEF).map((x) => x.count);
    const b = planLayers(2160, 2880, DEF).map((x) => x.count);
    a.forEach((n, i) => expect(Math.abs(n - (b[i] ?? 0)) / n).toBeLessThan(0.03));
    expect(planLayers(2160, 2880, DEF)[2]?.width).toBe(12);
  });

  it('scales density with Detail and clamps layers to 1–4', () => {
    const lo = planLayers(1080, 1440, { ...DEF, detail: 0.5 }).reduce((n, x) => n + x.count, 0);
    const hi = planLayers(1080, 1440, { ...DEF, detail: 2 }).reduce((n, x) => n + x.count, 0);
    expect(hi / lo).toBeGreaterThan(3.5);
    expect(planLayers(100, 100, { ...DEF, layers: 9 }).length).toBe(4);
    expect(planLayers(100, 100, { ...DEF, layers: 0 }).length).toBe(1);
  });

  it('picks a multiplier coprime with the stroke count (a permutation of cells)', () => {
    for (const n of [1, 2, 7919, 7919 * 3, 1000, 12345, 62706]) {
      const p = coprimeMultiplier(n);
      expect(gcd(p, n)).toBe(1);
    }
    const n = 997;
    const p = coprimeMultiplier(n);
    expect(new Set(Array.from({ length: n }, (_, i) => (i * p) % n)).size).toBe(n);
  });

  it('keeps preview strokes within budget, but always at least the coarsest layer', () => {
    const l = planLayers(1080, 1440, { ...DEF, detail: 2, layers: 4 });
    const p = previewLayers(l);
    expect(p.length).toBeGreaterThanOrEqual(1);
    expect(p.length).toBeLessThan(l.length);
    if (p.length > 1) expect(p.reduce((n, x) => n + x.count, 0)).toBeLessThanOrEqual(PREVIEW_BUDGET);
    expect(previewLayers(l, 1).length).toBe(1);
  });

  it('splits layers into batches covering every stroke once, in order', () => {
    const l = planLayers(1080, 1440, DEF);
    const b = batches(l);
    for (const x of l) expect(b.filter((y) => y.layer === x.index).reduce((n, y) => n + y.count, 0)).toBe(x.count);
    expect(b.every((y) => y.count <= BATCH)).toBe(true);
    expect(b.map((y) => y.layer)).toEqual([...b.map((y) => y.layer)].sort());
  });
});
