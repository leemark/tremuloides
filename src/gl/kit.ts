import FULLSCREEN_VS from './shaders/fullscreen.vert.glsl?raw';
import COLOR_GLSL from './shaders/color.glsl?raw';

export const GLSL_HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
export { COLOR_GLSL, FULLSCREEN_VS };

/** Builds a fragment shader: version header + optional chunks + body. */
export function fragment(...chunks: string[]): string {
  return GLSL_HEADER + chunks.join('\n');
}

export class ShaderError extends Error {
  constructor(message: string, readonly log: string) {
    super(message);
    this.name = 'ShaderError';
  }
}

export type UniformValue = number | readonly number[] | WebGLTexture;

export class Program {
  readonly handle: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    fragmentSource: string,
    vertexSource: string = FULLSCREEN_VS,
    readonly label = 'program',
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}.frag`);
    const p = gl.createProgram();
    if (!p) throw new ShaderError(`${label}: createProgram failed`, '');
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(p) ?? '';
      gl.deleteProgram(p);
      throw new ShaderError(`${label}: link failed`, log);
    }
    this.handle = p;
  }

  loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.handle, name));
    return this.locs.get(name) ?? null;
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new ShaderError(`${label}: createShader failed`, '');
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(s) ?? '';
    gl.deleteShader(s);
    throw new ShaderError(`${label}: compile failed`, log);
  }
  return s;
}

/** An offscreen color target. `fbo === null` means the default framebuffer (the canvas). */
export interface RenderTarget {
  fbo: WebGLFramebuffer | null;
  tex: WebGLTexture | null;
  width: number;
  height: number;
}

export interface DrawOptions {
  /** Texture units are assigned in insertion order. */
  textures?: Record<string, WebGLTexture>;
  uniforms?: Record<string, number | readonly number[]>;
}

/** Small helper layer shared by all lenses: fullscreen draws, textures and render targets. */
export class GLKit {
  private readonly vao: WebGLVertexArrayObject;
  readonly maxTextureSize: number;
  readonly floatRenderTargets: boolean;

  constructor(readonly gl: WebGL2RenderingContext) {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    this.vao = vao;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.floatRenderTargets = !!gl.getExtension('EXT_color_buffer_float');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  program(fragmentSource: string, label?: string): Program {
    return new Program(this.gl, fragmentSource, FULLSCREEN_VS, label);
  }

  createTexture(width: number, height: number, filter: 'linear' | 'nearest' = 'linear'): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const f = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (width > 0 && height > 0) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    return tex;
  }

  /**
   * Uploads an image/video/canvas into `tex` without flipping, so v = 0 is the TOP row of the
   * image. (UNPACK_FLIP_Y is ignored for ImageBitmap sources, so we never rely on it.)
   * Lens passes keep this image-space convention; only the final display pass flips for the screen.
   */
  upload(tex: WebGLTexture, source: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  createTarget(width: number, height: number, filter: 'linear' | 'nearest' = 'linear'): RenderTarget {
    const gl = this.gl;
    const tex = this.createTexture(width, height, filter);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      throw new Error(`Framebuffer incomplete (0x${status.toString(16)}) at ${width}×${height}`);
    }
    return { fbo, tex, width, height };
  }

  /** Returns `t` if it already has the requested size, otherwise a freshly allocated target. */
  ensureTarget(t: RenderTarget | null, width: number, height: number): RenderTarget {
    if (t && t.width === width && t.height === height) return t;
    if (t) this.deleteTarget(t);
    return this.createTarget(width, height);
  }

  deleteTarget(t: RenderTarget | null): void {
    if (!t) return;
    if (t.fbo) this.gl.deleteFramebuffer(t.fbo);
    if (t.tex) this.gl.deleteTexture(t.tex);
  }

  /** Draws a fullscreen triangle with `program` into `target`. */
  draw(program: Program, target: RenderTarget, opts: DrawOptions = {}): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program.handle);
    let unit = 0;
    for (const [name, tex] of Object.entries(opts.textures ?? {})) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(program.loc(name), unit);
      unit++;
    }
    for (const [name, value] of Object.entries(opts.uniforms ?? {})) {
      const loc = program.loc(name);
      if (loc === null) continue;
      if (typeof value === 'number') gl.uniform1f(loc, value);
      else if (value.length === 2) gl.uniform2f(loc, value[0] ?? 0, value[1] ?? 0);
      else if (value.length === 3) gl.uniform3f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
      else if (value.length === 4) gl.uniform4f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * Reads a target back as top-down RGBA pixels. Targets hold image-space content
   * (row 0 = image top), which is exactly the order readPixels returns.
   */
  readPixels(target: RenderTarget): Uint8ClampedArray<ArrayBuffer> {
    const gl = this.gl;
    const { width: w, height: h } = target;
    const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
  }
}

/** Factor that converts "reference pixels at a 1080 px short edge" into real pixels. */
export function refScale(width: number, height: number): number {
  return Math.min(width, height) / 1080;
}
