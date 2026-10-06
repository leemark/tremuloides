import { GLKit, fragment, type RenderTarget } from '../gl/kit';
import FLIP from '../gl/shaders/flip.frag.glsl?raw';
import { ClipRecorder, type ClipResult } from './video';
import { makeThumb } from './pipeline';

/** Output size for generated videos: long edge 1440 px, even dimensions (encoders prefer them). */
export function animationSize(w: number, h: number, long = 1440): [number, number] {
  const s = Math.min(1, long / Math.max(w, h));
  const even = (v: number) => Math.max(2, Math.round((v * s) / 2) * 2);
  return [even(w), even(h)];
}

/** Frames needed to spread `seconds` at `fps`. */
export function frameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A private WebGL2 canvas whose contents are recorded to a video as you present frames.
 * Lenses render into `target` (image space); `present()` puts it on the canvas and holds it.
 * Used for the Flow Painter timelapse and the before/after reveal.
 */
export class GLAnimator {
  readonly canvas: HTMLCanvasElement;
  readonly kit: GLKit;
  readonly target: RenderTarget;
  private readonly flip;
  private recorder: ClipRecorder | null = null;
  private lastThumb: Promise<Blob | null> | null = null;
  private textures: WebGLTexture[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly fps = 20,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable for video rendering');
    this.kit = new GLKit(gl);
    this.target = this.kit.createTarget(width, height);
    this.flip = this.kit.program(fragment(FLIP), 'animate.flip');
  }

  /** Uploads an image (image-space texture). Freed in dispose(). */
  texture(source: TexImageSource): WebGLTexture {
    const t = this.kit.createTexture(0, 0);
    this.kit.upload(t, source);
    this.textures.push(t);
    return t;
  }

  /**
   * Starts recording. `first` (optional) is shown before the recorder starts and for a short
   * warm-up, because encoders drop the first moments of a stream.
   */
  async start(first?: RenderTarget): Promise<void> {
    if (first) await this.present(1, first);
    this.recorder = new ClipRecorder(this.canvas);
    await this.recorder.start(false);
    if (first) await this.present(Math.round(this.fps * 0.6), first);
  }

  /** Shows `target` (or the given target) on the canvas and holds it for `frames` frames. */
  async present(frames = 1, from: RenderTarget = this.target): Promise<void> {
    this.kit.draw(this.flip, { fbo: null, tex: null, width: this.width, height: this.height }, { textures: { u_tex: from.tex as WebGLTexture } });
    this.kit.gl.flush();
    await sleep((1000 / this.fps) * frames);
  }

  /** Grabs a thumbnail of what's on the canvas now. */
  snapshot(): void {
    this.lastThumb = makeThumb(this.canvas, this.width, this.height).catch(() => null);
  }

  async finish(): Promise<{ clip: ClipResult; thumb: Blob | null }> {
    if (!this.recorder) throw new Error('Not recording');
    const clip = await this.recorder.stop();
    this.recorder = null;
    return { clip, thumb: this.lastThumb ? await this.lastThumb : null };
  }

  dispose(): void {
    this.recorder?.cancel();
    const gl = this.kit.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    this.kit.deleteTarget(this.target);
    this.flip.dispose();
    this.kit.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
