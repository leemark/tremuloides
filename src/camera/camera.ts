import { drawTestPattern } from './testpattern';
import { pickRotation, type Gray, type Rotation } from './orient';
import type { CaptureMethod } from '../storage/types';
import { logEvent, errorMessage } from '../diagnostics/log';
import { parseCapabilities, snap, type ControlCaps } from './controls';

export interface StillResult {
  /** Upright image, as stored for "keep originals". */
  blob: Blob;
  /** The same image, decoded and upright. Caller must close(). */
  bitmap: ImageBitmap;
  method: CaptureMethod;
}

export interface FrameSource {
  readonly kind: 'camera' | 'test-pattern';
  readonly element: TexImageSource;
  readonly width: number;
  readonly height: number;
  /** Returns true when a new frame is ready to upload. */
  update(now: number): boolean;
  takeStill(mode: 'auto' | 'video'): Promise<StillResult>;
  stop(): void;
  info(): Record<string, unknown>;
  /** Zoom / exposure / tap-to-focus support (absent or empty when the camera offers none). */
  controls?(): ControlCaps;
  setZoom?(zoom: number): Promise<void>;
  setExposure?(ev: number): Promise<void>;
  /** Focus and meter at a point of the frame (0–1, top-left origin). */
  focusAt?(x: number, y: number): Promise<void>;
}

interface PhotoCapabilitiesLike {
  imageWidth?: { max?: number };
  imageHeight?: { max?: number };
}
interface ImageCaptureLike {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  getPhotoCapabilities(): Promise<PhotoCapabilitiesLike>;
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function imageCaptureCtor(): ImageCaptureCtor | undefined {
  return (globalThis as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
}

export function imageCaptureSupported(): boolean {
  return typeof imageCaptureCtor() === 'function';
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))), type, quality);
  });
}

/** Small grayscale copy of an image source (for orientation matching). */
function grayThumb(source: CanvasImageSource, sw: number, sh: number, long = 64): Gray {
  const s = long / Math.max(sw, sh);
  const w = Math.max(4, Math.round(sw * s));
  const h = Math.max(4, Math.round(sh * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { width: w, height: h, data: new Float32Array(w * h) };
  ctx.drawImage(source, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    data[i] = 0.2126 * (px[i * 4] ?? 0) + 0.7152 * (px[i * 4 + 1] ?? 0) + 0.0722 * (px[i * 4 + 2] ?? 0);
  }
  return { width: w, height: h, data };
}

async function rotateBitmap(bitmap: ImageBitmap, deg: Rotation): Promise<HTMLCanvasElement> {
  const swap = deg === 90 || deg === 270;
  const c = document.createElement('canvas');
  c.width = swap ? bitmap.height : bitmap.width;
  c.height = swap ? bitmap.width : bitmap.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return c;
}

export type CameraStartResult = { ok: true; source: CameraSource } | { ok: false; reason: 'denied' | 'unavailable' | 'error'; message: string };

export class CameraSource implements FrameSource {
  readonly kind = 'camera' as const;
  readonly element: HTMLVideoElement;
  private track: MediaStreamTrack;
  private imageCapture: ImageCaptureLike | null = null;
  private newFrame = true;
  private lastPhotoInfo: Record<string, unknown> = {};

  private constructor(
    private readonly stream: MediaStream,
    video: HTMLVideoElement,
  ) {
    this.element = video;
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track');
    this.track = track;
    const Ctor = imageCaptureCtor();
    if (Ctor) {
      try {
        this.imageCapture = new Ctor(track);
      } catch (e) {
        logEvent('warn', 'camera', 'ImageCapture unavailable for this track', e);
      }
    }
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      const loop = () => {
        this.newFrame = true;
        if (this.track.readyState === 'live') v.requestVideoFrameCallback?.(loop);
      };
      v.requestVideoFrameCallback(loop);
    }
  }

  static async start(): Promise<CameraStartResult> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: 'unavailable', message: 'Camera API not available (needs HTTPS).' };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }));
      }
      return { ok: true, source: new CameraSource(stream, video) };
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      const reason = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'error';
      logEvent('warn', 'camera', `getUserMedia failed: ${name || 'error'}`, e);
      return { ok: false, reason, message: errorMessage(e) };
    }
  }

  get width(): number {
    return this.element.videoWidth;
  }

  get height(): number {
    return this.element.videoHeight;
  }

  update(): boolean {
    if (this.element.readyState < 2 || this.width === 0) return false;
    const v = this.element as HTMLVideoElement & { requestVideoFrameCallback?: unknown };
    if (typeof v.requestVideoFrameCallback !== 'function') return true;
    const fresh = this.newFrame;
    this.newFrame = false;
    return fresh;
  }

  private async videoFrameStill(): Promise<StillResult> {
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    c.getContext('2d')?.drawImage(this.element, 0, 0);
    const blob = await canvasToBlob(c);
    const bitmap = await createImageBitmap(c);
    return { blob, bitmap, method: 'video-frame' };
  }

  async takeStill(mode: 'auto' | 'video'): Promise<StillResult> {
    if (mode === 'video' || !this.imageCapture) return this.videoFrameStill();
    const reference = grayThumb(this.element, this.width, this.height);
    try {
      const caps = await this.imageCapture.getPhotoCapabilities().catch(() => ({}) as PhotoCapabilitiesLike);
      const settings: { imageWidth?: number; imageHeight?: number } = {};
      if (caps.imageWidth?.max) settings.imageWidth = caps.imageWidth.max;
      if (caps.imageHeight?.max) settings.imageHeight = caps.imageHeight.max;
      let blob = await this.imageCapture.takePhoto(settings);
      let bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const rotation = pickRotation(grayThumb(bitmap, bitmap.width, bitmap.height), reference);
      this.lastPhotoInfo = {
        photo: `${bitmap.width}×${bitmap.height}`,
        preview: `${this.width}×${this.height}`,
        rotationApplied: rotation,
      };
      if (rotation !== 0) {
        const canvas = await rotateBitmap(bitmap, rotation);
        bitmap.close();
        blob = await canvasToBlob(canvas);
        bitmap = await createImageBitmap(canvas);
        logEvent('info', 'camera', `Rotated photo ${rotation}° to match preview`, this.lastPhotoInfo);
      }
      return { blob, bitmap, method: 'imagecapture' };
    } catch (e) {
      logEvent('warn', 'camera', 'takePhoto failed; using video frame', e);
      return this.videoFrameStill();
    }
  }

  stop(): void {
    for (const t of this.stream.getTracks()) t.stop();
    this.element.srcObject = null;
  }

  private caps: ControlCaps | null = null;

  controls(): ControlCaps {
    if (!this.caps) {
      let raw: unknown = null;
      try {
        raw = this.track.getCapabilities?.() ?? null;
      } catch {
        raw = null;
      }
      this.caps = parseCapabilities(raw);
    }
    return this.caps;
  }

  /** applyConstraints with `advanced` (Chrome's image-capture constraints); failures are logged, never thrown. */
  private async apply(c: Record<string, unknown>, what: string): Promise<void> {
    try {
      await this.track.applyConstraints({ advanced: [c] } as unknown as MediaTrackConstraints);
    } catch (e) {
      logEvent('warn', 'camera', `${what} not applied`, e);
    }
  }

  async setZoom(zoom: number): Promise<void> {
    const r = this.controls().zoom;
    if (r) await this.apply({ zoom: snap(zoom, r) }, 'Zoom');
  }

  async setExposure(ev: number): Promise<void> {
    const r = this.controls().exposure;
    if (!r) return;
    const modes = this.controls().exposureModes;
    await this.apply({ ...(modes.includes('continuous') ? { exposureMode: 'continuous' } : {}), exposureCompensation: snap(ev, r) }, 'Exposure');
  }

  async focusAt(x: number, y: number): Promise<void> {
    const c = this.controls();
    if (!c.focusPoint) return;
    const focusMode = c.focusModes.includes('single-shot') ? 'single-shot' : c.focusModes.includes('continuous') ? 'continuous' : undefined;
    await this.apply(
      {
        pointsOfInterest: [{ x, y }],
        ...(focusMode ? { focusMode } : {}),
        ...(c.exposureModes.includes('continuous') ? { exposureMode: 'continuous' } : {}),
      },
      'Tap to focus',
    );
    this.newFrame = true;
  }

  info(): Record<string, unknown> {
    let capabilities: unknown = null;
    try {
      capabilities = this.track.getCapabilities?.() ?? null;
    } catch {
      capabilities = null;
    }
    return {
      label: this.track.label,
      settings: this.track.getSettings(),
      capabilities,
      imageCapture: !!this.imageCapture,
      lastPhoto: this.lastPhotoInfo,
    };
  }
}

export class TestPatternSource implements FrameSource {
  readonly kind = 'test-pattern' as const;
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private last = -Infinity;

  constructor(portrait: boolean) {
    this.element = document.createElement('canvas');
    this.element.width = portrait ? 720 : 1280;
    this.element.height = portrait ? 1280 : 720;
    const ctx = this.element.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  get width(): number {
    return this.element.width;
  }

  get height(): number {
    return this.element.height;
  }

  update(now: number): boolean {
    if (now - this.last < 33) return false; // ~30 fps is plenty
    this.last = now;
    const { ctx, width: w, height: h } = this;
    ctx.save();
    ctx.translate(this.focus.x * w, this.focus.y * h);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.focus.x * w, -this.focus.y * h);
    drawTestPattern(ctx, w, h, now);
    ctx.restore();
    if (this.ev) {
      // Cheap stand-in for exposure: a light or dark veil.
      ctx.fillStyle = this.ev > 0 ? `rgba(255,255,255,${Math.min(0.6, this.ev * 0.25)})` : `rgba(0,0,0,${Math.min(0.7, -this.ev * 0.3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    return true;
  }

  // Simulated controls so the demo scene exercises the same UI as a real camera.
  private zoom = 1;
  private ev = 0;
  private focus = { x: 0.5, y: 0.5 };

  controls(): ControlCaps {
    return { zoom: { min: 1, max: 4, step: 0.1 }, exposure: { min: -2, max: 2, step: 0.1 }, focusPoint: true, focusModes: ['continuous'], exposureModes: ['continuous'] };
  }

  async setZoom(zoom: number): Promise<void> {
    this.zoom = Math.min(4, Math.max(1, zoom));
  }

  async setExposure(ev: number): Promise<void> {
    this.ev = Math.min(2, Math.max(-2, ev));
  }

  async focusAt(x: number, y: number): Promise<void> {
    this.focus = { x, y };
  }

  async takeStill(): Promise<StillResult> {
    const scale = 2.4; // ~3072 px long edge, like a phone photo
    const c = document.createElement('canvas');
    c.width = Math.round(this.width * scale);
    c.height = Math.round(this.height * scale);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    drawTestPattern(ctx, c.width, c.height, performance.now());
    const blob = await canvasToBlob(c);
    const bitmap = await createImageBitmap(c);
    return { blob, bitmap, method: 'test-pattern' };
  }

  stop(): void {
    /* nothing to release */
  }

  info(): Record<string, unknown> {
    return { source: 'test pattern', size: `${this.width}×${this.height}` };
  }
}
