import type { Services } from './services';
import type { Capture, GeoTag } from '../storage/types';
import { makeThumb } from './pipeline';
import { readExif } from '../util/exif-read';
import { newId } from '../util/ids';
import { originalLens } from '../lenses/original';
import { APP_VERSION } from '../version';
import { logEvent, errorMessage } from '../diagnostics/log';

export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportResult {
  imported: Capture[];
  failed: ImportFailure[];
}

const HEIC = /\.(heic|heif)$/i;

export function isHeic(file: { name: string; type: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || HEIC.test(file.name);
}

/** Splits picked files into images to try and non-images to skip (pure). */
export function partitionFiles<T extends { name: string; type: string }>(files: readonly T[]): { images: T[]; skipped: ImportFailure[] } {
  const images: T[] = [];
  const skipped: ImportFailure[] = [];
  for (const f of files) {
    if (f.type.startsWith('image/') || HEIC.test(f.name) || (!f.type && /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name))) images.push(f);
    else skipped.push({ name: f.name, reason: 'Not a photo' });
  }
  return { images, skipped };
}

/** Plain-language reason for a photo the browser couldn't open. */
export function decodeFailureReason(file: { name: string; type: string }): string {
  return isHeic(file)
    ? 'HEIC photo this browser can’t open. Share it as JPEG, or turn off “High efficiency pictures” in the camera settings.'
    : 'This browser couldn’t open the image';
}

/** Capture time: EXIF DateTimeOriginal, else the file's modified time, else now. */
export function importDate(exifDate: Date | undefined, lastModified: number | undefined, now = Date.now()): Date {
  if (exifDate && !Number.isNaN(exifDate.getTime())) return exifDate;
  if (lastModified && lastModified > 0 && lastModified <= now) return new Date(lastModified);
  return new Date(now);
}

/**
 * Adds photos from the phone to the gallery as unprocessed captures (the Original lens), keeping
 * their capture date and GPS from EXIF. The photo is stored once, as the output, so it can be
 * re-edited, used with Apply lens, and analysed by Field Log. Imports aren't copied to the phone
 * album (they're already on the phone); renders made from them are.
 */
export async function importPhotos(s: Services, files: readonly File[], onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const { images, skipped } = partitionFiles(files);
  const result: ImportResult = { imported: [], failed: [...skipped] };
  const end = s.busy.begin();
  try {
    for (let i = 0; i < images.length; i++) {
      const file = images[i] as File;
      onProgress?.(i, images.length);
      let bitmap: ImageBitmap | null = null;
      try {
        try {
          bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
          result.failed.push({ name: file.name, reason: decodeFailureReason(file) });
          continue;
        }
        const exif = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name) ? readExif(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())) : {};
        const date = importDate(exif.date, file.lastModified);
        const geo: GeoTag | undefined = exif.gps
          ? { lat: exif.gps.lat, lon: exif.gps.lon, altitude: exif.gps.altitude, accuracy: 0, altitudeAccuracy: null, at: date.toISOString() }
          : undefined;
        const thumb = await makeThumb(bitmap, bitmap.width, bitmap.height);
        const capture = await s.store.save(
          {
            id: newId(),
            createdAt: date.toISOString(),
            source: 'import',
            outputType: file.type || 'image/jpeg',
            lensId: originalLens.id,
            lensVersion: originalLens.version,
            params: {},
            seed: 0,
            width: bitmap.width,
            height: bitmap.height,
            captureMethod: 'file',
            ...(geo ? { geo } : {}),
            appVersion: APP_VERSION,
          },
          { output: file, thumb },
        );
        result.imported.push(capture);
      } catch (e) {
        logEvent('error', 'import', `Import of ${file.name} failed`, e);
        result.failed.push({ name: file.name, reason: errorMessage(e) });
      } finally {
        bitmap?.close();
      }
    }
    onProgress?.(images.length, images.length);
  } finally {
    end();
  }
  if (result.failed.length) logEvent('warn', 'import', `${result.failed.length} of ${files.length} not imported`, result.failed);
  return result;
}

/** Summary line for a toast. */
export function importSummary(r: ImportResult): string {
  const n = r.imported.length;
  const parts = [n ? `Imported ${n} photo${n === 1 ? '' : 's'}` : 'No photos imported'];
  if (r.failed.length) {
    const heic = r.failed.filter((f) => f.reason.startsWith('HEIC')).length;
    parts.push(heic ? `${r.failed.length} skipped (${heic} HEIC this browser can’t open)` : `${r.failed.length} skipped`);
  }
  return parts.join(' · ');
}
