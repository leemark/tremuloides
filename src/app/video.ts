import { logEvent } from '../diagnostics/log';

/** Clip lengths offered in the viewfinder. */
export const VIDEO_SECONDS = [5, 10, 15] as const;
export type VideoSeconds = (typeof VIDEO_SECONDS)[number];

/** MP4 first: it plays and shares everywhere (Chrome records it since v126); WebM as fallback. */
export const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function pickVideoType(isSupported: (t: string) => boolean): string | null {
  for (const t of VIDEO_TYPES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* some browsers throw for unknown types */
    }
  }
  return null;
}

/** "video/mp4;codecs=…" → "video/mp4" */
export function baseType(mime: string): string {
  return mime.split(';')[0]?.trim() ?? mime;
}

export function nextDuration(current: number): VideoSeconds {
  const i = VIDEO_SECONDS.indexOf(current as VideoSeconds);
  return VIDEO_SECONDS[(i + 1) % VIDEO_SECONDS.length] ?? 10;
}

/** 3.2 → "0:03" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function isVideoType(type: string | undefined): boolean {
  return (type ?? '').toLowerCase().startsWith('video/');
}

export function videoSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    pickVideoType((t) => MediaRecorder.isTypeSupported(t)) !== null
  );
}

export interface ClipResult {
  blob: Blob;
  type: string;
  durationMs: number;
  width: number;
  height: number;
}

/**
 * Records a canvas (the live lens viewfinder) with MediaRecorder, optionally with microphone sound.
 * Everything stays on the device.
 */
export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mic: MediaStream | null = null;
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private done: Promise<ClipResult> | null = null;
  readonly type: string;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const t = pickVideoType((x) => MediaRecorder.isTypeSupported(x));
    if (!t) throw new Error('This browser can’t record video');
    this.type = t;
  }

  /** Starts recording. Resolves once recording has begun (after any microphone prompt). */
  async start(withSound: boolean): Promise<{ sound: boolean }> {
    const stream = this.canvas.captureStream(30);
    let sound = false;
    if (withSound && navigator.mediaDevices?.getUserMedia) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
        for (const tr of this.mic.getAudioTracks()) stream.addTrack(tr);
        sound = true;
      } catch (e) {
        logEvent('warn', 'video', 'Microphone unavailable; recording without sound', e);
      }
    }
    this.stream = stream;
    const rec = new MediaRecorder(stream, { mimeType: this.type, videoBitsPerSecond: 8_000_000, ...(sound ? { audioBitsPerSecond: 128_000 } : {}) });
    this.recorder = rec;
    this.chunks = [];
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.done = new Promise<ClipResult>((resolve, reject) => {
      rec.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      rec.onerror = (e) => reject(new Error(`Recorder error: ${String((e as Event & { error?: unknown }).error ?? 'unknown')}`));
      rec.onstop = () => {
        const durationMs = performance.now() - this.startedAt;
        const type = baseType(this.type);
        const blob = new Blob(this.chunks, { type });
        this.release();
        if (!blob.size) reject(new Error('The recording was empty'));
        else resolve({ blob, type, durationMs, width, height });
      };
    });
    rec.start(1000);
    this.startedAt = performance.now();
    return { sound };
  }

  get elapsed(): number {
    return this.recorder ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /** Stops and returns the clip. */
  stop(): Promise<ClipResult> {
    if (!this.recorder || !this.done) return Promise.reject(new Error('Not recording'));
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.done;
  }

  /** Stops and throws the clip away. */
  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = () => this.release();
      this.recorder.stop();
    } else this.release();
  }

  private release(): void {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    for (const t of this.stream?.getVideoTracks() ?? []) t.stop();
    this.mic = null;
    this.stream = null;
    this.recorder = null;
  }
}
