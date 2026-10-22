import { COLOR_GLSL, GLSL_HEADER, Program, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import { paletteUniform } from '../../color/palette';
import { hexToRgb01 } from '../params';
import { timelapseAction } from '../flow-painter/timelapse';
import type { Lens, ParamSpec, Params, RenderRequest } from '../types';
import { BATCH, MAX_PIGMENTS, batches, palette, planFaces, planLayers, previewLayers, totalDots, type DotLayer, type DotParams, type FaceDots } from './plan';
import DOT_VS from './shaders/dot.vert.glsl?raw';
import DOT_FS from './shaders/dot.frag.glsl?raw';
import GROUND from './shaders/ground.frag.glsl?raw';
import COPY from '../flow-painter/shaders/copy.frag.glsl?raw';
import CANVAS from '../flow-painter/shaders/canvas.frag.glsl?raw';

export const GROUNDS: Record<string, string> = {
  cream: '#efe6d0',
  white: '#f7f5ef',
  umber: '#5e4530',
};

const PARAMS: ParamSpec[] = [
  { id: 'dotSize', label: 'Dot size', type: 'range', min: 3, max: 20, step: 0.5, default: 14, help: 'The main dots; a ground of bigger dots goes under them, finer ones over detail' },
  { id: 'detail', label: 'Detail', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, help: 'More dots, and fine dots paint more of the picture' },
  {
    id: 'palette',
    label: 'Colors',
    type: 'select',
    options: [
      { value: 'seurat', label: 'Pure pigments' },
      { value: 'photo', label: 'Photo colors' },
    ],
    default: 'seurat',
    help: 'Pure pigments mix in your eye, as Seurat painted',
  },
  { id: 'separation', label: 'Color separation', type: 'range', min: 0, max: 1, step: 0.05, default: 0.75, help: 'How far neighboring dots differ from each other and from the photo' },
  {
    id: 'ground',
    label: 'Canvas',
    type: 'select',
    options: [
      { value: 'cream', label: 'Cream' },
      { value: 'white', label: 'White' },
      { value: 'umber', label: 'Umber' },
    ],
    default: 'cream',
  },
];

function dotParams(p: Params): DotParams {
  return { dotSize: Number(p.dotSize), detail: Number(p.detail) };
}

/** Dots a render paints (timelapse pacing). */
export function dotCount(params: Params, w: number, h: number): number {
  return totalDots(planLayers(w, h, dotParams(params)));
}

export const pointillismLens: Lens = {
  id: 'pointillism',
  name: 'Pointillism',
  tagline: 'Thousands of dots of pure color that blend in your eye',
  version: 1,
  usesFaces: true,
  kind: 'still',
  seeded: true,
  actions: [timelapseAction(async () => pointillismLens, dotCount)],
  params: PARAMS,

  create(kit: GLKit) {
    const gl = kit.gl;
    const p = {
      copy: kit.program(fragment(COPY), 'dots.copy'),
      ground: kit.program(fragment(GROUND), 'dots.ground'),
      dot: new Program(gl, fragment(DOT_FS), GLSL_HEADER + COLOR_GLSL + '\n' + DOT_VS, 'dots.dot'),
      canvas: kit.program(fragment(CANVAS), 'dots.canvas'),
    };
    let lastPlan = '';
    // the live preview repaints every frame: its targets are kept
    let pSrc: RenderTarget | null = null;
    let pPaint: RenderTarget | null = null;

    function dots(req: RenderRequest, src: RenderTarget, paint: RenderTarget, layer: DotLayer, first: number, count: number, faces: FaceDots[]) {
      const pal = String(req.params.palette) === 'photo' ? [] : palette(String(req.params.palette));
      kit.drawInstanced(
        p.dot,
        paint,
        {
          textures: { u_src: src.tex as WebGLTexture },
          uniforms: {
            u_size: [req.width, req.height],
            u_cell: layer.cell,
            u_dot: layer.size,
            u_lod: layer.lod,
            u_prevLod: layer.prevLod,
            u_accept: 0.05 / Math.max(0.25, Number(req.params.detail)),
            u_gridOrigin: [layer.originX, layer.originY],
            u_separation: Number(req.params.separation),
          },
          vec3Arrays: {
            u_pigments: paletteUniform(pal, MAX_PIGMENTS),
            ...(faces.length ? { u_faceShape: new Float32Array(faces.flatMap((f) => [f.ellipse.rx, f.ellipse.ry, f.size])) } : {}),
          },
          ...(faces.length ? { vec2Arrays: { u_faceCentre: new Float32Array(faces.flatMap((f) => [f.ellipse.cx, f.ellipse.cy])) } } : {}),
          ints: {
            u_cols: layer.cols,
            u_count: layer.count,
            u_prime: layer.prime,
            u_offset: first,
            u_layer: layer.index,
            u_seed: req.seed % 2147483647,
            u_pigmentCount: Math.min(MAX_PIGMENTS, pal.length),
            u_faceCount: faces.length,
            u_face: layer.face,
          },
        },
        4,
        count,
        true,
      );
    }

    function finish(req: RenderRequest, paint: RenderTarget, target: RenderTarget) {
      const ref = refScale(req.width, req.height);
      kit.draw(p.canvas, target, {
        textures: { u_paint: paint.tex as WebGLTexture },
        uniforms: { u_ref: ref, u_weave: Math.min(1, Math.max(0, (2.2 * ref - 1.5) / 2)) },
      });
    }

    return {
      async render(req, target) {
        const W = req.width;
        const H = req.height;
        const layers = planLayers(W, H, dotParams(req.params));
        const faces = planFaces(req.faces, W, H, dotParams(req.params), layers);
        const live = req.quality === 'preview';
        // the viewfinder draws the layers that fit its budget; photos get every dot
        const all: DotLayer[] = live ? [...previewLayers(layers), ...faces] : [...layers, ...faces];
        const byIndex = new Map(all.map((l) => [l.index, l]));
        const src = live ? (pSrc = kit.ensureTarget(pSrc, W, H)) : kit.createTarget(W, H);
        const paint = live ? (pPaint = kit.ensureTarget(pPaint, W, H)) : kit.createTarget(W, H);
        try {
          kit.draw(p.copy, src, { textures: { u_input: req.input } });
          gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          const ground = String(req.params.ground);
          kit.draw(p.ground, paint, {
            textures: { u_src: src.tex as WebGLTexture },
            uniforms: {
              u_tone: hexToRgb01(GROUNDS[ground] ?? GROUNDS.cream ?? '#efe6d0'),
              u_lod: Math.max(0, Math.log2((Number(req.params.dotSize) * 6 * refScale(W, H)) / 2)),
              u_wash: ground === 'umber' ? 0.6 : 0.8,
            },
          });
          const tl = req.timelapse;
          const list = batches(all, tl ? Math.max(1, Math.round(tl.batch)) : BATCH);
          lastPlan = `${req.quality} ${all.map((l) => `${l.count}×${(l.size / refScale(W, H)).toFixed(1)}`).join(' + ')} dots${faces.length ? ` (${faces.length} faces)` : ''}`;
          if (tl) {
            finish(req, paint, target);
            await tl.frame(0);
          }
          for (let i = 0; i < list.length; i++) {
            const bt = list[i];
            // by index: the viewfinder may leave out a fine layer, and face layers' indices follow every regular one
            const layer = bt && byIndex.get(bt.layer);
            if (!bt || !layer) continue;
            dots(req, src, paint, layer, bt.first, bt.count, faces);
            if (tl) {
              finish(req, paint, target);
              await tl.frame((i + 1) / list.length);
              if (gl.isContextLost()) throw new Error('Graphics context was lost while painting');
            } else if (req.quality === 'final' && i % 4 === 3) {
              gl.flush();
              req.onProgress?.((i + 1) / list.length);
              await new Promise((r) => setTimeout(r, 0));
              if (gl.isContextLost()) throw new Error('Graphics context was lost while painting');
            }
          }
          finish(req, paint, target);
          req.onProgress?.(1);
        } finally {
          if (!live) {
            kit.deleteTarget(src);
            kit.deleteTarget(paint);
          }
        }
      },
      info() {
        return { plan: lastPlan };
      },
      dispose() {
        kit.deleteTarget(pSrc);
        kit.deleteTarget(pPaint);
        pSrc = pPaint = null;
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
