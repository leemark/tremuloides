import { describe, expect, it } from 'vitest';
import { BATCH, FACE_RAISE, FACE_REACH, FACE_RY, MAX_FACES, PREVIEW_BUDGET, batches, coprimeMultiplier, faceEllipse, planFaces, planLayers, previewLayers, usableFaces } from '../src/lenses/flow-painter/plan';

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

describe('timelapse pacing', () => {
  it('spreads all strokes over the stroke phase', async () => {
    const { timelapseBatch, totalStrokes } = await import('../src/lenses/flow-painter/plan');
    const l = planLayers(1080, 1440, DEF);
    const b = timelapseBatch(l, 8, 20);
    expect(Math.ceil(totalStrokes(l) / b)).toBeLessThanOrEqual(160);
    expect(batches(l, b).length).toBeGreaterThanOrEqual(150);
  });

  it('sizes videos to a 1440 px long edge with even dimensions', async () => {
    const { animationSize, frameCount } = await import('../src/app/animate');
    expect(animationSize(3072, 4080)).toEqual([1084, 1440]);
    expect(animationSize(800, 600)).toEqual([800, 600]);
    const [w, h] = animationSize(1001, 777);
    expect(w % 2 + h % 2).toBe(0);
    expect(frameCount(2.5, 20)).toBe(50);
  });
});

describe('flow painter faces', () => {
  const p = { detail: 1, strokeLength: 40, strokeWidth: 6, layers: 3 };
  const face = { x: 0.4, y: 0.3, w: 0.1, h: 0.13 };

  it('gives each face a fine layer of its own after the regular layers', () => {
    const layers = planLayers(1440, 1080, p);
    const faces = planFaces([face], 1440, 1080, p, layers);
    expect(faces).toHaveLength(1);
    const f = faces[0]!;
    expect(f.index).toBe(layers.length);
    expect(f.prevLod).toBe(-1);
    // 144 px face / 24 brushes = 6 px, no coarser than the finest regular brush (6 ref px here)
    expect(f.width).toBeCloseTo(6, 6);
    expect(f.length).toBeCloseTo(15, 6);
    // the grid covers the ellipse, which takes in a little more than the box
    expect(f.originX).toBeLessThan(0.4 * 1440);
    expect(f.originX + f.cols * f.cell).toBeGreaterThan(0.5 * 1440);
    // ...and the soft blend around it
    expect(f.originX).toBe(Math.floor(f.ellipse.cx - FACE_REACH * f.ellipse.rx));
    expect(f.originY + f.rows * f.cell).toBeGreaterThanOrEqual(f.ellipse.cy + FACE_REACH * f.ellipse.ry);
    const all = [...layers, ...faces];
    expect(batches(all).filter((b) => b.layer === f.index).reduce((n, b) => n + b.count, 0)).toBe(f.count);
  });

  it('sizes the face brush with the face, within limits', () => {
    const layers = planLayers(1440, 1080, { ...p, strokeWidth: 20 });
    const small = planFaces([{ ...face, w: 0.03 }], 1440, 1080, p, layers)[0]!;
    const big = planFaces([{ ...face, w: 0.5 }], 1440, 1080, p, layers)[0]!;
    expect(small.width).toBeCloseTo(1.8, 6); // 43.2 px / 24
    expect(big.width).toBeCloseTo(20, 6); // capped at the finest regular brush
    const tiny = planFaces([{ ...face, w: 0.017 }], 1440, 1080, p, layers);
    expect(tiny).toHaveLength(1);
    expect(tiny[0]!.width).toBeCloseTo(1.5, 6); // FACE_MIN_WIDTH
  });

  it('is resolution independent', () => {
    const a = planFaces([face], 1440, 1080, p, planLayers(1440, 1080, p))[0]!;
    const b = planFaces([face], 4320, 3240, p, planLayers(4320, 3240, p))[0]!;
    expect(b.width / a.width).toBeCloseTo(3, 6);
    expect(Math.abs(b.count - a.count) / a.count).toBeLessThan(0.05);
  });

  it('ignores bad, tiny and off-picture faces and keeps the largest few', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ x: 0.05 * i, y: 0.1, w: 0.02 + 0.005 * i, h: 0.05 }));
    const kept = usableFaces([...many, { x: NaN, y: 0, w: 0.1, h: 0.1 }, { x: 1.2, y: 0, w: 0.1, h: 0.1 }, { x: 0, y: 0, w: 0.001, h: 0.1 }], 1440, 1080);
    expect(kept).toHaveLength(MAX_FACES);
    expect(kept[0]!.w).toBeCloseTo(0.075, 6);
    expect(usableFaces(undefined, 100, 100)).toEqual([]);
  });

  it('leaves background faces loose: only faces at least a third as wide as the widest', () => {
    // a portrait with three tiny faces in the crowd behind (Mark's drummer photo)
    const portrait = usableFaces(
      [
        { x: 0.38, y: 0.17, w: 0.188, h: 0.193 },
        { x: 0.01, y: 0.47, w: 0.03, h: 0.042 },
        { x: 0.04, y: 0.45, w: 0.028, h: 0.04 },
        { x: 0.15, y: 0.49, w: 0.027, h: 0.037 },
      ],
      2048,
      2048,
    );
    expect(portrait.map((f) => f.w)).toEqual([0.188]);
    // a group of similar faces all count
    const group = [
      { x: 0.3, y: 0.3, w: 0.112, h: 0.108 },
      { x: 0.5, y: 0.3, w: 0.098, h: 0.094 },
      { x: 0.6, y: 0.3, w: 0.112, h: 0.108 },
    ];
    expect(usableFaces(group, 3072, 4080)).toHaveLength(3);
    // exactly a third still counts
    expect(usableFaces([{ x: 0, y: 0, w: 0.3, h: 0.3 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }], 1000, 1000)).toHaveLength(2);
  });

  it('turns a face box into the ellipse painted as the face', () => {
    const e = faceEllipse(face, 1000, 1000);
    expect(e.cx).toBeCloseTo(450, 6);
    expect(e.cy).toBeCloseTo(1000 * (0.3 + 0.065 - FACE_RAISE * 0.13), 6);
    expect(e.rx).toBeCloseTo(60, 6);
    expect(e.ry).toBeCloseTo(1000 * FACE_RY * 0.13, 6);
  });
});
