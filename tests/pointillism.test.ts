import { describe, expect, it } from 'vitest';
import { BATCH, FACE_KEEP_OUT, LAYERS, MAX_PIGMENTS, PALETTES, batches, palette, planFaces, planLayers, previewLayers, totalDots } from '../src/lenses/pointillism/plan';
import { dotCount, pointillismLens } from '../src/lenses/pointillism';
import { oklabToSrgb } from '../src/color/oklab';

const def = { dotSize: 14, detail: 1 };

describe('pointillism plan', () => {
  it('has a ground of big dots, the main dots, and small dots gated to detail', () => {
    const l = planLayers(1080, 1440, def);
    expect(l.map((x) => x.size)).toEqual(LAYERS.map((x) => 14 * x.scale));
    expect(l[0]?.prevLod).toBe(-1);
    expect(l[1]?.prevLod).toBe(-1);
    expect(l[2]?.prevLod).toBe(l[1]?.lod);
    for (const x of l) {
      expect(x.cols * x.cell).toBeGreaterThanOrEqual(1080);
      expect(x.rows * x.cell).toBeGreaterThanOrEqual(1440);
      expect(x.face).toBe(-1);
    }
  });

  it('is resolution independent', () => {
    const a = planLayers(1080, 1440, def);
    const b = planLayers(2160, 2880, def);
    a.forEach((x, i) => {
      expect(b[i]?.size).toBeCloseTo(2 * x.size);
      expect(Math.abs((b[i]?.count ?? 0) - x.count) / x.count).toBeLessThan(0.03);
    });
  });

  it('paints more dots with more detail, and fewer with bigger dots', () => {
    expect(totalDots(planLayers(1080, 1080, { ...def, detail: 2 }))).toBeGreaterThan(totalDots(planLayers(1080, 1080, def)));
    expect(totalDots(planLayers(1080, 1080, { ...def, dotSize: 20 }))).toBeLessThan(totalDots(planLayers(1080, 1080, def)));
  });

  it('keeps the viewfinder within budget and batches every dot once', () => {
    const l = planLayers(1080, 1920, { dotSize: 3, detail: 2 });
    const shown = previewLayers(l);
    expect(shown.length).toBeGreaterThanOrEqual(1);
    expect(totalDots(shown) <= 120000 || shown.length === 1).toBe(true);
    const bs = batches(l);
    expect(bs.reduce((n, b) => n + b.count, 0)).toBe(totalDots(l));
    expect(Math.max(...bs.map((b) => b.count))).toBeLessThanOrEqual(BATCH);
  });

  it('gives faces finer dots on a grid over their ellipse', () => {
    const l = planLayers(1080, 1440, def);
    const f = planFaces([{ x: 0.4, y: 0.2, w: 0.25, h: 0.2 }], 1080, 1440, def, l);
    expect(f).toHaveLength(1);
    const face = f[0]!;
    expect(face.index).toBe(l.length);
    expect(face.face).toBe(0);
    expect(face.size).toBeCloseTo((0.25 * 1080) / 40);
    expect(face.size).toBeLessThan(l[1]!.size);
    // a smaller face: the main dots are too coarse for it and stay out
    const small = planFaces([{ x: 0.4, y: 0.2, w: 0.12, h: 0.1 }], 1080, 1440, def, l)[0]!;
    expect(l[1]!.size).toBeGreaterThan(FACE_KEEP_OUT * small.size);
    expect(face.originX).toBeGreaterThan(0);
    expect(face.cols * face.cell).toBeGreaterThanOrEqual(1.4 * 2 * face.ellipse.rx - 2);
    expect(planFaces([], 1080, 1440, def, l)).toEqual([]);
    expect(planFaces([{ x: 0.4, y: 0.2, w: 0.01, h: 0.01 }], 1080, 1440, def, l)).toEqual([]);
  });

  it('has a palette that reaches from deep darks to white, with no black', () => {
    const lab = palette('seurat');
    expect(lab.length).toBe(PALETTES.seurat?.length);
    expect(lab.length).toBeLessThanOrEqual(MAX_PIGMENTS);
    const L = lab.map((c) => c[0]);
    expect(Math.min(...L)).toBeLessThan(0.35);
    expect(Math.min(...L)).toBeGreaterThan(0.2);
    expect(Math.max(...L)).toBeGreaterThan(0.95);
    for (const c of lab) for (const v of oklabToSrgb(c)) expect(v).toBeGreaterThanOrEqual(-0.01);
    expect(palette('nope')).toEqual(lab);
  });

  it('paces the timelapse by the dots it paints', () => {
    const params = { ...Object.fromEntries(pointillismLens.params.map((p) => [p.id, p.default])) };
    expect(dotCount(params, 1440, 1080)).toBe(totalDots(planLayers(1440, 1080, def)));
  });
});
