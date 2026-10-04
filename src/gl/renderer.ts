import { GLKit, Program, fragment, type RenderTarget } from './kit';
import { fitScale, lensRenderSize, type FitMode } from './fit';
import DISPLAY_FRAG from './shaders/display.frag.glsl?raw';
import COPY_FRAG from './shaders/copy.frag.glsl?raw';
import { FrameHistoryBuffer } from './history';
import { previewHistoryPlan } from '../lenses/quake/plan';
import type { CaptureResult, Lens, LensInstance, Params } from '../lenses/types';
import { logEvent } from '../diagnostics/log';

export interface PreviewOptions {
  lens: Lens;
  params: Params;
  seed: number;
  fit: FitMode;
  /** Show the unprocessed input instead of the lens output. */
  showOriginal?: boolean;
  /** Adaptive preview scale (0–1). */
  scale?: number;
}

export interface GLInfo {
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  floatRenderTargets: boolean;
  contextLost: boolean;
}

const BACKGROUND: [number, number, number] = [0.055, 0.059, 0.067];

/**
 * Owns the single WebGL2 context: the visible preview canvas plus offscreen
 * full-resolution renders for captures.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private kit!: GLKit;
  private display!: Program;
  private copy!: Program;
  private history: FrameHistoryBuffer | null = null;
  private inputVersion = 0;
  private pushedVersion = -1;
  private fedVersion = -1;
  private instances = new Map<string, LensInstance>();
  private input: WebGLTexture | null = null;
  private inputW = 0;
  private inputH = 0;
  private lensTarget: RenderTarget | null = null;
  private lost = false;
  /** Last preview lens size (for diagnostics). */
  lastPreviewSize: [number, number] = [0, 0];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl-canvas';
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available on this device/browser.');
    this.gl = gl;
    this.init();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.instances.clear();
      this.input = null;
      this.lensTarget = null;
      this.history = null;
      logEvent('warn', 'gl', 'WebGL context lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
      logEvent('info', 'gl', 'WebGL context restored');
    });
  }

  private init(): void {
    this.kit = new GLKit(this.gl);
    this.display = this.kit.program(fragment(DISPLAY_FRAG), 'display');
    this.copy = this.kit.program(fragment(COPY_FRAG), 'copy');
    this.input = this.kit.createTexture(0, 0);
    this.inputW = 0;
    this.inputH = 0;
  }

  get maxTextureSize(): number {
    return this.kit.maxTextureSize;
  }

  get isLost(): boolean {
    return this.lost || this.gl.isContextLost();
  }

  info(): GLInfo {
    const gl = this.gl;
    let renderer = String(gl.getParameter(gl.RENDERER));
    let vendor = String(gl.getParameter(gl.VENDOR));
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
    }
    return {
      renderer,
      vendor,
      maxTextureSize: this.kit.maxTextureSize,
      floatRenderTargets: this.kit.floatRenderTargets,
      contextLost: this.isLost,
    };
  }

  private instance(lens: Lens): LensInstance {
    let inst = this.instances.get(lens.id);
    if (!inst) {
      inst = lens.create(this.kit);
      this.instances.set(lens.id, inst);
    }
    return inst;
  }

  /** Uploads the current preview source frame (video, canvas or bitmap). */
  setInput(source: TexImageSource, width: number, height: number): void {
    if (this.isLost || !this.input || width <= 0 || height <= 0) return;
    this.kit.upload(this.input, source);
    this.inputW = width;
    this.inputH = height;
    this.inputVersion++;
  }

  /** Keeps the preview frame history for temporal lenses; frees it for others. */
  private updateHistory(lens: Lens): FrameHistoryBuffer | undefined {
    if (lens.kind !== 'temporal' || !lens.temporal || !this.input) {
      this.dropHistory();
      return undefined;
    }
    const plan = previewHistoryPlan(this.inputW, this.inputH, lens.temporal.historyScale, this.kit.maxTextureSize);
    const frames = Math.min(plan.frames, lens.temporal.maxFrames);
    const h = this.history;
    if (!h || h.width !== plan.width || h.height !== plan.height || h.frames !== frames) {
      this.dropHistory();
      this.history = new FrameHistoryBuffer(this.kit, this.copy, plan.width, plan.height, frames);
      this.pushedVersion = -1;
    }
    if (this.pushedVersion !== this.inputVersion) {
      this.history?.push(this.input);
      this.pushedVersion = this.inputVersion;
    }
    return this.history ?? undefined;
  }

  private dropHistory(): void {
    this.history?.dispose();
    this.history = null;
  }

  /** Starts a temporal capture (burst or slit-scan) from the live input. */
  beginCapture(lens: Lens, params: Params, seed: number): void {
    const inst = this.instance(lens);
    if (!inst.beginCapture) throw new Error(`${lens.name} has no recording mode`);
    inst.beginCapture(params, seed, this.inputW, this.inputH);
    this.fedVersion = -1;
  }

  /** Feeds the newest input frame (once per frame). Returns progress, or null if no new frame. */
  feedCapture(lens: Lens): number | null {
    if (this.isLost || !this.input || this.fedVersion === this.inputVersion) return null;
    this.fedVersion = this.inputVersion;
    return this.instance(lens).feedCapture?.(this.input) ?? 1;
  }

  finishCapture(lens: Lens): CaptureResult {
    const inst = this.instance(lens);
    if (!inst.finishCapture) throw new Error(`${lens.name} has no recording mode`);
    return inst.finishCapture();
  }

  cancelCapture(lens: Lens): void {
    if (!this.isLost) this.instances.get(lens.id)?.cancelCapture?.();
  }

  temporalInfo(): Record<string, unknown> {
    const h = this.history;
    const lensInfo: Record<string, unknown> = {};
    for (const [id, inst] of this.instances) if (inst.info) lensInfo[id] = inst.info();
    return {
      history: h ? { size: `${h.width}×${h.height}`, frames: `${h.count}/${h.frames}`, mb: Math.round(h.bytes / 1048576) } : null,
      lenses: lensInfo,
    };
  }

  /** Matches the canvas backing store to its CSS size (device pixels, capped at 2×). */
  private syncCanvasSize(): [number, number] {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return [w, h];
  }

  /** Renders the current input through a lens and draws it on the canvas. */
  drawPreview(opts: PreviewOptions): void {
    if (this.isLost || !this.input || this.inputW === 0) return;
    const [dw, dh] = this.syncCanvasSize();
    let shown: WebGLTexture = this.input;
    if (!opts.showOriginal) {
      const [lw, lh] = lensRenderSize(
        this.inputW,
        this.inputH,
        dw,
        dh,
        opts.fit,
        opts.scale ?? 1,
        this.kit.maxTextureSize,
      );
      this.lensTarget = this.kit.ensureTarget(this.lensTarget, lw, lh);
      this.lastPreviewSize = [lw, lh];
      const history = this.updateHistory(opts.lens);
      const result = this.instance(opts.lens).render(
        {
          input: this.input,
          inputWidth: this.inputW,
          inputHeight: this.inputH,
          width: lw,
          height: lh,
          params: opts.params,
          seed: opts.seed,
          quality: 'preview',
          ...(history ? { history } : {}),
        },
        this.lensTarget,
      );
      if (result instanceof Promise) result.catch((e: unknown) => logEvent('error', 'lens', String(e)));
      if (this.lensTarget.tex) shown = this.lensTarget.tex;
    }
    const [sx, sy] = fitScale(this.inputW / this.inputH, dw / dh, opts.fit);
    this.kit.draw(this.display, { fbo: null, tex: null, width: dw, height: dh }, {
      textures: { u_tex: shown },
      uniforms: { u_scale: [sx, sy], u_background: BACKGROUND },
    });
  }

  /**
   * Full-resolution render of `source` (already decoded and sized to width×height).
   * Returns top-down RGBA pixels.
   */
  async renderFinal(
    source: TexImageSource,
    width: number,
    height: number,
    lens: Lens,
    params: Params,
    seed: number,
    onProgress?: (fraction: number) => void,
  ): Promise<ImageData> {
    if (this.isLost) throw new Error('Graphics context was lost; try again in a moment.');
    const kit = this.kit;
    const tex = kit.createTexture(0, 0);
    let target: RenderTarget | null = null;
    try {
      kit.upload(tex, source);
      target = kit.createTarget(width, height);
      await this.instance(lens).render(
        { input: tex, inputWidth: width, inputHeight: height, width, height, params, seed, quality: 'final', ...(onProgress ? { onProgress } : {}) },
        target,
      );
      const pixels = kit.readPixels(target);
      return new ImageData(pixels, width, height);
    } finally {
      this.gl.deleteTexture(tex);
      kit.deleteTarget(target);
    }
  }

  /** Drops cached lens instances except the ones listed (frees GPU memory). */
  trimInstances(keep: string[]): void {
    for (const [id, inst] of this.instances) {
      if (!keep.includes(id)) {
        inst.dispose();
        this.instances.delete(id);
      }
    }
  }
}
