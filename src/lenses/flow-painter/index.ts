import { COLOR_GLSL, GLSL_HEADER, Program, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import { hexToRgb01 } from '../params';
import type { Lens, Params, RenderRequest } from '../types';
import { BATCH, FINAL_SEGMENTS, PREVIEW_SEGMENTS, batches, planLayers, previewLayers, type LayerPlan, type PaintParams } from './plan';
import { timelapseAction } from './timelapse';
import STROKE_VS from './shaders/stroke.vert.glsl?raw';
import STROKE_FS from './shaders/stroke.frag.glsl?raw';
import TENSOR from './shaders/tensor.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import COPY from './shaders/copy.frag.glsl?raw';
import CANVAS from './shaders/canvas.frag.glsl?raw';
import WASH from './shaders/wash.frag.glsl?raw';

const PREVIEW_FIELD_EDGE = 512;
const FINAL_FIELD_EDGE = 1024;
/** Gradients below this (Oklab L per reference px) count as flat; flat areas paint horizontally. */
const FLAT_GRADIENT = 0.0015;

export const CANVAS_TONES: Record<string, string> = {
  linen: '#e8dcc4',
  umber: '#5e4530',
  gesso: '#f5f2ea',
  slate: '#2b2e33',
};

function paintParams(p: Params): PaintParams {
  return { detail: Number(p.detail), strokeLength: Number(p.strokeLength), strokeWidth: Number(p.strokeWidth), layers: Number(p.layers) };
}

interface Targets {
  src: RenderTarget | null;
  a: RenderTarget | null;
  b: RenderTarget | null;
  paint: RenderTarget | null;
}

export const flowPainterLens: Lens = {
  id: 'flow-painter',
  name: 'Flow Painter',
  tagline: 'Brush strokes that follow the shapes in the scene',
  version: 2,
  kind: 'still', // the viewfinder shows the coarse layers; full detail paints after capture
  seeded: true,
  actions: [timelapseAction()],
  params: [
    { id: 'detail', label: 'Detail', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, help: 'More strokes, and fine brushes paint more of the picture' },
    { id: 'strokeLength', label: 'Stroke length', type: 'range', min: 10, max: 120, step: 1, default: 40 },
    { id: 'strokeWidth', label: 'Stroke width', type: 'range', min: 2, max: 20, step: 0.5, default: 6, help: 'Finest brush; each coarser layer doubles it' },
    { id: 'jitter', label: 'Color jitter', type: 'range', min: 0, max: 1, step: 0.05, default: 0.45 },
    { id: 'layers', label: 'Layers', type: 'range', min: 1, max: 4, step: 1, default: 3, help: 'Coarse-to-fine passes of the brush' },
    {
      id: 'canvas',
      label: 'Canvas tone',
      type: 'select',
      options: [
        { value: 'linen', label: 'Linen' },
        { value: 'umber', label: 'Raw umber ground' },
        { value: 'gesso', label: 'White gesso' },
        { value: 'slate', label: 'Slate' },
      ],
      default: 'linen',
    },
  ],

  create(kit: GLKit) {
    const gl = kit.gl;
    const p = {
      copy: kit.program(fragment(COPY), 'flow.copy'),
      tensor: kit.program(fragment(COLOR_GLSL, TENSOR), 'flow.tensor'),
      blur: kit.program(fragment(BLUR), 'flow.blur'),
      stroke: new Program(gl, fragment(STROKE_FS), GLSL_HEADER + COLOR_GLSL + '\n' + STROKE_VS, 'flow.stroke'),
      canvas: kit.program(fragment(CANVAS), 'flow.canvas'),
      wash: kit.program(fragment(WASH), 'flow.wash'),
    };
    const preview: Targets = { src: null, a: null, b: null, paint: null };
    let lastPlan = '';

    /** Photo copy with mipmaps (blurred colors per brush size), and the smoothed structure tensor. */
    function prepare(t: Targets, req: RenderRequest, fieldEdge: number): { tensor: RenderTarget; src: RenderTarget } {
      const W = req.width;
      const H = req.height;
      t.src = kit.ensureTarget(t.src, W, H);
      kit.draw(p.copy, t.src, { textures: { u_input: req.input } });
      gl.bindTexture(gl.TEXTURE_2D, t.src.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

      const s = Math.min(1, fieldEdge / Math.max(W, H));
      const fw = Math.max(2, Math.round(W * s));
      const fh = Math.max(2, Math.round(H * s));
      t.a = kit.ensureTarget(t.a, fw, fh, 'rgba16f');
      t.b = kit.ensureTarget(t.b, fw, fh, 'rgba16f');
      const fieldRef = refScale(fw, fh);
      kit.draw(p.tensor, t.a, {
        textures: { u_src: t.src.tex as WebGLTexture },
        uniforms: { u_texel: [1 / fw, 1 / fh], u_lod: Math.max(0, Math.log2(W / fw)), u_gradScale: fieldRef, u_flat: FLAT_GRADIENT },
      });
      const sigma = Math.min(24, Math.max(4, 2 * Number(req.params.strokeWidth))) * fieldRef;
      kit.draw(p.blur, t.b, { textures: { u_src: t.a.tex as WebGLTexture }, uniforms: { u_dir: [1 / fw, 0], u_sigma: sigma } });
      kit.draw(p.blur, t.a, { textures: { u_src: t.b.tex as WebGLTexture }, uniforms: { u_dir: [0, 1 / fh], u_sigma: sigma } });
      t.paint = kit.ensureTarget(t.paint, W, H);
      kit.draw(p.wash, t.paint, {
        textures: { u_src: t.src.tex as WebGLTexture },
        uniforms: {
          u_tone: hexToRgb01(CANVAS_TONES[String(req.params.canvas)] ?? CANVAS_TONES.linen ?? '#e8dcc4'),
          u_lod: Math.max(0, Math.log2((Math.max(4, Number(req.params.strokeWidth)) * 8 * refScale(W, H)) / 2)),
        },
      });
      return { tensor: t.a, src: t.src };
    }

    function strokes(req: RenderRequest, t: Targets, layer: LayerPlan, first: number, count: number, segments: number) {
      const detail = Math.max(0.25, Number(req.params.detail));
      kit.drawInstanced(
        p.stroke,
        t.paint as RenderTarget,
        {
          textures: { u_src: (t.src as RenderTarget).tex as WebGLTexture, u_tensor: (t.a as RenderTarget).tex as WebGLTexture },
          uniforms: {
            u_size: [req.width, req.height],
            u_cell: layer.cell,
            u_width: layer.width,
            u_length: layer.length,
            u_lod: layer.lod,
            u_prevLod: layer.prevLod,
            u_accept: 0.06 / detail,
            u_jitter: Number(req.params.jitter),
            u_edgeStop: layer.prevLod < 0 ? 0.45 : 0.28,
            u_bristles: Math.max(3, layer.width / 1.6),
            u_dry: layer.prevLod < 0 ? 0.1 : 0.4,
          },
          ints: {
            u_cols: layer.cols,
            u_count: layer.count,
            u_prime: layer.prime,
            u_offset: first,
            u_layer: layer.index,
            u_seed: req.seed % 2147483647,
            u_segments: segments,
          },
        },
        2 * (segments + 1),
        count,
        true,
      );
    }

    function finish(req: RenderRequest, t: Targets, target: RenderTarget) {
      kit.draw(p.canvas, target, {
        textures: { u_paint: (t.paint as RenderTarget).tex as WebGLTexture },
        // The weave fades out when it would be finer than ~1.5 px (small previews), avoiding moiré.
        uniforms: { u_ref: refScale(req.width, req.height), u_weave: Math.min(1, Math.max(0, (2.2 * refScale(req.width, req.height) - 1.5) / 2)) },
      });
    }

    function free(t: Targets) {
      kit.deleteTarget(t.src);
      kit.deleteTarget(t.a);
      kit.deleteTarget(t.b);
      kit.deleteTarget(t.paint);
      t.src = t.a = t.b = t.paint = null;
    }

    return {
      async render(req, target) {
        const layers = planLayers(req.width, req.height, paintParams(req.params));
        if (req.quality === 'preview') {
          const shown = previewLayers(layers);
          lastPlan = `${shown.length}/${layers.length} layers · ${shown.reduce((n, l) => n + l.count, 0)} strokes`;
          prepare(preview, req, PREVIEW_FIELD_EDGE);
          for (const l of shown) strokes(req, preview, l, 0, l.count, PREVIEW_SEGMENTS);
          finish(req, preview, target);
          return;
        }
        // Final: own targets (the live preview keeps drawing with this instance in between batches).
        const t: Targets = { src: null, a: null, b: null, paint: null };
        try {
          prepare(t, req, FINAL_FIELD_EDGE);
          const tl = req.timelapse;
          const list = batches(layers, tl ? Math.max(1, Math.round(tl.batch)) : BATCH);
          lastPlan = `final ${layers.length} layers · ${layers.reduce((n, l) => n + l.count, 0)} strokes · ${list.length} batches`;
          if (tl) {
            finish(req, t, target); // the underpainting
            await tl.frame(0);
          }
          for (let i = 0; i < list.length; i++) {
            const bt = list[i];
            const layer = bt && layers[bt.layer];
            if (!bt || !layer) continue;
            strokes(req, t, layer, bt.first, bt.count, FINAL_SEGMENTS);
            if (tl) {
              finish(req, t, target);
              await tl.frame((i + 1) / list.length);
              if (gl.isContextLost()) throw new Error('Graphics context was lost while painting');
            } else if (i % 2 === 1) {
              gl.flush();
              req.onProgress?.((i + 1) / list.length);
              await new Promise((r) => setTimeout(r, 0));
              if (gl.isContextLost()) throw new Error('Graphics context was lost while painting');
            }
          }
          finish(req, t, target);
          req.onProgress?.(1);
        } finally {
          free(t);
        }
      },
      info() {
        return { plan: lastPlan };
      },
      dispose() {
        free(preview);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
