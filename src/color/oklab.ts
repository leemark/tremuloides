/** sRGB / linear sRGB / Oklab / Oklch conversions (Björn Ottosson, 2020). Channels in [0, 1]. */

export type Vec3 = [number, number, number];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function linearRgbToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinearRgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function srgbToOklab(rgb: Vec3): Vec3 {
  return linearRgbToOklab([srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]);
}

export function oklabToSrgb(lab: Vec3): Vec3 {
  const [r, g, b] = oklabToLinearRgb(lab);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [clamp(linearToSrgb(r)), clamp(linearToSrgb(g)), clamp(linearToSrgb(b))];
}

/** Oklch: [L, C, h in degrees 0–360). */
export function oklabToOklch([L, a, b]: Vec3): Vec3 {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab([L, C, h]: Vec3): Vec3 {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

export function hexToSrgb(hex: string): Vec3 {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Invalid hex color: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function srgbToHex([r, g, b]: Vec3): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function oklabDistanceSq(p: Vec3, q: Vec3): number {
  const dL = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return dL * dL + da * da + db * db;
}

/** Index of the palette entry (Oklab) closest to `lab`. */
export function nearestIndex(lab: Vec3, palette: readonly Vec3[]): number {
  let best = 0;
  let bestD = Infinity;
  palette.forEach((p, i) => {
    const d = oklabDistanceSq(lab, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
