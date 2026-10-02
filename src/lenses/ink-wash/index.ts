import { COLOR_GLSL, fragment, type GLKit, type RenderTarget } from '../../gl/kit';
import { blendPalettes, extractPalette, hexPalette, paletteUniform } from '../../color/palette';
import { paletteClient } from '../../color/palette-client';
import type { Vec3 } from '../../color/oklab';
import { hexToRgb01 } from '../params';
import type { Lens, RenderRequest } from '../types';
import { planInkWash } from './plan';
import { logEvent } from '../../diagnostics/log';
import CODEC from './shaders/tensor-codec.glsl?raw';
import TENSOR from './shaders/tensor.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import KUWAHARA from './shaders/kuwahara.frag.glsl?raw';
import INK from './shaders/ink.frag.glsl?raw';
import FLOW from './shaders/flow.frag.glsl?raw';
import COMPOSITE from './shaders/composite.frag.glsl?raw';
import COPY from './shaders/copy.frag.glsl?raw';

/** Autumn San Juans palette (PRD §14 M2). */
export const SAN_JUAN_HEX = ['#e9b825', '#d96a27', '#a4412e', '#2e4a3b', '#7e8f6a', '#4e86c8', '#8b8781', '#f3f2ec', '#1a1c21'] as const;
const SAN_JUAN = hexPalette(SAN_JUAN_HEX);
const MODES: Record<string, number> = { auto: 0, sanjuan: 1, gouache: 2, mono: 3 };
const PALETTE_SAMPLE_EDGE = 128;
const PALETTE_REFRESH_MS = 1000;

interface Targets {
  tensorA: RenderTarget | null;
  tensorB: RenderTarget | null;
  paint: RenderTarget | null;
  ink: RenderTarget | null;
  flow: RenderTarget | null;
}

const emptyTargets = (): Targets => ({ tensorA: null, tensorB: null, paint: null, ink: null, flow: null });

export const inkWashLens: Lens = {
  id: 'ink-wash',
  name: 'Ink & Wash',
  tagline: 'Painterly brushwork with inked edges',
  version: 1,
  kind: 'realtime',
  seeded: false,
  params: [
    { id: 'brush', label: 'Brush size', type: 'range', min: 2, max: 14, step: 0.5, default: 6, help: 'Size of the painted strokes' },
    { id: 'sharpness', label: 'Edge sharpness', type: 'range', min: 1, max: 16, step: 1, default: 8 },
    {
      id: 'palette',
      label: 'Palette',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'sanjuan', label: 'San Juan' },
        { value: 'gouache', label: 'Gouache' },
        { value: 'mono', label: 'Mono ink' },
      ],
      default: 'auto',
    },
    { id: 'colors', label: 'Colors', type: 'range', min: 3, max: 12, step: 1, default: 7, help: 'For Auto and Gouache palettes' },
    { id: 'lineWeight', label: 'Line weight', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.3 },
    { id: 'lineAmount', label: 'Line amount', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    {
      id: 'lineStyle',
      label: 'Line style',
      type: 'select',
      options: [
        { value: 'clean', label: 'Clean' },
        { value: 'flow', label: 'Flow' },
      ],
      default: 'clean',
    },
    { id: 'ink', label: 'Ink color', type: 'color', default: '#1a1c21' },
    { id: 'paper', label: 'Paper texture', type: 'toggle', default: true },
    {
      id: 'quality',
      label: 'Quality',
      type: 'select',
      options: [
        { value: 'fast', label: 'Fast' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'best', label: 'Best' },
      ],
      default: 'balanced',
      help: 'Preview smoothness vs. detail. Saved photos always use at least Balanced.',
    },
  ],

  create(kit: GLKit) {
    const p = {
      tensor: kit.program(fragment(COLOR_GLSL, CODEC, TENSOR), 'ink-wash.tensor'),
      blur: kit.program(fragment(CODEC, BLUR), 'ink-wash.blur'),
      kuwahara: kit.program(fragment(CODEC, KUWAHARA), 'ink-wash.kuwahara'),
      ink: kit.program(fragment(COLOR_GLSL, INK), 'ink-wash.ink'),
      flow: kit.program(fragment(CODEC, FLOW), 'ink-wash.flow'),
      composite: kit.program(fragment(COLOR_GLSL, COMPOSITE), 'ink-wash.composite'),
      copy: kit.program(fragment(COPY), 'ink-wash.copy'),
    };
    const sets: Record<'preview' | 'final', Targets> = { preview: emptyTargets(), final: emptyTargets() };
    let sampleTarget: RenderTarget | null = null;

    // Auto palette state (preview): refreshed about once a second in a worker, eased between updates.
    let autoPalette: Vec3[] | null = null;
    let autoK = 0;
    let lastRefresh = -Infinity;
    let inflight = false;

    function samplePixels(input: WebGLTexture, w: number, h: number): Uint8ClampedArray {
      const s = Math.min(1, PALETTE_SAMPLE_EDGE / Math.max(w, h));
      const sw = Math.max(1, Math.round(w * s));
      const sh = Math.max(1, Math.round(h * s));
      sampleTarget = kit.ensureTarget(sampleTarget, sw, sh);
      kit.draw(p.copy, sampleTarget, { textures: { u_input: input } });
      return kit.readPixels(sampleTarget);
    }

    function refreshPreviewPalette(req: RenderRequest, k: number) {
      const now = performance.now();
      if (inflight || (now - lastRefresh < PALETTE_REFRESH_MS && autoK === k)) return;
      lastRefresh = now;
      inflight = true;
      const pixels = samplePixels(req.input, req.width, req.height);
      void paletteClient
        .compute(pixels, k)
        .then((pal) => {
          autoPalette = autoK === k ? blendPalettes(autoPalette, pal.colors, 0.5) : pal.colors;
          autoK = k;
        })
        .catch((e: unknown) => logEvent('warn', 'ink-wash', 'Palette update failed', e))
        .finally(() => {
          inflight = false;
        });
    }

    function freeSet(t: Targets) {
      for (const key of Object.keys(t) as (keyof Targets)[]) {
        kit.deleteTarget(t[key]);
        t[key] = null;
      }
    }

    function draw(req: RenderRequest, target: RenderTarget, palette: Vec3[]) {
      const kind = req.quality;
      const plan = planInkWash(req.width, req.height, req.params, kind);
      const t = sets[kind];
      const W = req.width;
      const H = req.height;
      t.tensorA = kit.ensureTarget(t.tensorA, plan.tensorWidth, plan.tensorHeight, 'rgba16f');
      t.tensorB = kit.ensureTarget(t.tensorB, plan.tensorWidth, plan.tensorHeight, 'rgba16f');
      t.paint = kit.ensureTarget(t.paint, W, H);
      t.ink = kit.ensureTarget(t.ink, W, H);
      const encode = t.tensorA.format === 'rgba16f' ? 0 : 1;
      const tw = plan.tensorWidth;
      const th = plan.tensorHeight;

      // 1–3: structure tensor, smoothed
      kit.draw(p.tensor, t.tensorA, { textures: { u_input: req.input }, uniforms: { u_texel: [1 / tw, 1 / th], u_encode: encode } });
      const blurU = { u_stride: plan.tensorStride, u_sigma: plan.tensorSigma, u_encode: encode };
      kit.draw(p.blur, t.tensorB, {
        textures: { u_src: t.tensorA.tex as WebGLTexture },
        uniforms: { ...blurU, u_step: [plan.tensorStride / tw, 0] },
        ints: { u_taps: plan.tensorTaps },
      });
      kit.draw(p.blur, t.tensorA, {
        textures: { u_src: t.tensorB.tex as WebGLTexture },
        uniforms: { ...blurU, u_step: [0, plan.tensorStride / th] },
        ints: { u_taps: plan.tensorTaps },
      });
      const tensor = t.tensorA.tex as WebGLTexture;

      // 4: anisotropic Kuwahara
      kit.draw(p.kuwahara, t.paint, {
        textures: { u_input: req.input, u_tensor: tensor },
        uniforms: { u_outSize: [W, H], u_radius: plan.kuwaharaRadius, u_q: Number(req.params.sharpness), u_alpha: 1, u_encode: encode },
        ints: { u_samples: plan.kuwaharaSamples },
      });
      const paint = t.paint.tex as WebGLTexture;

      // 5–6: ink lines (optionally smoothed along the flow)
      kit.draw(p.ink, t.ink, {
        textures: { u_src: paint },
        uniforms: { u_outSize: [W, H], u_sigma: plan.inkSigma, u_stride: plan.inkStride, u_threshold: plan.inkThreshold },
        ints: { u_taps: plan.inkTaps },
      });
      let ink = t.ink.tex as WebGLTexture;
      if (req.params.lineStyle === 'flow') {
        t.flow = kit.ensureTarget(t.flow, W, H);
        kit.draw(p.flow, t.flow, {
          textures: { u_ink: ink, u_tensor: tensor },
          uniforms: { u_outSize: [W, H], u_length: plan.flowLength, u_encode: encode },
        });
        ink = t.flow.tex as WebGLTexture;
      }

      // 7: palette + ink + paper
      const mode = MODES[String(req.params.palette)] ?? 0;
      kit.draw(p.composite, target, {
        textures: { u_paint: paint, u_ink: ink },
        uniforms: {
          u_blendK: mode === 0 ? 55 : 40,
          u_levels: Number(req.params.colors),
          u_inkColor: hexToRgb01(String(req.params.ink)),
          u_paper: req.params.paper === true ? 1 : 0,
          u_refScale: plan.scale,
          u_outSize: [W, H],
        },
        ints: { u_mode: mode, u_count: Math.min(12, palette.length) },
        vec3Arrays: { u_palette: paletteUniform(palette) },
      });
    }

    return {
      render(req, target) {
        const k = Math.round(Number(req.params.colors));
        const auto = req.params.palette === 'auto';
        if (req.quality === 'final') {
          const finish = (palette: Vec3[]) => {
            try {
              draw(req, target, palette);
            } finally {
              freeSet(sets.final); // full-res intermediates are large; don't keep them
            }
          };
          if (!auto) {
            finish(SAN_JUAN);
            return;
          }
          const pixels = samplePixels(req.input, req.width, req.height);
          return paletteClient.compute(pixels, k).then((pal) => finish(pal.colors));
        }
        if (auto) {
          refreshPreviewPalette(req, k);
          if (!autoPalette || autoK !== k) {
            // First frame (or Colors changed): compute synchronously so the preview never flashes.
            const pixels = samplePixels(req.input, req.width, req.height);
            autoPalette = extractPalette(pixels, k, 1).colors;
            autoK = k;
          }
        }
        draw(req, target, auto ? (autoPalette ?? SAN_JUAN) : SAN_JUAN);
      },
      dispose() {
        freeSet(sets.preview);
        freeSet(sets.final);
        kit.deleteTarget(sampleTarget);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
