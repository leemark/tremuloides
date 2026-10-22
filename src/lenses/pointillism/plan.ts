/** Pure planning for Pointillism: dot sizes, dot grids, faces and the pigment palette (all unit-tested). */
import { hexPalette } from '../../color/palette';
import type { Vec3 } from '../../color/oklab';
import { FACE_INNER, FACE_REACH, coprimeMultiplier, faceEllipse, usableFaces, type FaceEllipse } from '../flow-painter/plan';
import type { FaceBox } from '../types';

export interface DotParams {
  dotSize: number; // ref px: the main layer's dot diameter
  detail: number; // 0.5–2: dot density, and how readily fine dots paint
}

export interface DotLayer {
  index: number;
  /** Dot diameter in output px. */
  size: number;
  /** Dot grid: one dot per cell, cells visited in a scrambled order. */
  cols: number;
  rows: number;
  count: number;
  /** Cell size in output px. */
  cell: number;
  /** Mip level whose blur matches the dot (color source). */
  lod: number;
  /** Mip level of the previous layer; −1 for a layer that paints everywhere. */
  prevLod: number;
  /** Multiplier coprime with `count` that scrambles the drawing order. */
  prime: number;
  /** Grid origin, output px (faces' grids start at their ellipse). */
  originX: number;
  originY: number;
  /** ≥ 0: this layer is that face's own (see planFaces). */
  face: number;
}

/**
 * Layers, each relative to Dot size: a ground of big dots that covers the canvas, the main dots
 * everywhere, then small dots only where the picture has detail the main dots blur.
 */
export const LAYERS = [
  { scale: 1.8, coverage: 1.2 },
  { scale: 1, coverage: 1.7 },
  { scale: 0.6, coverage: 1.7 },
] as const;
/** Dots per draw call in the final render, between which the UI gets a turn. */
export const BATCH = 20000;

function grid(index: number, size: number, coverage: number, detail: number, x0: number, y0: number, x1: number, y1: number, prevLod: number, face: number): DotLayer {
  // a dot covers ~0.8 × size² (round, a little irregular): `coverage` dots over each pixel
  const cell = Math.max(1, Math.sqrt((0.8 * size * size) / (coverage * detail)));
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((y1 - y0) / cell));
  const count = cols * rows;
  return { index, size, cols, rows, count, cell, lod: Math.max(0, Math.log2(size / 2)), prevLod, prime: coprimeMultiplier(count), originX: x0, originY: y0, face };
}

export function planLayers(width: number, height: number, p: DotParams): DotLayer[] {
  const ref = Math.min(width, height) / 1080;
  const detail = Math.max(0.25, p.detail);
  const out: DotLayer[] = [];
  let prevLod = -1;
  LAYERS.forEach((l, i) => {
    const size = Math.max(1.5, p.dotSize * l.scale * ref);
    // the main dots paint everywhere too (pigment over the ground); only the fine ones are gated
    const layer = grid(i, size, l.coverage, detail, 0, 0, width, height, i < 2 ? -1 : prevLod, -1);
    out.push(layer);
    prevLod = layer.lod;
  });
  return out;
}

/** Faces get dots this many times finer than their width, so eyes and mouths are a few dots across. */
export const FACE_DOTS = 40;
/** Never finer than this (ref px). */
export const FACE_MIN_DOT = 1.5;
/** Dots cover each face pixel this many times at Detail 1. */
export const FACE_COVERAGE = 3;
/** Regular dots more than this many times a face's dot stay out of that face (also in dot.vert). */
export const FACE_KEEP_OUT = 1.6;

export interface FaceDots extends DotLayer {
  ellipse: FaceEllipse;
}

/**
 * One layer of fine dots per face (Flow Painter's faces: the same ellipse and the same blend, from
 * FACE_INNER to FACE_REACH), painted after the regular layers.
 */
export function planFaces(faces: readonly FaceBox[] | undefined, width: number, height: number, p: DotParams, layers: DotLayer[]): FaceDots[] {
  const ref = Math.min(width, height) / 1080;
  const detail = Math.max(0.25, p.detail);
  const main = layers[1]?.size ?? Math.max(1.5, p.dotSize * ref);
  return usableFaces(faces, width, height).map((f, i) => {
    const e = faceEllipse(f, width, height);
    const size = Math.max(1, Math.min(main, Math.max(FACE_MIN_DOT * ref, (f.w * width) / FACE_DOTS)));
    const x0 = Math.max(0, Math.floor(e.cx - FACE_REACH * e.rx));
    const y0 = Math.max(0, Math.floor(e.cy - FACE_REACH * e.ry));
    const x1 = Math.min(width, Math.ceil(e.cx + FACE_REACH * e.rx));
    const y1 = Math.min(height, Math.ceil(e.cy + FACE_REACH * e.ry));
    return { ...grid(layers.length + i, size, FACE_COVERAGE, detail, x0, y0, x1, y1, -1, i), ellipse: e };
  });
}

export { FACE_INNER, FACE_REACH };

export interface Batch {
  layer: number;
  first: number;
  count: number;
}

export function batches(layers: DotLayer[], size = BATCH): Batch[] {
  const out: Batch[] = [];
  for (const l of layers) for (let f = 0; f < l.count; f += size) out.push({ layer: l.index, first: f, count: Math.min(size, l.count - f) });
  return out;
}

/** The live viewfinder draws at most this many dots (whole layers, coarsest first). */
export const PREVIEW_BUDGET = 120000;

export function previewLayers(layers: DotLayer[], budget = PREVIEW_BUDGET): DotLayer[] {
  const out: DotLayer[] = [];
  let total = 0;
  for (const l of layers) {
    if (out.length && total + l.count > budget) break;
    out.push(l);
    total += l.count;
  }
  return out;
}

export function totalDots(layers: DotLayer[]): number {
  return layers.reduce((n, l) => n + l.count, 0);
}

/**
 * Pigments, after the colors Seurat and Signac laid side by side (pure pigments and their tints with
 * white; no black: darks are deep blues, violets and earth). Each dot takes the pigment nearest its
 * color plus a random push, so neighboring dots differ and blend back to the photo's color at a
 * distance (dithering in Oklab).
 */
export const PALETTES: Record<string, readonly string[]> = {
  seurat: [
    '#f6f1e4', // lead white
    '#f7e08a', // pale chrome yellow
    '#f0c419', // chrome yellow
    '#e8892a', // orange
    '#d8452b', // vermilion
    '#b4284a', // madder lake
    '#f2b3a3', // vermilion + white
    '#c98fc0', // violet + white
    '#7b4a9e', // cobalt violet
    '#2c3a97', // ultramarine
    '#3f73c4', // cobalt blue
    '#9cc4e6', // cerulean + white
    '#3d9b5f', // emerald green
    '#bfdc8a', // green + white
    '#2a6656', // viridian
    '#c49a45', // yellow ochre
    '#7c4527', // burnt sienna
    '#272a56', // deep ultramarine + madder
    '#1f4a3a', // deep viridian
    '#3e2552', // deep violet
    '#3d2618', // umber
  ],
};

/** The palette as Oklab, for the dot shader. */
export function palette(id: string): Vec3[] {
  return hexPalette(PALETTES[id] ?? PALETTES.seurat ?? []);
}
export const MAX_PIGMENTS = 24;
