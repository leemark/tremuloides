import { describe, expect, it } from 'vitest';
import { planInkWash } from '../src/lenses/ink-wash/plan';
import { inkWashLens, SAN_JUAN_HEX } from '../src/lenses/ink-wash';
import { defaultParams } from '../src/lenses/params';
import { blendPalettes, extractPalette, paletteUniform } from '../src/color/palette';
import { DEFAULT_LENS_ID } from '../src/lenses/registry';
import { DEFAULT_SETTINGS } from '../src/storage/settings';

const params = defaultParams(inkWashLens.params);

describe('ink & wash plan', () => {
  it('keeps kernel footprints proportional to the short edge (preview matches final)', () => {
    const preview = planInkWash(720, 1280, params, 'preview');
    const final = planInkWash(3072, 4080, params, 'final');
    const ratio = 3072 / 720;
    expect(final.kuwaharaRadius / preview.kuwaharaRadius).toBeCloseTo(ratio, 6);
    expect(final.inkSigma / preview.inkSigma).toBeCloseTo(ratio, 6);
    expect(final.flowLength / preview.flowLength).toBeCloseTo(ratio, 6);
    expect(planInkWash(1080, 1920, params, 'final').kuwaharaRadius).toBeCloseTo(6, 6);
  });

  it('final renders use at least Balanced sampling', () => {
    const fast = planInkWash(1080, 1920, { ...params, quality: 'fast' }, 'final');
    const balanced = planInkWash(1080, 1920, { ...params, quality: 'balanced' }, 'final');
    expect(fast.kuwaharaSamples).toBe(balanced.kuwaharaSamples);
    expect(planInkWash(1080, 1920, { ...params, quality: 'fast' }, 'preview').kuwaharaSamples).toBeLessThan(balanced.kuwaharaSamples);
  });

  it('keeps loops inside the shader bounds', () => {
    for (const [w, h] of [[200, 300], [1080, 1920], [8192, 6144]] as const) {
      for (const quality of ['fast', 'balanced', 'best']) {
        for (const kind of ['preview', 'final'] as const) {
          const p = planInkWash(w, h, { ...params, quality, lineWeight: 4 }, kind);
          expect(p.tensorTaps).toBeLessThanOrEqual(16);
          expect(p.inkTaps).toBeLessThanOrEqual(8);
          expect(p.kuwaharaSamples).toBeLessThanOrEqual(12);
          expect(p.tensorWidth).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('maps line amount to a threshold that decreases (more lines) as amount rises', () => {
    const none = planInkWash(1080, 1920, { ...params, lineAmount: 0 }, 'final').inkThreshold;
    const lots = planInkWash(1080, 1920, { ...params, lineAmount: 1 }, 'final').inkThreshold;
    expect(lots).toBeLessThan(none);
    expect(lots).toBeGreaterThan(0);
  });
});

describe('palettes', () => {
  it('extracts a deterministic palette sorted dark to light', () => {
    const px = new Uint8ClampedArray(4 * 300);
    const cols = [[233, 184, 37], [46, 74, 59], [78, 134, 200]];
    for (let i = 0; i < 300; i++) px.set([...(cols[i % 3] as number[]), 255], i * 4);
    const a = extractPalette(px, 3, 1);
    expect(a).toEqual(extractPalette(px, 3, 1));
    expect(a.colors).toHaveLength(3);
    for (let i = 1; i < 3; i++) expect(a.colors[i]![0]).toBeGreaterThanOrEqual(a.colors[i - 1]![0]);
  });

  it('eases between palettes of equal size and replaces otherwise', () => {
    const prev: [number, number, number][] = [[0, 0, 0]];
    const next: [number, number, number][] = [[1, 0.2, 0.2]];
    expect(blendPalettes(prev, next, 0.5)[0]).toEqual([0.5, 0.1, 0.1]);
    expect(blendPalettes(null, next, 0.5)).toBe(next);
  });

  it('packs at most 12 colors for the shader', () => {
    expect(paletteUniform(new Array(20).fill([0.5, 0, 0])).length).toBe(36);
    expect(SAN_JUAN_HEX).toHaveLength(9);
  });
});

describe('defaults', () => {
  it('Ink & Wash is the default lens', () => {
    expect(DEFAULT_LENS_ID).toBe('ink-wash');
    expect(DEFAULT_SETTINGS.currentLens).toBe('ink-wash');
  });
});
