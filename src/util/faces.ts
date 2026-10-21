/**
 * Faces for lenses that paint them with care (Flow Painter). Uses the browser's own face detector
 * (Shape Detection API) when it has one: nothing is downloaded and no model ships with the app. Where
 * there's none, lenses simply get no faces and paint as before.
 */
import type { FaceBox } from '../lenses/types';
import { MAX_FACES } from '../lenses/flow-painter/plan';
import { logEvent } from '../diagnostics/log';
import { resizeTo } from './canvas';

/** Detection runs on a copy at most this long: faces worth a brush of their own are big enough to find. */
export const DETECT_EDGE = 1280;

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}
interface FaceDetectorLike {
  detect(image: ImageBitmapSource): Promise<DetectedFace[]>;
}
type FaceDetectorCtor = new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => FaceDetectorLike;

function detectorCtor(): FaceDetectorCtor | undefined {
  const c = (globalThis as { FaceDetector?: unknown }).FaceDetector;
  return typeof c === 'function' ? (c as FaceDetectorCtor) : undefined;
}

export function faceDetectorAvailable(): boolean {
  return detectorCtor() !== undefined;
}

/** Detector boxes (px of a width × height image) as 0–1 boxes, clipped to the picture; empty ones dropped. */
export function toFaceBoxes(found: readonly DetectedFace[], width: number, height: number): FaceBox[] {
  const out: FaceBox[] = [];
  for (const f of found) {
    const b = f.boundingBox;
    const x0 = Math.max(0, b.x / width);
    const y0 = Math.max(0, b.y / height);
    const x1 = Math.min(1, (b.x + b.width) / width);
    const y1 = Math.min(1, (b.y + b.height) / height);
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) continue;
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out.slice(0, MAX_FACES);
}

/** Faces in `image` (already upright), or [] when the browser can't tell or detection fails. */
export async function detectFaces(image: ImageBitmap): Promise<FaceBox[]> {
  const Ctor = detectorCtor();
  if (!Ctor) return [];
  let copy: ImageBitmap | null = null;
  try {
    const s = Math.min(1, DETECT_EDGE / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * s));
    const h = Math.max(1, Math.round(image.height * s));
    copy = s < 1 ? await resizeTo(image, w, h) : null;
    const found = await new Ctor({ maxDetectedFaces: MAX_FACES, fastMode: false }).detect(copy ?? image);
    const faces = toFaceBoxes(found, w, h);
    logEvent('info', 'faces', `${faces.length} face${faces.length === 1 ? '' : 's'} found`);
    return faces;
  } catch (e) {
    logEvent('warn', 'faces', 'Face detection failed; painting without faces', e);
    return [];
  } finally {
    copy?.close();
  }
}
