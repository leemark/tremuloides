/**
 * Crop and quarter-turn rotation geometry (pure, unit-tested).
 *
 * A crop is a rectangle in normalised coordinates (0..1) of the image *after* it has been turned
 * `quarter` times clockwise, which is what the person sees in the crop screen. `toSourceRect` maps
 * it back to pixels of the unrotated, upright (EXIF-applied) source.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Quarter = 0 | 1 | 2 | 3;

export interface CropState {
  rect: Rect;
  /** Clockwise quarter turns. */
  quarter: Quarter;
}

export const FULL_RECT: Readonly<Rect> = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

export function noCrop(): CropState {
  return { rect: { ...FULL_RECT }, quarter: 0 };
}

const EPS = 1e-3;

export function isNoCrop(c: CropState): boolean {
  const r = c.rect;
  return c.quarter === 0 && Math.abs(r.x) < EPS && Math.abs(r.y) < EPS && Math.abs(r.w - 1) < EPS && Math.abs(r.h - 1) < EPS;
}

/** Size of a w×h image after `quarter` clockwise turns. */
export function rotatedSize(w: number, h: number, quarter: Quarter): [number, number] {
  return quarter % 2 ? [h, w] : [w, h];
}

/** Turns a normalised rect along with its image, one quarter clockwise. */
export function rotateRectCW(r: Rect): Rect {
  return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
}

/** Inverse of rotateRectCW. */
export function rotateRectCCW(r: Rect): Rect {
  return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
}

/** Turns the image (and the crop with it) a quarter clockwise. */
export function rotateCrop(c: CropState): CropState {
  return { rect: rotateRectCW(c.rect), quarter: ((c.quarter + 1) % 4) as Quarter };
}

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output size (after rotation). */
  outW: number;
  outH: number;
}

/** Pixel rectangle of the unrotated source to read, and the output size after rotation. */
export function toSourceRect(c: CropState, srcW: number, srcH: number): SourceRect {
  let r = c.rect;
  for (let i = 0; i < c.quarter; i++) r = rotateRectCCW(r);
  const x0 = clamp(Math.round(r.x * srcW), 0, srcW - 1);
  const y0 = clamp(Math.round(r.y * srcH), 0, srcH - 1);
  const x1 = clamp(Math.round((r.x + r.w) * srcW), x0 + 1, srcW);
  const y1 = clamp(Math.round((r.y + r.h) * srcH), y0 + 1, srcH);
  const sw = x1 - x0;
  const sh = y1 - y0;
  const [outW, outH] = rotatedSize(sw, sh, c.quarter);
  return { sx: x0, sy: y0, sw, sh, outW, outH };
}

// ---------- Interaction (pixel space of the displayed, rotated image) ----------

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export interface Size {
  w: number;
  h: number;
}

export function toPixels(r: Rect, s: Size): Rect {
  return { x: r.x * s.w, y: r.y * s.h, w: r.w * s.w, h: r.h * s.h };
}

export function toNormalized(r: Rect, s: Size): Rect {
  return { x: r.x / s.w, y: r.y / s.h, w: r.w / s.w, h: r.h / s.h };
}

/** Largest rect of `aspect` (w/h) inside the image, centred on `center` (default: image centre). */
export function fitAspect(s: Size, aspect: number, center?: { x: number; y: number }): Rect {
  let w = Math.min(s.w, s.h * aspect);
  let h = w / aspect;
  if (h > s.h) {
    h = s.h;
    w = h * aspect;
  }
  const cx = center?.x ?? s.w / 2;
  const cy = center?.y ?? s.h / 2;
  return { x: clamp(cx - w / 2, 0, s.w - w), y: clamp(cy - h / 2, 0, s.h - h), w, h };
}

/** Applies an aspect to an existing crop: the largest rect of that aspect that fits, centred on the crop. */
export function withAspect(r: Rect, s: Size, aspect: number | null): Rect {
  if (aspect === null) return r;
  return fitAspect(s, aspect, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

/**
 * Drags a handle (or the whole rect) by (dx, dy) image pixels. Keeps the rect inside the image,
 * at least `min` pixels on each side, and at `aspect` (w/h) when one is locked.
 */
export function dragRect(start: Rect, handle: Handle, dx: number, dy: number, s: Size, aspect: number | null, min: number): Rect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, s.w - start.w), y: clamp(start.y + dy, 0, s.h - start.h) };
  }
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const x1 = start.x + start.w;
  const y1 = start.y + start.h;

  if (aspect === null) {
    let ax = start.x;
    let bx = x1;
    let ay = start.y;
    let by = y1;
    if (west) ax = clamp(start.x + dx, 0, x1 - min);
    if (east) bx = clamp(x1 + dx, start.x + min, s.w);
    if (north) ay = clamp(start.y + dy, 0, y1 - min);
    if (south) by = clamp(y1 + dy, start.y + min, s.h);
    return { x: ax, y: ay, w: bx - ax, h: by - ay };
  }

  const minW = Math.max(min, min * aspect);
  const corner = (west || east) && (north || south);
  if (corner) {
    // Anchor the opposite corner; size from the average of both proposals.
    const ax = west ? x1 : start.x;
    const ay = north ? y1 : start.y;
    const wProp = start.w + (west ? -dx : dx);
    const hProp = start.h + (north ? -dy : dy);
    const maxW = Math.min(west ? ax : s.w - ax, (north ? ay : s.h - ay) * aspect);
    const w = clamp((wProp + hProp * aspect) / 2, Math.min(minW, maxW), maxW);
    const h = w / aspect;
    return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
  }
  if (west || east) {
    // Horizontal edge: width follows the drag, height grows about the vertical centre.
    const ax = west ? x1 : start.x;
    const cy = start.y + start.h / 2;
    const maxW = Math.min(west ? ax : s.w - ax, 2 * Math.min(cy, s.h - cy) * aspect);
    const w = clamp(start.w + (west ? -dx : dx), Math.min(minW, maxW), maxW);
    const h = w / aspect;
    return { x: west ? ax - w : ax, y: cy - h / 2, w, h };
  }
  // Vertical edge.
  const ay = north ? y1 : start.y;
  const cx = start.x + start.w / 2;
  const maxH = Math.min(north ? ay : s.h - ay, (2 * Math.min(cx, s.w - cx)) / aspect);
  const h = clamp(start.h + (north ? -dy : dy), Math.min(minW / aspect, maxH), maxH);
  const w = h * aspect;
  return { x: cx - w / 2, y: north ? ay - h : ay, w, h };
}

/** Which handle a point (image pixels) grabs, given a touch slop in image pixels. */
export function hitHandle(r: Rect, px: number, py: number, slop: number): Handle | null {
  const nearL = Math.abs(px - r.x) <= slop;
  const nearR = Math.abs(px - (r.x + r.w)) <= slop;
  const nearT = Math.abs(py - r.y) <= slop;
  const nearB = Math.abs(py - (r.y + r.h)) <= slop;
  const inX = px >= r.x - slop && px <= r.x + r.w + slop;
  const inY = py >= r.y - slop && py <= r.y + r.h + slop;
  if (!inX || !inY) return null;
  if (nearT && nearL) return 'nw';
  if (nearT && nearR) return 'ne';
  if (nearB && nearL) return 'sw';
  if (nearB && nearR) return 'se';
  if (nearT) return 'n';
  if (nearB) return 's';
  if (nearL) return 'w';
  if (nearR) return 'e';
  return 'move';
}

export interface AspectPreset {
  id: string;
  label: string;
  /** w/h, `null` for free, 'original' for the photo's own shape. */
  ratio: number | null | 'original';
}

export const ASPECTS: readonly AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 'original' },
  { id: '1:1', label: 'Square', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

/** Resolves a preset to a w/h ratio for an image of the given (rotated) size. */
export function aspectRatio(p: AspectPreset, s: Size): number | null {
  return p.ratio === 'original' ? s.w / s.h : p.ratio;
}

/** Output scale that keeps w×h under `maxPixels` (Safari caps canvases at ~16.7 MP). */
export function capScale(w: number, h: number, maxPixels: number): number {
  return Math.min(1, Math.sqrt(maxPixels / Math.max(1, w * h)));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
