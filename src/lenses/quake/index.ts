import { fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import { FrameHistoryBuffer } from '../../gl/history';
import type { CaptureResult, FrameHistory, Lens, Params } from '../types';
import { burstFrames, fitHistorySize, slitPlan, slitSourceRange, type SlitPlan } from './plan';
import COPY from './shaders/copy.frag.glsl?raw';
import QUAKE from './shaders/quake.frag.glsl?raw';
import SLIT from './shaders/slit.frag.glsl?raw';
import STRIP from './shaders/strip.frag.glsl?raw';

const MODES: Record<string, number> = { rows: 0, columns: 1, radial: 2, luma: 3, slit: 4 };

interface Burst {
  buffer: FrameHistoryBuffer;
  latest: RenderTarget;
  params: Params;
}

interface Slit {
  strip: RenderTarget;
  plan: SlitPlan;
  range: [number, number];
  written: number;
  reverse: boolean;
}

export const quakeLens: Lens = {
  id: 'quake',
  name: 'Quake',
  tagline: 'Time-smeared aspens and slit-scan ribbons',
  version: 1,
  kind: 'temporal',
  seeded: false,
  temporal: { maxFrames: 64, historyScale: 0.5 },
  captureStyle: (params) => (params.mode === 'slit' ? 'toggle' : 'burst'),
  params: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'rows', label: 'Rows' },
        { value: 'columns', label: 'Columns' },
        { value: 'radial', label: 'Radial' },
        { value: 'luma', label: 'Luma (bright lags)' },
        { value: 'slit', label: 'Slit-scan' },
      ],
      default: 'luma',
      help: 'Slit-scan records while you pan: tap the shutter to start and again to stop.',
    },
    { id: 'span', label: 'Span (frames)', type: 'range', min: 4, max: 64, step: 1, default: 24, help: 'How far back in time the oldest part reaches' },
    {
      id: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'reverse', label: 'Reversed' },
      ],
      default: 'normal',
    },
    { id: 'smooth', label: 'Smooth', type: 'toggle', default: true, help: 'Blend between frames for silkier motion' },
    { id: 'mix', label: 'Mix with live', type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
  ],

  create(kit: GLKit) {
    const gl = kit.gl;
    const p = {
      copy: kit.program(fragment(COPY), 'quake.copy'),
      quake: kit.program(fragment(QUAKE), 'quake.main'),
      slit: kit.program(fragment(SLIT), 'quake.slit'),
      strip: kit.program(fragment(STRIP), 'quake.strip'),
    };
    // Bound when there is no history yet, so the array sampler always has a complete texture.
    const dummy = new FrameHistoryBuffer(kit, p.copy, 1, 1, 1);
    let burst: Burst | null = null;
    let slit: Slit | null = null;

    function drawQuake(target: RenderTarget, input: WebGLTexture, history: FrameHistory | undefined, params: Params, w: number, h: number) {
      const hist = history ?? dummy;
      kit.draw(p.quake, target, {
        textures: { u_input: input },
        arrayTextures: { u_history: hist.texture },
        ints: {
          u_frames: Math.max(1, hist.frames),
          u_count: history ? Math.max(0, hist.count) : 0,
          u_head: Math.max(0, hist.head),
          u_mode: MODES[String(params.mode)] ?? 3,
        },
        uniforms: {
          u_span: Number(params.span),
          u_reverse: params.direction === 'reverse' ? 1 : 0,
          u_smooth: params.smooth === true ? 1 : 0,
          u_mix: Number(params.mix),
          u_aspect: w / h,
          u_lineHalf: (1.5 * refScale(w, h)) / w,
        },
      });
    }

    function cleanup() {
      if (burst) {
        burst.buffer.dispose();
        kit.deleteTarget(burst.latest);
        burst = null;
      }
      if (slit) {
        kit.deleteTarget(slit.strip);
        slit = null;
      }
    }

    return {
      render(req, target) {
        if (req.params.mode === 'slit' && slit) {
          kit.draw(p.strip, target, {
            textures: { u_input: req.input, u_strip: slit.strip.tex as WebGLTexture },
            uniforms: {
              u_stripSize: [slit.plan.maxWidth, slit.plan.height],
              u_written: slit.written,
              u_reverse: slit.reverse ? 1 : 0,
              u_outSize: [req.width, req.height],
            },
          });
          return;
        }
        drawQuake(target, req.input, req.history, req.params, req.width, req.height);
      },

      beginCapture(params, _seed, srcW, srcH) {
        cleanup();
        const maxTex = kit.maxTextureSize;
        if (params.mode === 'slit') {
          const plan = slitPlan(srcW, srcH, maxTex);
          const strip = kit.createTarget(plan.maxWidth, plan.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, strip.fbo);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          slit = { strip, plan, range: slitSourceRange(srcW, srcH, plan.height, plan.slitWidth), written: 0, reverse: params.direction === 'reverse' };
          return;
        }
        const frames = burstFrames(Number(params.span));
        const [w, h] = fitHistorySize(srcW, srcH, frames, maxTex);
        burst = { buffer: new FrameHistoryBuffer(kit, p.copy, w, h, frames), latest: kit.createTarget(w, h), params: { ...params } };
      },

      feedCapture(input) {
        if (burst) {
          burst.buffer.push(input);
          kit.draw(p.copy, burst.latest, { textures: { u_input: input } });
          return burst.buffer.count / burst.buffer.frames;
        }
        if (slit) {
          const { plan } = slit;
          if (slit.written + plan.slitWidth > plan.maxWidth) return 1;
          const x = slit.reverse ? plan.maxWidth - slit.written - plan.slitWidth : slit.written;
          kit.draw(p.slit, slit.strip, {
            textures: { u_input: input },
            uniforms: { u_range: slit.range },
            viewport: [x, 0, plan.slitWidth, plan.height],
          });
          slit.written += plan.slitWidth;
          return slit.written / plan.maxWidth;
        }
        return 0;
      },

      finishCapture(): CaptureResult {
        try {
          if (burst) {
            const { buffer, latest, params } = burst;
            if (buffer.count === 0) throw new Error('Nothing recorded yet');
            const out = kit.createTarget(buffer.width, buffer.height);
            try {
              drawQuake(out, latest.tex as WebGLTexture, buffer, params, buffer.width, buffer.height);
              const image = new ImageData(kit.readPixels(out), buffer.width, buffer.height);
              const original = new ImageData(kit.readPixels(latest), buffer.width, buffer.height);
              return { image, original, method: 'burst' };
            } finally {
              kit.deleteTarget(out);
            }
          }
          if (slit) {
            const { written, plan, reverse, strip } = slit;
            if (written === 0) throw new Error('Nothing recorded yet');
            const x = reverse ? plan.maxWidth - written : 0;
            return { image: new ImageData(kit.readPixels(strip, x, written), written, plan.height), method: 'slit-scan' };
          }
          throw new Error('No capture in progress');
        } finally {
          cleanup();
        }
      },

      cancelCapture() {
        cleanup();
      },

      info() {
        if (burst) return { capture: 'burst', size: `${burst.buffer.width}×${burst.buffer.height}`, frames: `${burst.buffer.count}/${burst.buffer.frames}` };
        if (slit) return { capture: 'slit-scan', height: slit.plan.height, slit: slit.plan.slitWidth, written: slit.written, max: slit.plan.maxWidth };
        return { capture: 'idle' };
      },

      dispose() {
        cleanup();
        dummy.dispose();
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
