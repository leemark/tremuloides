import { COLOR_GLSL, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import { hexToRgb01 } from '../params';
import type { Lens, Params } from '../types';
import { GRID_EDGE, STYLES, contoursToSvg, type ContourParams, type TopoStyle } from './contours';
import { contoursAsync } from './client';
import FIELD from './shaders/field.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import TOPO from './shaders/topo.frag.glsl?raw';

const PREVIEW_FIELD_EDGE = 768;
const FINAL_FIELD_EDGE = 2048;

function styleOf(p: Params): TopoStyle {
  const s = String(p.style);
  return s in STYLES ? (s as TopoStyle) : 'usgs';
}

function contourParams(p: Params): ContourParams {
  return { levels: Number(p.levels), smoothing: Number(p.smoothing) };
}

export const topoLens: Lens = {
  id: 'topo',
  name: 'Topo',
  tagline: 'Light as elevation: a contour map of the scene',
  version: 2,
  kind: 'realtime',
  seeded: false,
  params: [
    { id: 'levels', label: 'Contour levels', type: 'range', min: 8, max: 60, step: 1, default: 18, help: 'Every 5th line is a thicker index contour' },
    { id: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 20, step: 0.5, default: 12, help: 'Higher = calmer, rounder lines' },
    {
      id: 'style',
      label: 'Style',
      type: 'select',
      options: [
        { value: 'usgs', label: 'USGS quad' },
        { value: 'night', label: 'Night (gold on ink)' },
        { value: 'blueprint', label: 'Blueprint' },
      ],
      default: 'usgs',
    },
    { id: 'hillshade', label: 'Hillshade', type: 'toggle', default: true, help: 'Shaded relief under the lines' },
    { id: 'lineWeight', label: 'Line weight', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.2 },
  ],
  actions: [
    {
      id: 'svg',
      label: 'SVG',
      icon: 'svg',
      async run(ctx) {
        if (!ctx.capture.originalKey) {
          ctx.toast('SVG needs the original photo (turn on Keep originals)');
          return;
        }
        ctx.toast('Tracing contours…');
        const blob = await ctx.source();
        const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        const s = Math.min(1, GRID_EDGE / Math.max(probe.width, probe.height));
        const w = Math.max(2, Math.round(probe.width * s));
        const h = Math.max(2, Math.round(probe.height * s));
        probe.close();
        const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        const canvas = new OffscreenCanvas(w, h);
        const c2d = canvas.getContext('2d');
        if (!c2d) throw new Error('2D canvas unavailable');
        c2d.drawImage(bmp, 0, 0);
        bmp.close();
        const px = c2d.getImageData(0, 0, w, h).data;
        const set = await contoursAsync(px, w, h, contourParams(ctx.capture.params));
        const svg = contoursToSvg(set, styleOf(ctx.capture.params), Number(ctx.capture.params.lineWeight) || 1.2, `Tremuloides Topo - ${ctx.filenameBase}`);
        await ctx.share(new File([svg], `${ctx.filenameBase}.svg`, { type: 'image/svg+xml' }));
      },
    },
  ],

  create(kit: GLKit) {
    const p = {
      field: kit.program(fragment(COLOR_GLSL, FIELD), 'topo.field'),
      blur: kit.program(fragment(BLUR), 'topo.blur'),
      topo: kit.program(fragment(TOPO), 'topo.compose'),
    };
    let a: RenderTarget | null = null;
    let b: RenderTarget | null = null;

    return {
      render(req, target) {
        const edge = Math.min(req.quality === 'final' ? FINAL_FIELD_EDGE : PREVIEW_FIELD_EDGE, Math.max(req.width, req.height));
        const s = edge / Math.max(req.width, req.height);
        const fw = Math.max(2, Math.round(req.width * s));
        const fh = Math.max(2, Math.round(req.height * s));
        a = kit.ensureTarget(a, fw, fh, 'rgba16f');
        b = kit.ensureTarget(b, fw, fh, 'rgba16f');
        const fieldRef = refScale(fw, fh);
        const sigma = Math.max(0, Number(req.params.smoothing)) * fieldRef;
        kit.draw(p.field, a, { textures: { u_input: req.input } });
        kit.draw(p.blur, b, { textures: { u_src: a.tex as WebGLTexture }, uniforms: { u_dir: [1 / fw, 0], u_sigma: sigma } });
        kit.draw(p.blur, a, { textures: { u_src: b.tex as WebGLTexture }, uniforms: { u_dir: [0, 1 / fh], u_sigma: sigma } });
        const st = STYLES[styleOf(req.params)];
        const ref = refScale(req.width, req.height);
        kit.draw(p.topo, target, {
          textures: { u_field: a.tex as WebGLTexture },
          uniforms: {
            u_texel: [1 / fw, 1 / fh],
            u_levels: Math.max(2, Math.round(Number(req.params.levels))),
            u_lineHalf: Math.max(0.5, (Number(req.params.lineWeight) * ref) / 2),
            u_hillshade: req.params.hillshade === true ? 1 : 0,
            // Gradient over two field texels → slope per reference px, exaggerated.
            u_relief: 30 / (2 / fieldRef),
            u_skyTint: 1,
            u_paper: hexToRgb01(st.paper),
            u_line: hexToRgb01(st.line),
            u_index: hexToRgb01(st.index),
            u_sky: hexToRgb01(st.sky),
          },
        });
        if (req.quality === 'final') {
          kit.deleteTarget(a);
          kit.deleteTarget(b);
          a = b = null;
        }
      },
      info() {
        return { field: a ? `${a.width}×${a.height} ${a.format ?? 'rgba8'}` : null, halfFloat: kit.halfFloatTargets };
      },
      dispose() {
        kit.deleteTarget(a);
        kit.deleteTarget(b);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
