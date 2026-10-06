import { describe, expect, it } from 'vitest';
import { REVEAL_TIMELINE as T, revealDuration, revealPosition, sideBySideLayout } from '../src/app/compare';

describe('before/after reveal', () => {
  it('starts and ends on the original, holds on the lens in the middle', () => {
    expect(revealPosition(0)).toBe(0);
    expect(revealPosition(T.before + T.wipe + T.after / 2)).toBe(1);
    expect(revealPosition(revealDuration() - 0.01)).toBe(0);
  });

  it('wipes smoothly and monotonically', () => {
    let prev = -1;
    for (let s = T.before; s <= T.before + T.wipe; s += 0.05) {
      const p = revealPosition(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
    expect(revealPosition(T.before + T.wipe / 2)).toBeCloseTo(0.5, 5);
  });

  it('lays out two panels side by side within the size cap', () => {
    const L = sideBySideLayout(3072, 4080);
    expect(L.width).toBeLessThanOrEqual(2400);
    expect(L.width).toBe(L.panelW * 2 + L.gap);
    expect(L.panelH / L.panelW).toBeCloseTo(4080 / 3072, 2);
    expect(sideBySideLayout(400, 300).panelW).toBe(400);
    expect(sideBySideLayout(1542, 2048).width).toBeLessThanOrEqual(2400);
  });
});
