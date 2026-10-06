import type { Services } from './services';
import { canvasToBlob, decodeForRender, makeThumb, maxRenderEdge, renderToImage } from './pipeline';
import { getLens } from '../lenses/registry';
import { sanitizeParams } from '../lenses/params';
import type { CaptureResult, Lens, Params } from '../lenses/types';
import type { Capture, CaptureMethod, CaptureSource, GeoTag } from '../storage/types';
import { newId } from '../util/ids';
import { APP_VERSION } from '../version';
import { logEvent } from '../diagnostics/log';

export interface LensState {
  lens: Lens;
  params: Params;
}

/** The lens currently selected in the viewfinder, with its saved params. */
export function currentLensState(s: Services): LensState {
  const lens = getLens(s.settings.get().currentLens);
  return { lens, params: sanitizeParams(lens.params, s.settings.lensParams(lens.id)) };
}

export function lensStateFor(s: Services, lensId: string, params?: Params): LensState {
  const lens = getLens(lensId);
  return { lens, params: sanitizeParams(lens.params, params ?? s.settings.lensParams(lens.id)) };
}

export interface ProcessOptions {
  /** Decoded, upright source. Ownership passes to this function (it will be closed). */
  bitmap: ImageBitmap;
  originalBlob?: Blob;
  lens: Lens;
  params: Params;
  seed: number;
  source: CaptureSource;
  method?: CaptureMethod;
  parentId?: string;
  createdAt?: string;
  /** Resolved later; attached to the capture when it arrives. */
  geo?: Promise<GeoTag | null> | GeoTag | null;
}

/** Full-resolution render + encode + save. Never blocks on location. */
export async function processAndSave(s: Services, o: ProcessOptions): Promise<Capture> {
  const renderer = s.renderer;
  if (!renderer) throw new Error(s.rendererError ?? 'Renderer unavailable');
  const settings = s.settings.get();
  return s.busy.run(async () => {
    const sized = await decodeForRender(o.bitmap, maxRenderEdge(settings, renderer.maxTextureSize));
    let rendered;
    try {
      rendered = await renderToImage(renderer, sized, o.lens, o.params, o.seed, settings.exportFormat, (f) => s.busy.setProgress(f));
    } finally {
      s.busy.setProgress(null);
      sized.close();
      o.bitmap.close();
    }
    const id = newId();
    const capture = await s.store.save(
      {
        id,
        createdAt: o.createdAt ?? new Date().toISOString(),
        source: o.source,
        ...(o.parentId ? { parentId: o.parentId } : {}),
        outputType: rendered.type,
        lensId: o.lens.id,
        lensVersion: o.lens.version,
        params: o.params,
        seed: o.seed,
        width: rendered.width,
        height: rendered.height,
        ...(o.method ? { captureMethod: o.method } : {}),
        ...(o.geo && !(o.geo instanceof Promise) ? { geo: o.geo } : {}),
        appVersion: APP_VERSION,
      },
      {
        output: rendered.blob,
        thumb: rendered.thumb,
        ...(settings.keepOriginals && o.originalBlob ? { original: o.originalBlob } : {}),
      },
    );
    if (o.geo instanceof Promise) {
      void o.geo.then(async (geo) => {
        if (geo) {
          await s.store.setGeo(id, geo).catch((e: unknown) => logEvent('warn', 'geo', 'Could not save location', e));
        }
      });
    }
    return capture;
  });
}

function imageDataCanvas(img: ImageData): OffscreenCanvas | HTMLCanvasElement {
  let c: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(img.width, img.height);
  else {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
  }
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.putImageData(img, 0, 0);
  return c;
}

/** A small dark placeholder when no frame could be grabbed for a clip's thumbnail. */
async function placeholderThumb(): Promise<Blob> {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    ctx.fillStyle = '#24262b';
    ctx.fillRect(0, 0, 16, 16);
  }
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

/** Saves a recorded lens video clip. */
export async function saveClip(
  s: Services,
  o: {
    blob: Blob;
    type: string;
    durationMs: number;
    width: number;
    height: number;
    thumb: Blob | null;
    lens: Lens;
    params: Params;
    seed: number;
    createdAt: string;
    parentId?: string;
    geo?: Promise<GeoTag | null> | GeoTag | null;
  },
): Promise<Capture> {
  return s.busy.run(async () => {
    const thumb = o.thumb ?? (await placeholderThumb());
    const id = newId();
    const capture = await s.store.save(
      {
        id,
        createdAt: o.createdAt,
        source: o.parentId ? 'derived' : 'camera',
        ...(o.parentId ? { parentId: o.parentId } : {}),
        ...(o.geo && !(o.geo instanceof Promise) ? { geo: o.geo } : {}),
        outputType: o.type,
        lensId: o.lens.id,
        lensVersion: o.lens.version,
        params: o.params,
        seed: o.seed,
        width: o.width,
        height: o.height,
        captureMethod: 'video-clip',
        durationMs: Math.round(o.durationMs),
        appVersion: APP_VERSION,
      },
      { output: o.blob, thumb },
    );
    if (o.geo instanceof Promise) {
      void o.geo.then(async (geo) => {
        if (geo) await s.store.setGeo(id, geo).catch((e: unknown) => logEvent('warn', 'geo', 'Could not save location', e));
      });
    }
    return capture;
  });
}

/** Saves an already-rendered temporal capture (burst / slit-scan). */
export async function saveCaptureResult(
  s: Services,
  o: { result: CaptureResult; lens: Lens; params: Params; seed: number; createdAt: string; geo?: Promise<GeoTag | null> | null },
): Promise<Capture> {
  const settings = s.settings.get();
  return s.busy.run(async () => {
    const { image, original, method } = o.result;
    const canvas = imageDataCanvas(image);
    const type = settings.exportFormat === 'png' ? 'image/png' : 'image/jpeg';
    const output = await canvasToBlob(canvas, type, settings.exportFormat === 'png' ? undefined : 0.92);
    const thumb = await makeThumb(canvas, image.width, image.height);
    const originalBlob = original && settings.keepOriginals ? await canvasToBlob(imageDataCanvas(original), 'image/jpeg', 0.95) : undefined;
    const id = newId();
    const capture = await s.store.save(
      {
        id,
        createdAt: o.createdAt,
        source: 'camera',
        outputType: type,
        lensId: o.lens.id,
        lensVersion: o.lens.version,
        params: o.params,
        seed: o.seed,
        width: image.width,
        height: image.height,
        captureMethod: method,
        appVersion: APP_VERSION,
      },
      { output, thumb, ...(originalBlob ? { original: originalBlob } : {}) },
    );
    void o.geo?.then(async (geo) => {
      if (geo) await s.store.setGeo(id, geo).catch((e: unknown) => logEvent('warn', 'geo', 'Could not save location', e));
    });
    return capture;
  });
}
