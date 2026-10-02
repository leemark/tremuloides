import { describe, expect, it } from 'vitest';
import { HISTORY_BUDGET_BYTES, burstFrames, fitHistorySize, previewHistoryPlan, slitPlan, slitSourceRange } from '../src/lenses/quake/plan';
import { quakeLens } from '../src/lenses/quake';
import { defaultParams } from '../src/lenses/params';
import { STILL_LENSES } from '../src/lenses/registry';

describe('quake plans', () => {
  it('sizes bursts to fit the memory budget, keeping aspect', () => {
    const frames = burstFrames(24);
    expect(frames).toBe(26);
    const [w, h] = fitHistorySize(1080, 1920, frames, 4096);
    expect(w * h * 4 * frames).toBeLessThanOrEqual(HISTORY_BUDGET_BYTES);
    expect(Math.abs(w / h - 1080 / 1920)).toBeLessThan(0.01);
    expect(fitHistorySize(640, 360, 4, 4096)).toEqual([640, 360]); // never upscales
    expect(burstFrames(64)).toBe(64);
  });

  it('keeps the preview history within budget', () => {
    const p = previewHistoryPlan(1080, 1920, 0.5, 4096);
    expect(p.width * p.height * 4 * p.frames).toBeLessThanOrEqual(HISTORY_BUDGET_BYTES);
    expect(p.frames).toBeGreaterThanOrEqual(24);
    expect(p.frames).toBeLessThanOrEqual(64);
  });

  it('plans slit-scan strips', () => {
    const s = slitPlan(1080, 1920, 4096);
    expect(s.height).toBe(1920);
    expect(s.slitWidth).toBe(8);
    expect(s.maxWidth % s.slitWidth).toBe(0);
    expect(s.maxWidth).toBeLessThanOrEqual(4096);
    expect(s.maxFrames).toBe(s.maxWidth / s.slitWidth);
    const [x0, x1] = slitSourceRange(1080, 1920, s.height, s.slitWidth);
    expect(x0).toBeLessThan(0.5);
    expect(x1).toBeGreaterThan(0.5);
    expect((x1 - x0) * 1080).toBeCloseTo(8, 6);
  });

  it('uses bursts for time modes and start/stop for slit-scan', () => {
    const p = defaultParams(quakeLens.params);
    expect(quakeLens.captureStyle?.(p)).toBe('burst');
    expect(quakeLens.captureStyle?.({ ...p, mode: 'slit' })).toBe('toggle');
    expect(quakeLens.kind).toBe('temporal');
  });

  it('is not offered for still images', () => {
    expect(STILL_LENSES.some((l) => l.id === 'quake')).toBe(false);
  });
});
