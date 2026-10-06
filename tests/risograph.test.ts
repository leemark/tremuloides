import { describe, expect, it } from 'vitest';
import { COMBOS, INKS, PAPER, densities, separation } from '../src/lenses/risograph/separation';
import { hexToSrgb, srgbToLinear } from '../src/color/oklab';

const lin = (hex: string): [number, number, number] => {
  const s = hexToSrgb(hex);
  return [srgbToLinear(s[0]), srgbToLinear(s[1]), srgbToLinear(s[2])];
};

describe('risograph separation', () => {
  it('paper prints no ink', () => {
    for (const c of Object.values(COMBOS)) for (const d of densities(separation(c.inks), lin(PAPER))) expect(d).toBeLessThan(0.02);
  });

  it('each pure ink separates onto its own drum', () => {
    for (const c of Object.values(COMBOS)) {
      const sep = separation(c.inks);
      c.inks.forEach((name, i) => {
        const d = densities(sep, lin(INKS[name]));
        expect(d[i], `${name} in ${c.label}`).toBeGreaterThan(0.85);
        d.forEach((v, j) => {
          if (j !== i) expect(v, `${name} leaking into ${c.inks[j]}`).toBeLessThan(0.2);
        });
      });
    }
  });

  it('dark pixels use plenty of every ink; pads to 3 slots', () => {
    const sep = separation(['pink', 'teal']);
    expect(sep.count).toBe(2);
    expect(sep.inks).toHaveLength(3);
    expect(sep.rows[2]).toEqual([0, 0, 0]);
    for (const d of densities(sep, [0.01, 0.01, 0.01])) expect(d).toBeGreaterThan(0.6);
  });
});
