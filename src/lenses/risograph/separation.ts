import { hexToSrgb, srgbToLinear } from '../../color/oklab';

/** Real Risograph ink colours (approximate sRGB of the printed ink on white paper). */
export const INKS = {
  pink: '#ff48b0', // Fluorescent Pink
  teal: '#00838a',
  blue: '#0078bf',
  yellow: '#ffe800',
  orange: '#ff6c2f',
  red: '#f15060', // Bright Red
  black: '#2b2a2e',
  green: '#00a95c',
} as const;
export type InkName = keyof typeof INKS;

export const COMBOS: Record<string, { label: string; inks: InkName[] }> = {
  pinkteal: { label: 'Pink + Teal', inks: ['pink', 'teal'] },
  pinkblueyellow: { label: 'Pink + Blue + Yellow', inks: ['pink', 'blue', 'yellow'] },
  orangeblue: { label: 'Orange + Blue', inks: ['orange', 'blue'] },
  redblack: { label: 'Red + Black', inks: ['red', 'black'] },
  greenpink: { label: 'Green + Pink', inks: ['green', 'pink'] },
};

export const PAPER = '#f4f0e6';

type V3 = [number, number, number];

function linear(hex: string): V3 {
  const s = hexToSrgb(hex);
  return [srgbToLinear(s[0]), srgbToLinear(s[1]), srgbToLinear(s[2])];
}

/** Optical density of a colour printed on paper, per channel: −ln(colour / paper). */
export function absorbance(rgbLinear: V3, paperLinear: V3): V3 {
  return [0, 1, 2].map((i) => Math.max(0, -Math.log(Math.max(1e-3, rgbLinear[i] ?? 0) / Math.max(1e-3, paperLinear[i] ?? 1)))) as V3;
}

function inv3(m: number[][]): number[][] {
  const [a, b, c] = m as [number[], number[], number[]];
  const [a0, a1, a2] = a as [number, number, number];
  const [b0, b1, b2] = b as [number, number, number];
  const [c0, c1, c2] = c as [number, number, number];
  const det = a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0);
  const d = Math.abs(det) < 1e-12 ? 1e-12 : det;
  return [
    [(b1 * c2 - b2 * c1) / d, (a2 * c1 - a1 * c2) / d, (a1 * b2 - a2 * b1) / d],
    [(b2 * c0 - b0 * c2) / d, (a0 * c2 - a2 * c0) / d, (a2 * b0 - a0 * b2) / d],
    [(b0 * c1 - b1 * c0) / d, (a1 * c0 - a0 * c1) / d, (a0 * b1 - a1 * b0) / d],
  ];
}

export interface Separation {
  /** Inks' linear colours (for compositing), padded to 3 with white. */
  inks: V3[];
  count: number;
  paper: V3;
  /** Rows of the least-squares solve: density_i = dot(rows[i], absorbance(pixel)). Padded with zeros. */
  rows: V3[];
}

/**
 * Least-squares separation in absorbance space (Beer–Lambert: stacked inks add densities).
 * With 1–2 inks: pseudo-inverse (MᵀM)⁻¹Mᵀ; with 3: a ridge-regularised inverse.
 */
export function separation(inkNames: readonly InkName[], paperHex = PAPER): Separation {
  const paper = linear(paperHex);
  const inks = inkNames.slice(0, 3).map((n) => linear(INKS[n]));
  const A = inks.map((c) => absorbance(c, paper)); // n vectors of 3
  const n = A.length;
  // Normal matrix (n×n), padded to 3×3 with identity so inv3 works for n < 3.
  const N = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i < n && j < n ? [0, 1, 2].reduce((s, k) => s + (A[i]?.[k] ?? 0) * (A[j]?.[k] ?? 0), 0) + (i === j ? 1e-3 : 0) : i === j ? 1 : 0)));
  const Ninv = inv3(N);
  const rows: V3[] = [0, 1, 2].map((i) =>
    i < n ? ([0, 1, 2].map((k) => [0, 1, 2].reduce((s, j) => s + (j < n ? (Ninv[i]?.[j] ?? 0) * (A[j]?.[k] ?? 0) : 0), 0)) as V3) : [0, 0, 0],
  );
  while (inks.length < 3) inks.push([1, 1, 1]);
  return { inks, count: n, paper, rows };
}

/** Ink densities (clamped 0–1) for a linear RGB pixel. Mirrors the shader. */
export function densities(sep: Separation, rgbLinear: V3): number[] {
  const a = absorbance(rgbLinear, sep.paper);
  return sep.rows.slice(0, sep.count).map((r) => Math.min(1, Math.max(0, r[0] * a[0] + r[1] * a[1] + r[2] * a[2])));
}
