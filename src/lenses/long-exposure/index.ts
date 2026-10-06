import { COLOR_GLSL, fragment, type GLKit, type RenderTarget } from '../../gl/kit';
import type { CaptureResult, Lens, Params, RenderRequest } from '../types';
import { alignSize, emaAlpha, estimateShift, grayFromRgba, meanWeight } from './align';
import { logEvent } from '../../diagnostics/log';
import ACCUM from './shaders/accum.frag.glsl?raw';
import FINISH from './shaders/finish.frag.glsl?raw';
import COPY from './shaders/copy.frag.glsl?raw';

const MODES: Record<string, number> = { smooth: 0, trails: 1, ghost: 0 };
const GHOST = 0.35;

interface Stack {
  a: RenderTarget;
  b: RenderTarget;
  last: RenderTarget;
  first: RenderTarget | null;
  n: number;
}

interface Capture extends Stack {
  params: Params;
  started: number;
  seconds: number;
  align: RenderTarget;
  ref: Float32Array | null;
  aw: number;
  ah: number;
  shifts: number;
}

export const longExposureLens: Lens = {
  id: 'long-exposure',
  name: 'Long Exposure',
  tagline: 'Silky water, wind-blurred aspens, light trails',
  version: 1,
  kind: 'temporal',
  seeded: false,
  // The preview blends frames itself; the shared history is only used to detect new frames.
  temporal: { maxFrames: 2, historyScale: 0.25 },
  captureStyle: () => 'burst',
  params: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'smooth', label: 'Smooth' },
        { value: 'trails', label: 'Light trails' },
        { value: 'ghost', label: 'Ghost' },
      ],
      default: 'smooth',
      help: 'Smooth averages (silky water, soft clouds); Light trails keeps the brightest; Ghost leaves soft trails behind a sharp moment',
    },
    { id: 'seconds', label: 'Exposure (s)', type: 'range', min: 1, max: 10, step: 0.5, default: 3, help: 'Tap the shutter, then hold the phone still' },
    { id: 'steady', label: 'Handheld steadying', type: 'toggle', default: true, help: 'Lines up each frame with the first to cancel small hand shake' },
  ],

  create(kit: GLKit) {
    const p = {
      accum: kit.program(fragment(COLOR_GLSL, ACCUM), 'long-exposure.accum'),
      finish: kit.program(fragment(COLOR_GLSL, FINISH), 'long-exposure.finish'),
      copy: kit.program(fragment(COPY), 'long-exposure.copy'),
    };
    let preview: Stack | null = null;
    let previewKey = '';
    let lastFrameKey = '';
    let cap: Capture | null = null;

    function makeStack(w: number, h: number): Stack {
      return { a: kit.createTarget(w, h, 'linear', 'rgba16f'), b: kit.createTarget(w, h, 'linear', 'rgba16f'), last: kit.createTarget(w, h, 'linear', 'rgba16f'), first: null, n: 0 };
    }
    function freeStack(s: Stack | null) {
      if (!s) return;
      kit.deleteTarget(s.a);
      kit.deleteTarget(s.b);
      kit.deleteTarget(s.last);
      kit.deleteTarget(s.first);
    }

    /** Adds one frame: accumulator a → b (then swapped), and the aligned frame into `last`. */
    function add(s: Stack, input: WebGLTexture, shift: [number, number], mode: number, weight: number, decay: number) {
      kit.draw(p.accum, s.b, {
        textures: { u_prev: s.a.tex as WebGLTexture, u_frame: input },
        uniforms: { u_shift: shift, u_weight: s.n === 0 ? 1 : weight, u_decay: decay },
        ints: { u_mode: mode },
      });
      [s.a, s.b] = [s.b, s.a];
      kit.draw(p.accum, s.last, { textures: { u_prev: s.a.tex as WebGLTexture, u_frame: input }, uniforms: { u_shift: shift, u_weight: 1, u_decay: 1 }, ints: { u_mode: 0 } });
      s.n++;
    }

    function finish(s: Stack, target: RenderTarget, params: Params) {
      kit.draw(p.finish, target, {
        textures: { u_acc: s.a.tex as WebGLTexture, u_last: s.last.tex as WebGLTexture },
        uniforms: { u_ghost: params.mode === 'ghost' ? GHOST : 0 },
      });
    }

    function cleanupCapture() {
      if (!cap) return;
      freeStack(cap);
      kit.deleteTarget(cap.align);
      cap = null;
    }

    return {
      render(req: RenderRequest, target) {
        // Live preview: an exponential moving average (or decaying lighten) of recent frames.
        const key = `${req.width}x${req.height}|${req.params.mode}|${req.params.seconds}`;
        if (!preview || key !== previewKey) {
          freeStack(preview);
          preview = makeStack(req.width, req.height);
          previewKey = key;
        }
        const h = req.history;
        const frameKey = h ? `${h.head}:${h.count}` : String(performance.now());
        if (frameKey !== lastFrameKey || preview.n === 0) {
          lastFrameKey = frameKey;
          const seconds = Number(req.params.seconds) || 3;
          const mode = MODES[String(req.params.mode)] ?? 0;
          add(preview, req.input, [0, 0], mode, emaAlpha(seconds), 1 - emaAlpha(seconds) * 0.5);
        }
        finish(preview, target, req.params);
      },

      beginCapture(params, _seed, srcW, srcH) {
        cleanupCapture();
        const [aw, ah] = alignSize(srcW, srcH);
        cap = {
          ...makeStack(srcW, srcH),
          first: kit.createTarget(srcW, srcH),
          params: { ...params },
          started: performance.now(),
          seconds: Math.max(1, Number(params.seconds) || 3),
          align: kit.createTarget(aw, ah),
          ref: null,
          aw,
          ah,
          shifts: 0,
        };
      },

      feedCapture(input) {
        const c = cap;
        if (!c) return 0;
        let shift: [number, number] = [0, 0];
        if (c.params.steady === true) {
          kit.draw(p.copy, c.align, { textures: { u_input: input } });
          const gray = grayFromRgba(kit.readPixels(c.align), c.aw, c.ah);
          if (!c.ref) c.ref = gray;
          else {
            const s = estimateShift(c.ref, gray, c.aw, c.ah);
            shift = [s.dx / c.aw, s.dy / c.ah];
            if (s.dx !== 0 || s.dy !== 0) c.shifts++;
          }
        }
        if (c.n === 0 && c.first) kit.draw(p.copy, c.first, { textures: { u_input: input } });
        const mode = MODES[String(c.params.mode)] ?? 0;
        add(c, input, shift, mode, meanWeight(c.n + 1), 1);
        return Math.min(1, (performance.now() - c.started) / 1000 / c.seconds);
      },

      finishCapture(): CaptureResult {
        const c = cap;
        try {
          if (!c || c.n === 0) throw new Error('Nothing recorded yet');
          const w = c.a.width;
          const h = c.a.height;
          const out = kit.createTarget(w, h);
          try {
            finish(c, out, c.params);
            const image = new ImageData(kit.readPixels(out), w, h);
            const original = c.first ? new ImageData(kit.readPixels(c.first), w, h) : undefined;
            logEvent('info', 'long-exposure', `Stacked ${c.n} frames over ${((performance.now() - c.started) / 1000).toFixed(1)} s`, { aligned: c.shifts, mode: c.params.mode, halfFloat: kit.halfFloatTargets });
            return { image, ...(original ? { original } : {}), method: 'long-exposure' };
          } finally {
            kit.deleteTarget(out);
          }
        } finally {
          cleanupCapture();
        }
      },

      cancelCapture() {
        cleanupCapture();
      },

      info() {
        return cap ? { capture: 'stacking', frames: cap.n, aligned: cap.shifts } : { capture: 'idle', preview: preview ? `${preview.a.width}×${preview.a.height}` : null };
      },

      dispose() {
        cleanupCapture();
        freeStack(preview);
        preview = null;
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
