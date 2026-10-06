import { describe, expect, it } from 'vitest';
import { nearestPaletteIndex } from '../src/color/match';
import { hexPalette } from '../src/color/palette';
import { hexToSrgb, srgbToOklab } from '../src/color/oklab';
import { SAN_JUAN_HEX } from '../src/lenses/ink-wash';

const PAL = hexPalette(SAN_JUAN_HEX);
const name = (hex: string) => {
  const i = nearestPaletteIndex(srgbToOklab(hexToSrgb(hex)), PAL);
  return SAN_JUAN_HEX[i];
};
const SPRUCE = '#2e4a3b';
const RED = '#a4412e';

// Colors sampled from Mark's field photos (Oct 2026), where plain Oklab distance went wrong.
describe('San Juan palette matching', () => {
  it('keeps backlit brown leaves and gravel out of spruce green', () => {
    for (const hex of ['#40332d', '#4e4643', '#5f4f46', '#473625', '#68543d', '#624b3b', '#464045']) {
      expect(name(hex)).not.toBe(SPRUCE);
    }
    expect(name('#473625')).toBe('#5b4434'); // umber
  });

  it('keeps mid-tone gold out of iron red', () => {
    for (const hex of ['#926636', '#715e50', '#6f5745']) expect(name(hex)).not.toBe(RED);
  });

  it('maps dark blue sky to blue and hazy sky to pale sky', () => {
    expect(name('#38527b')).toBe('#4e86c8');
    expect(name('#c1d4da')).toBe('#b4d2ec');
  });

  it('still maps the obvious ones', () => {
    expect(name('#e9b825')).toBe('#e9b825');
    expect(name('#1f1c20')).toBe('#1a1c21');
    expect(name('#2e4a3b')).toBe(SPRUCE);
    expect(name('#f4f3ee')).toBe('#f3f2ec');
  });
});
