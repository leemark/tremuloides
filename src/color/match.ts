import type { Vec3 } from './oklab';

/**
 * Palette matching used by Ink & Wash (mirrored in composite.frag.glsl; keep them in step).
 * Plain Oklab distance let muted browns and dark blues snap to spruce green, and mid-tone gold
 * jump to red, because lightness dominated and hue was ignored. Here lightness counts half,
 * and when both colors are clearly colored, a hue difference adds a penalty, so a color never
 * crosses into a different hue family just because the lightness is closer.
 */
export const MATCH_L_WEIGHT = 0.5;
export const MATCH_HUE_PENALTY = 0.1;

export function paletteDistance(p: Vec3, s: Vec3): number {
  const dL = p[0] - s[0];
  const dab = Math.hypot(p[1] - s[1], p[2] - s[2]);
  const d = Math.sqrt(MATCH_L_WEIGHT * dL * dL + dab * dab);
  const cp = Math.hypot(p[1], p[2]);
  const cs = Math.hypot(s[1], s[2]);
  const w = Math.min(1, Math.max(0, (cp - 0.015) / 0.03)) * Math.min(1, Math.max(0, (cs - 0.015) / 0.03));
  if (w === 0) return d;
  let dh = Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(s[2], s[1]));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  return d + (MATCH_HUE_PENALTY * w * dh) / Math.PI;
}

export function nearestPaletteIndex(p: Vec3, palette: readonly Vec3[]): number {
  let best = 0;
  let bestD = Infinity;
  palette.forEach((s, i) => {
    const d = paletteDistance(p, s);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
