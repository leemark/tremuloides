import type { GLKit, Program } from './kit';
import type { FrameHistory } from '../lenses/types';

/** Ring buffer of frames in a TEXTURE_2D_ARRAY (RGBA8), filled by copying the input texture. */
export class FrameHistoryBuffer implements FrameHistory {
  readonly texture: WebGLTexture;
  private readonly fbo: WebGLFramebuffer;
  head = -1;
  count = 0;

  constructor(
    private readonly kit: GLKit,
    private readonly copy: Program,
    readonly width: number,
    readonly height: number,
    readonly frames: number,
  ) {
    const gl = kit.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('Could not allocate frame history');
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, frames);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    this.texture = tex;
    this.fbo = fbo;
  }

  /** Bytes of GPU memory used. */
  get bytes(): number {
    return this.width * this.height * 4 * this.frames;
  }

  /** Copies `input` (any size; resampled) into the next layer. */
  push(input: WebGLTexture): void {
    const gl = this.kit.gl;
    this.head = (this.head + 1) % this.frames;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.texture, 0, this.head);
    this.kit.draw(this.copy, { fbo: this.fbo, tex: null, width: this.width, height: this.height }, { textures: { u_input: input } });
    this.count = Math.min(this.frames, this.count + 1);
  }

  reset(): void {
    this.head = -1;
    this.count = 0;
  }

  dispose(): void {
    this.kit.gl.deleteTexture(this.texture);
    this.kit.gl.deleteFramebuffer(this.fbo);
  }
}
