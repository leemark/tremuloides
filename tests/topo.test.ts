import { describe, expect, it } from 'vitest';
import { computeContours, contoursToSvg, gaussianBlur, isolines, simplify } from '../src/lenses/topo/contours';

function cone(w: number, h: number): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = 1 - Math.hypot(x - w / 2, y - h / 2) / (w / 2);
  return f;
}

describe('topo contours', () => {
  it('traces a closed circle around a cone peak', () => {
    const w = 64;
    const paths = isolines(cone(w, w), w, w, 0.5);
    expect(paths.length).toBe(1);
    const p = paths[0] as Float32Array;
    expect(p[0]).toBeCloseTo(p[p.length - 2] as number, 5); // closed loop
    for (let i = 0; i < p.length; i += 2) {
      const r = Math.hypot((p[i] as number) - 32, (p[i + 1] as number) - 32);
      expect(r).toBeGreaterThan(14.5);
      expect(r).toBeLessThan(17.5);
    }
  });

  it('produces open lines that end at the border for a ramp', () => {
    const w = 20;
    const h = 10;
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = x / (w - 1);
    const paths = isolines(f, w, h, 0.5);
    expect(paths.length).toBe(1);
    const p = paths[0] as Float32Array;
    expect(p.length / 2).toBe(h);
    for (let i = 0; i < p.length; i += 2) expect(p[i]).toBeCloseTo(9.5, 5);
  });

  it('simplifies collinear points away but keeps corners', () => {
    const line = Float32Array.from([0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 3, 2]);
    expect(Array.from(simplify(line, 0.1))).toEqual([0, 0, 3, 0, 3, 2]);
  });

  it('blur preserves the mean of a constant field', () => {
    const f = new Float32Array(100).fill(0.4);
    for (const v of gaussianBlur(f, 10, 10, 2)) expect(v).toBeCloseTo(0.4, 5);
  });

  it('builds levels with index contours and a layered SVG', () => {
    const w = 80;
    const rgba = new Uint8ClampedArray(w * w * 4);
    const f = cone(w, w);
    for (let i = 0; i < w * w; i++) {
      const v = Math.round(Math.max(0, f[i] as number) * 255);
      rgba.set([v, v, v, 255], i * 4);
    }
    const set = computeContours(rgba, w, w, { levels: 10, smoothing: 0 });
    expect(set.lines.length).toBeGreaterThan(5);
    expect(set.lines.find((l) => l.level === 5)?.index).toBe(true);
    const svg = contoursToSvg(set, 'usgs', 1.2, 'Test <x>');
    expect(svg).toContain('<svg');
    expect(svg).toContain('id="level-5"');
    expect(svg).toContain('(index)');
    expect(svg).not.toContain('<x>');
    expect(svg.match(/<g id="level-/g)?.length).toBe(set.lines.length);
  });
});

describe('topo specks', () => {
  it('drops contour loops shorter than MIN_PATH_PX', () => {
    const w = 30;
    const rgba = new Uint8ClampedArray(w * w * 4).fill(40);
    const i = (15 * w + 15) * 4;
    rgba.set([200, 200, 200, 255], i); // one bright pixel → tiny loops only
    for (let k = 3; k < rgba.length; k += 4) rgba[k] = 255;
    const set = computeContours(rgba, w, w, { levels: 10, smoothing: 0 });
    expect(set.lines.length).toBe(0);
  });
});

describe('topo closed loops', () => {
  it('keeps the shape of a closed loop when simplifying', () => {
    const w = 64;
    const loop = isolines(cone(w, w), w, w, 0.5)[0] as Float32Array;
    const s = simplify(loop, 0.5);
    expect(s.length / 2).toBeGreaterThan(8);
    expect(s[0]).toBeCloseTo(s[s.length - 2] as number, 5);
  });
});
