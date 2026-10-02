import type { GLKit, RenderTarget } from '../gl/kit';

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
}

/** Ring buffer of recent frames for temporal lenses (implemented in M3). */
export interface FrameHistory {
  readonly texture: WebGLTexture;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  /** Layer index of the newest frame. */
  readonly head: number;
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
}

export interface LensInstance {
  render(req: RenderRequest, target: RenderTarget): void | Promise<void>;
  dispose(): void;
}

export interface Lens extends LensMeta {
  create(kit: GLKit): LensInstance;
}
