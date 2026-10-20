/**
 * Cross-browser canvas and bitmap helpers. Safari differs from Chrome in two ways that matter
 * here: OffscreenCanvas only arrived in Safari 16.4, and createImageBitmap's resize options
 * (resizeWidth/resizeHeight/resizeQuality) have not always been honoured. These helpers fall back
 * to a DOM canvas and to drawing the resize themselves, so every path works on iPhone too.
 */

import { capScale, rotatedSize, toSourceRect, type CropState } from './crop';

export type Canvas2D = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D };

export function canvas2d(w: number, h: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (ctx) return { canvas, ctx };
    } catch {
      /* fall through to a DOM canvas */
    }
  }
  if (typeof document === 'undefined') throw new Error('No 2D canvas available here');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

/** Decodes a blob upright (EXIF orientation applied). */
export function decodeUpright(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/**
 * Resizes a blob or bitmap to exactly w×h. Uses createImageBitmap's resize options when the
 * browser honours them, otherwise draws the resize on a canvas. A blob source is decoded upright.
 * A bitmap passed in is not closed.
 */
export async function resizeTo(source: Blob | ImageBitmap, w: number, h: number): Promise<ImageBitmap> {
  const opts: ImageBitmapOptions = { resizeWidth: w, resizeHeight: h, resizeQuality: 'high', ...(source instanceof Blob ? { imageOrientation: 'from-image' } : {}) };
  try {
    const bmp = await createImageBitmap(source, opts);
    if (bmp.width === w && bmp.height === h) return bmp;
    bmp.close(); // options ignored: resize by drawing instead
  } catch {
    /* fall through */
  }
  const full = source instanceof Blob ? await decodeUpright(source) : source;
  try {
    const { canvas, ctx } = canvas2d(w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, w, h);
    return await createImageBitmap(canvas);
  } finally {
    if (full !== source) full.close();
  }
}

/** Safari refuses canvases above ~16.7 MP, so crops are capped there on every browser. */
export const MAX_CANVAS_PIXELS = 16_777_216;

/**
 * Crops (and quarter-turns) a bitmap. The source is not closed. Plain crops use
 * createImageBitmap's source rectangle; rotations and oversized crops are drawn on a canvas.
 */
export async function cropBitmap(source: ImageBitmap, crop: CropState, maxPixels = MAX_CANVAS_PIXELS): Promise<ImageBitmap> {
  const r = toSourceRect(crop, source.width, source.height);
  const scale = capScale(r.outW, r.outH, maxPixels);
  if (crop.quarter === 0 && scale === 1) {
    try {
      const bmp = await createImageBitmap(source, r.sx, r.sy, r.sw, r.sh);
      if (bmp.width === r.sw && bmp.height === r.sh) return bmp;
      bmp.close();
    } catch {
      /* fall through to drawing it */
    }
  }
  const tw = Math.max(1, Math.round(r.outW * scale));
  const th = Math.max(1, Math.round(r.outH * scale));
  const [dw, dh] = rotatedSize(tw, th, crop.quarter); // unrotated draw size
  const { canvas, ctx } = canvas2d(tw, th);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(tw / 2, th / 2);
  ctx.rotate((crop.quarter * Math.PI) / 2);
  ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, -dw / 2, -dh / 2, dw, dh);
  return createImageBitmap(canvas);
}

/** Encodes a bitmap as JPEG. */
export async function bitmapToJpeg(bitmap: ImageBitmap, quality = 0.95): Promise<Blob> {
  const { canvas, ctx } = canvas2d(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), 'image/jpeg', quality));
}
