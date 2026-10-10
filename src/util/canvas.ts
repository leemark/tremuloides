/**
 * Cross-browser canvas and bitmap helpers. Safari differs from Chrome in two ways that matter
 * here: OffscreenCanvas only arrived in Safari 16.4, and createImageBitmap's resize options
 * (resizeWidth/resizeHeight/resizeQuality) have not always been honoured. These helpers fall back
 * to a DOM canvas and to drawing the resize themselves, so every path works on iPhone too.
 */

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
