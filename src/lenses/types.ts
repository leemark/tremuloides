import type { GLKit, RenderTarget } from '../gl/kit';
import type { Capture } from '../storage/types';

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  id: string;
  label: string;
  help?: string;
}
export interface RangeParam extends ParamBase {
  type: 'range';
  min: number;
  max: number;
  step: number;
  default: number;
}
export interface ToggleParam extends ParamBase {
  type: 'toggle';
  default: boolean;
}
export interface SelectParam extends ParamBase {
  type: 'select';
  options: { value: string; label: string }[];
  default: string;
}
export interface ColorParam extends ParamBase {
  type: 'color';
  default: string;
}
export type ParamSpec = RangeParam | ToggleParam | SelectParam | ColorParam;

export type LensKind = 'realtime' | 'temporal' | 'still';

export interface LensMeta {
  /** kebab-case, permanent: stored in captures. */
  id: string;
  name: string;
  /** One line for the lens picker. */
  tagline: string;
  /** Bump when the output for the same params changes materially. */
  version: number;
  kind: LensKind;
  seeded: boolean;
  params: ParamSpec[];
  /** Temporal lenses only (e.g. Quake, M3). */
  temporal?: { maxFrames: number; historyScale: number };
  /** Shutter behaviour; defaults to 'still' (one photo through the lens). */
  captureStyle?: (params: Params) => CaptureStyle;
}

/** Ring buffer of recent frames for temporal lenses (see gl/history.ts). */
export interface FrameHistory {
  readonly texture: WebGLTexture;
  /** Capacity in frames. */
  readonly frames: number;
  /** Frames filled so far (≤ frames). */
  readonly count: number;
  readonly width: number;
  readonly height: number;
  /** Layer index of the newest frame (-1 when empty). */
  readonly head: number;
}

/** How the shutter behaves for a lens with the given params. */
export type CaptureStyle = 'still' | 'burst' | 'toggle';

export interface CaptureResult {
  image: ImageData;
  /** An unprocessed frame, kept as the "original" when available. */
  original?: ImageData;
  method: 'burst' | 'slit-scan';
}

export interface RenderRequest {
  /** RGBA8 source texture in image space: v = 0 is the TOP row of the image (see GLKit.upload). */
  input: WebGLTexture;
  inputWidth: number;
  inputHeight: number;
  /** Output size (equals the target size). */
  width: number;
  height: number;
  params: Params;
  seed: number;
  quality: 'preview' | 'final';
  history?: FrameHistory;
  onProgress?: (fraction: number) => void;
  /**
   * Progressive lenses (Flow Painter) can show their work: draw in batches of `batch` strokes,
   * write the current state into the target after each, and await `frame()`.
   */
  timelapse?: { batch: number; frame(fraction: number): Promise<void> };
}

export interface LensInstance {
  render(req: RenderRequest, target: RenderTarget): void | Promise<void>;
  dispose(): void;
  /** Temporal captures (burst / toggle styles): start recording from the live input. */
  beginCapture?(params: Params, seed: number, sourceWidth: number, sourceHeight: number): void;
  /** Feeds one new frame; returns progress 0–1 (1 = done for bursts, full for toggles). */
  feedCapture?(input: WebGLTexture): number;
  finishCapture?(): CaptureResult;
  cancelCapture?(): void;
  /** Diagnostics for the capture/history state. */
  info?(): Record<string, unknown>;
}

/** Extra buttons a lens can add to the photo screen (e.g. Play, WAV, MIDI, SVG). */
export interface LensActionContext {
  capture: Capture;
  /** The original if kept, else the rendered output. */
  source(): Promise<Blob>;
  /** Container of the displayed photo (for overlays such as a playhead). */
  view: HTMLElement;
  img: HTMLImageElement;
  /** e.g. "tremuloides_20261002_160509_ridgeline" */
  filenameBase: string;
  share(file: File): Promise<void>;
  toast(message: string): void;
  setLabel(label: string): void;
  /** Runs when the photo screen closes. */
  onCleanup(fn: () => void): void;
  /** Saves a generated video to the gallery (linked to this photo) and returns its id. */
  saveVideo(clip: { blob: Blob; type: string; durationMs: number; width: number; height: number }, thumb: Blob | null): Promise<string>;
  /** Opens a capture (e.g. a saved video) on the photo screen. */
  open(id: string): void;
}

export interface LensAction {
  id: string;
  label: string;
  icon: 'play' | 'audio' | 'midi' | 'svg' | 'film';
  run(ctx: LensActionContext): void | Promise<void>;
}

export interface Lens extends LensMeta {
  create(kit: GLKit): LensInstance;
  /** Photo-screen actions for captures made with this lens. */
  actions?: LensAction[];
}
