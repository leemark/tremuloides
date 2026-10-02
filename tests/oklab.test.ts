import { describe, expect, it } from 'vitest';
import { hexToSrgb, nearestIndex, oklabToOklch, oklabToSrgb, oklchToOklab, srgbToHex, srgbToOklab, type Vec3 } from '../src/color/oklab';

describe('Oklab', () => {
  it('maps white and black to L=1 and L=0 with no chroma', () => {
    const white = srgbToOklab([1, 1, 1]);
    const black = srgbToOklab([0, 0, 0]);
    expect(white[0]).toBeCloseTo(1, 4);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-4);
    expect(black[0]).toBeCloseTo(0, 6);
  });

  it('matches the published value for sRGB red', () => {
    const [L, a, b] = srgbToOklab([1, 0, 0]);
    expect(L).toBeCloseTo(0.62796, 3);
    expect(a).toBeCloseTo(0.22486, 3);
    expect(b).toBeCloseTo(0.12585, 3);
  });

  it('round-trips sRGB colors', () => {
    for (const hex of ['#e9b825', '#2e4a3b', '#4e86c8', '#a4412e', '#f3f2ec', '#1a1c21']) {
      expect(srgbToHex(oklabToSrgb(srgbToOklab(hexToSrgb(hex))))).toBe(hex);
    }
  });

  it('round-trips Oklch', () => {
    const lab: Vec3 = [0.7, 0.05, 0.12];
    const back = oklchToOklab(oklabToOklch(lab));
    back.forEach((v, i) => expect(v).toBeCloseTo(lab[i] as number, 9));
  });

  it('finds the nearest palette color', () => {
    const palette = ['#e9b825', '#2e4a3b', '#4e86c8'].map((h) => srgbToOklab(hexToSrgb(h)));
    expect(nearestIndex(srgbToOklab(hexToSrgb('#f0c030')), palette)).toBe(0);
    expect(nearestIndex(srgbToOklab(hexToSrgb('#305040')), palette)).toBe(1);
    expect(nearestIndex(srgbToOklab(hexToSrgb('#5590d0')), palette)).toBe(2);
  });

  it('rejects bad hex', () => {
    expect(() => hexToSrgb('gold')).toThrow();
  });
});
