/** Pure planning for Flow Painter: brush sizes, stroke grids and batches (all unit-tested). */
import type { FaceBox } from '../types';

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

// ---------------------------------------------------------------- faces

export type { FaceBox };

/** Faces painted with their own brush (the shader's arrays hold this many). */
export const MAX_FACES = 8;
/** Faces narrower than this (output px) are left to the regular layers. */
export const MIN_FACE_PX = 24;
/** A face's brush is its width / this, so features (eyes, mouth) get a few strokes each. */
export const FACE_BRUSHES = 24;
/** Never finer than this (ref px), however small the face. */
export const FACE_MIN_WIDTH = 1.5;
/** Face strokes are this many brush widths long (short, so they shape features instead of crossing them). */
export const FACE_STROKE_ASPECT = 2.5;
/** Strokes cover each face pixel this many times at Detail 1 (denser than a regular layer: no gaps in a face). */
export const FACE_COVERAGE = 4;
/** Regular layers whose brush is more than this many times a face's brush stay out of that face. */
export const FACE_KEEP_OUT = 2;
/**
 * The ellipse painted as the face, around the detected box (which runs from the brows to the chin):
 * radii as fractions of the box, centre raised a little to take in the forehead.
 */
export const FACE_RX = 0.6;
export const FACE_RY = 0.62;
export const FACE_RAISE = 0.06;

export interface FaceEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A face's own layer: a regular layer plan whose grid covers only the face's ellipse. */
export interface FacePlan extends LayerPlan {
  face: number;
  /** Top-left of the stroke grid, output px. */
  originX: number;
  originY: number;
  ellipse: FaceEllipse;
}

export function faceEllipse(f: FaceBox, width: number, height: number): FaceEllipse {
  return {
    cx: (f.x + f.w / 2) * width,
    cy: (f.y + f.h / 2 - FACE_RAISE * f.h) * height,
    rx: FACE_RX * f.w * width,
    ry: FACE_RY * f.h * height,
  };
}

/** Faces worth their own brush: on the picture, big enough, the largest MAX_FACES. */
export function usableFaces(faces: readonly FaceBox[] | undefined, width: number, height: number): FaceBox[] {
  if (!faces) return [];
  return faces
    .filter((f) => [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 0 && f.h > 0)
    .filter((f) => f.x < 1 && f.y < 1 && f.x + f.w > 0 && f.y + f.h > 0)
    .filter((f) => f.w * width >= MIN_FACE_PX)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, MAX_FACES);
}

/**
 * One fine layer per face, drawn after the regular layers: brush = face width / FACE_BRUSHES, between
 * FACE_MIN_WIDTH and the finest regular brush. Layer indices continue after the regular layers, so
 * `batches` and the stroke hashes treat them like any other layer.
 */
export function planFaces(faces: readonly FaceBox[] | undefined, width: number, height: number, p: PaintParams, layers: LayerPlan[]): FacePlan[] {
  const ref = Math.min(width, height) / 1080;
  const detail = Math.max(0.25, p.detail);
  const finest = layers.length ? (layers[layers.length - 1] as LayerPlan).width : Math.max(1, p.strokeWidth * ref);
  return usableFaces(faces, width, height).map((f, i) => {
    const e = faceEllipse(f, width, height);
    const w = Math.max(1, Math.min(finest, Math.max(FACE_MIN_WIDTH * ref, (f.w * width) / FACE_BRUSHES)));
    const l = Math.max(w, Math.min(w * FACE_STROKE_ASPECT, p.strokeLength * ref));
    const cell = Math.max(1, Math.sqrt((w * l) / (FACE_COVERAGE * detail)));
    const x0 = Math.max(0, Math.floor(e.cx - e.rx));
    const y0 = Math.max(0, Math.floor(e.cy - e.ry));
    const x1 = Math.min(width, Math.ceil(e.cx + e.rx));
    const y1 = Math.min(height, Math.ceil(e.cy + e.ry));
    const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
    const rows = Math.max(1, Math.ceil((y1 - y0) / cell));
    const count = cols * rows;
    return {
      index: layers.length + i,
      width: w,
      length: l,
      cols,
      rows,
      count,
      cell,
      lod: Math.max(0, Math.log2(w / 2)),
      prevLod: -1,
      prime: coprimeMultiplier(count),
      face: i,
      originX: x0,
      originY: y0,
      ellipse: e,
    };
  });
}
