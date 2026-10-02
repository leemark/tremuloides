import { describe, expect, it } from 'vitest';
import { accentHex, analyzePixels, isWarmFoliage, warmIndex } from '../src/fieldlog/analyze';
import { hexToSrgb, srgbToOklab } from '../src/color/oklab';
import { parseTrip, tripCaptures, tripStats } from '../src/fieldlog/trip';
import { gridDims, posterItems, splitByWeights } from '../src/fieldlog/poster';
import type { Capture } from '../src/storage/types';

const lab = (hex: string) => srgbToOklab(hexToSrgb(hex));

function px(hexes: string[], each: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(hexes.length * each * 4);
  hexes.forEach((h, i) => {
    const [r, g, b] = hexToSrgb(h);
    for (let k = 0; k < each; k++) out.set([r * 255, g * 255, b * 255, 255], (i * each + k) * 4);
  });
  return out;
}

function cap(id: string, createdAt: string, extra: Partial<Capture> = {}): Capture {
  return {
    id, createdAt, source: 'camera', outputKey: `${id}:out`, thumbKey: `${id}:thumb`, outputType: 'image/jpeg',
    lensId: 'ink-wash', lensVersion: 1, params: {}, seed: 1, width: 1, height: 1, appVersion: '0.4.0', ...extra,
  };
}

describe('warm foliage', () => {
  it('counts golds and oranges but not rock, sky, spruce, snow or granite', () => {
    for (const h of ['#e9b825', '#d96a27', '#f2c84b', '#e0a020']) expect(isWarmFoliage(lab(h)), h).toBe(true);
    for (const h of ['#a4412e', '#4e86c8', '#2e4a3b', '#f3f2ec', '#8b8781', '#1a1c21', '#7e8f6a']) expect(isWarmFoliage(lab(h)), h).toBe(false);
  });

  it('measures the warm fraction', () => {
    expect(warmIndex(px(['#e9b825', '#4e86c8'], 50))).toBeCloseTo(0.5, 6);
    expect(warmIndex(new Uint8ClampedArray())).toBe(0);
  });

  it('analyses an image into a weighted palette', () => {
    const d = analyzePixels(px(['#e9b825', '#e9b825', '#2e4a3b', '#4e86c8'], 40));
    expect(d.palette.length).toBeGreaterThanOrEqual(3);
    expect(d.palette.reduce((a, p) => a + p.weight, 0)).toBeCloseTo(1, 2);
    expect(d.warmIndex).toBeCloseTo(0.5, 2);
    expect(accentHex(d)).toMatch(/^#e[0-9a-f]b/); // the gold
    expect(accentHex(undefined)).toBe('#8b8781');
  });
});

describe('trip', () => {
  const caps = [
    cap('b', '2026-10-03T18:00:00.000Z', { geo: { lat: 37.9, lon: -107.8, accuracy: 5, altitude: 3300, altitudeAccuracy: 5, at: '' }, fieldlog: { palette: [{ hex: '#e9b825', weight: 1 }], warmIndex: 0.6, version: 1 } }),
    cap('a', '2026-10-02T15:00:00.000Z', { fieldlog: { palette: [{ hex: '#2e4a3b', weight: 1 }], warmIndex: 0.2, version: 1 } }),
    cap('c', '2026-10-04T15:00:00.000Z', { geo: { lat: 37.8, lon: -107.7, accuracy: 5, altitude: 2800, altitudeAccuracy: 5, at: '' } }),
  ];

  it('parses saved trips safely', () => {
    expect(parseTrip(null).name).toBe('San Juans 2026');
    expect(parseTrip('{"name":"Ouray","start":"2026-10-03","end":"bad"}')).toEqual({ name: 'Ouray', start: '2026-10-03', end: null });
    expect(parseTrip('nope').name).toBe('San Juans 2026');
  });

  it('filters by date range and sorts oldest first', () => {
    expect(tripCaptures(caps, parseTrip(null)).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    const local = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    expect(tripCaptures(caps, { name: 'x', start: local(caps[0]!.createdAt), end: null }).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('summarises a trip, tolerating captures without GPS or analysis', () => {
    const s = tripStats(tripCaptures(caps, parseTrip(null)));
    expect(s.photos).toBe(3);
    expect(s.minAlt).toBe(2800);
    expect(s.maxAlt).toBe(3300);
    expect(s.withGeo).toBe(2);
    expect(s.avgWarm).toBeCloseTo(0.4, 6);
  });

  it('orders poster items by time or elevation, skipping what is missing', () => {
    expect(posterItems(caps, 'stripes-time').map((i) => i.palette[0]?.hex)).toEqual(['#2e4a3b', '#e9b825']);
    expect(posterItems(caps, 'stripes-elevation')).toHaveLength(1); // only b has both palette and altitude
  });
});

describe('poster geometry', () => {
  it('splits by weights', () => {
    expect(splitByWeights(100, [1, 3])).toEqual([[0, 25], [25, 75]]);
    expect(splitByWeights(10, [0, 0])).toEqual([[0, 0], [0, 0]]);
  });

  it('makes roughly square grids', () => {
    expect(gridDims(12, 400, 600)).toEqual([3, 4]);
    expect(gridDims(1, 400, 600)).toEqual([1, 1]);
    const [c, r] = gridDims(50, 4660, 6870);
    expect(c * r).toBeGreaterThanOrEqual(50);
  });
});
