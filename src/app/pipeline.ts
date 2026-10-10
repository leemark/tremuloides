import type { Renderer } from '../gl/renderer';
import { finalRenderSize } from '../gl/fit';
import type { Lens, Params } from '../lenses/types';
import type { Settings } from '../storage/settings';
import { resizeTo } from '../util/canvas';
import type { OverlayConfig } from '../gl/overlay';

export interface RenderedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  type: string;
}

/** Long-edge cap for final renders, from the setting and the GPU limit. */
export function maxRenderEdge(settings: Settings, maxTextureSize: number): number {
  const cap = settings.maxRenderEdge === 0 ? maxTextureSize : settings.maxRenderEdge;
  return Math.max(256, Math.min(cap, maxTextureSize));
}

/** Decodes (respecting EXIF orientation) and downsizes to fit `maxEdge`. */
export async function decodeForRender(source: Blob | ImageBitmap, maxEdge: number): Promise<ImageBitmap> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source, { imageOrientation: 'from-image' }) : source;
  const [w, h] = finalRenderSize(bitmap.width, bitmap.height, maxEdge);
  if (w === bitmap.width && h === bitmap.height) return bitmap;
  const resized = await resizeTo(bitmap, w, h);
  bitmap.close();
  return resized;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality);
  });
}

/** ~400 px JPEG thumbnail from any drawable source. */
export async function makeThumb(source: CanvasImageSource, w: number, h: number, long = 400): Promise<Blob> {
  const s = Math.min(1, long / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(h * s));
  const c = makeCanvas(tw, th);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, tw, th);
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

/** Runs a lens at full resolution on a decoded, correctly-sized bitmap and encodes the result. */
export async function renderToImage(
  renderer: Renderer,
  bitmap: ImageBitmap,
  lens: Lens,
  params: Params,
  seed: number,
  format: Settings['exportFormat'],
  onProgress?: (fraction: number) => void,
  overlay?: OverlayConfig | null,
): Promise<RenderedImage> {
  const { width, height } = bitmap;
  const pixels = await renderer.renderFinal(bitmap, width, height, lens, params, seed, onProgress, overlay);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.putImageData(pixels, 0, 0);
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, type, format === 'png' ? undefined : 0.92);
  const thumb = await makeThumb(canvas, width, height);
  return { blob, thumb, width, height, type };
}
