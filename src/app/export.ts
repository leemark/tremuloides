import type { Capture } from '../storage/types';
import { addExif, type ExifInfo } from '../util/exif';
import { getLens, lensExists } from '../lenses/registry';
import { paramSummary } from './params-ui';
import { APP_VERSION } from '../version';

/** EXIF for a capture: time, GPS + elevation, and the lens used. */
export function exifFor(c: Capture, which: 'output' | 'original'): ExifInfo {
  const lens = lensExists(c.lensId) ? getLens(c.lensId) : null;
  const settings = lens && lens.params.length ? ` (${paramSummary(lens.params, c.params)})` : '';
  const info: ExifInfo = {
    date: new Date(c.createdAt),
    software: `Tremuloides ${APP_VERSION}`,
    description: which === 'original' ? 'Tremuloides original' : `Tremuloides · ${lens?.name ?? c.lensId}`,
    comment: which === 'original' ? 'Original photo' : `Lens: ${lens?.name ?? c.lensId} v${c.lensVersion}${settings}; seed ${c.seed}`,
  };
  if (c.geo) info.gps = { lat: c.geo.lat, lon: c.geo.lon, altitude: c.geo.altitude };
  return info;
}

/** Adds EXIF to JPEG exports that don't already carry it (camera originals keep their own). */
export async function withExif(blob: Blob, c: Capture, which: 'output' | 'original'): Promise<Blob> {
  if (blob.type && blob.type !== 'image/jpeg') return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = addExif(bytes, exifFor(c, which));
  return out === bytes ? blob : new Blob([out as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
}
