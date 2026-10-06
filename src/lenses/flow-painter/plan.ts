/** Pure planning for Flow Painter: brush sizes, stroke grids and batches (all unit-tested). */

export interface PaintParams {
  detail: number; // 0.5–2: stroke density and how readily fine layers paint
  strokeLength: number; // ref px (finest layer)
  strokeWidth: number; // ref px (finest layer)
  layers: number; // 1–4
}

export interface LayerPlan {
  index: number;
  /** Brush width and stroke length in output px. */
  width: number;
  length: number;
  /** Stroke grid: one stroke per cell, cells visited in a scrambled order. */
  cols: number;
  rows: number;
  count: number;
  /** Cell size in output px. */
  cell: number;
  /** Mip level whose blur matches the brush (color source). */
  lod: number;
  /** Mip level of the previous (coarser) layer; −1 for the first layer, which paints everywhere. */
  prevLod: number;
  /** Multiplier coprime with `count` that scrambles the drawing order. */
  prime: number;
}

/** Average number of strokes covering each pixel per layer, at Detail 1. */
export const COVERAGE = 2.2;
/** The first (coarsest) layer is denser so no bare canvas shows through. */
export const BASE_COVERAGE_BOOST = 2;
/** Points along each stroke spine (vertices = 2 × (segments + 1)). */
export const FINAL_SEGMENTS = 12;
export const PREVIEW_SEGMENTS = 8;
/** Live preview draws at most this many strokes (coarsest layers first). */
export const PREVIEW_BUDGET = 24000;
/** Strokes per draw call in the final render, between which the UI gets a turn. */
export const BATCH = 3000;

const PRIMES = [7919, 7907, 7901, 7883, 7879, 7877, 7873, 7867, 7853, 7841];

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function coprimeMultiplier(n: number): number {
  for (const p of PRIMES) if (gcd(p, n) === 1) return p % Math.max(1, n) || 1;
  return 1;
}

/** Layers from coarse to fine. The finest brush is Stroke width; each coarser layer doubles it. */
export function planLayers(width: number, height: number, p: PaintParams): LayerPlan[] {
  const ref = Math.min(width, height) / 1080;
  const n = Math.max(1, Math.min(4, Math.round(p.layers)));
  const detail = Math.max(0.25, p.detail);
  const out: LayerPlan[] = [];
  let prevLod = -1;
  for (let i = 0; i < n; i++) {
    const scale = 2 ** (n - 1 - i);
    const w = Math.max(1, p.strokeWidth * scale * ref);
    const l = Math.max(w, p.strokeLength * Math.sqrt(scale) * ref);
    const cell = Math.max(1, Math.sqrt((w * l) / (COVERAGE * detail * (i === 0 ? BASE_COVERAGE_BOOST : 1))));
    const cols = Math.max(1, Math.ceil(width / cell));
    const rows = Math.max(1, Math.ceil(height / cell));
    const count = cols * rows;
    const lod = Math.max(0, Math.log2(w / 2));
    out.push({ index: i, width: w, length: l, cols, rows, count, cell, lod, prevLod, prime: coprimeMultiplier(count) });
    prevLod = lod;
  }
  return out;
}

/** For the live preview: keep the coarsest layers that fit the stroke budget (always at least one). */
export function previewLayers(layers: LayerPlan[], budget = PREVIEW_BUDGET): LayerPlan[] {
  const out: LayerPlan[] = [];
  let total = 0;
  for (const l of layers) {
    if (out.length && total + l.count > budget) break;
    out.push(l);
    total += l.count;
  }
  return out;
}

export interface Batch {
  layer: number;
  first: number;
  count: number;
}

/** Splits every layer into draw batches, in painting order. */
export function batches(layers: LayerPlan[], size = BATCH): Batch[] {
  const out: Batch[] = [];
  for (const l of layers) for (let f = 0; f < l.count; f += size) out.push({ layer: l.index, first: f, count: Math.min(size, l.count - f) });
  return out;
}

export function totalStrokes(layers: LayerPlan[]): number {
  return layers.reduce((n, l) => n + l.count, 0);
}

/** Timelapse pacing: the stroke phase lasts `seconds` at `fps`, so each frame adds this many strokes. */
export function timelapseBatch(layers: LayerPlan[], seconds: number, fps: number): number {
  return Math.max(1, Math.ceil(totalStrokes(layers) / Math.max(1, Math.round(seconds * fps))));
}
