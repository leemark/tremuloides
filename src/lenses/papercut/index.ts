import { COLOR_GLSL, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import type { Lens } from '../types';
import FIELD from './shaders/field.frag.glsl?raw';
import BLUR3 from './shaders/blur3.frag.glsl?raw';
import PAPER from './shaders/paper.frag.glsl?raw';

const PAPERS: Record<string, number> = { photo: 0, white: 1, kraft: 2 };
const FIELD_EDGE = { preview: 640, final: 1600 } as const;
/** Colour is smoothed a little more than the cut shapes, then snapped to flat paper colours in the shader. */
const COLOR_SIGMA_FACTOR = 1.5;

export const papercutLens: Lens = {
  id: 'papercut',
  name: 'Papercut',
  tagline: 'Layered paper cut-outs with soft shadows',
  version: 1,
  kind: 'realtime',
  seeded: false,
  params: [
    { id: 'layers', label: 'Layers', type: 'range', min: 3, max: 8, step: 1, default: 5 },
    { id: 'smoothing', label: 'Cut smoothness', type: 'range', min: 2, max: 30, step: 1, default: 10, help: 'Higher = simpler, rounder cuts' },
    { id: 'shadow', label: 'Shadow depth', type: 'range', min: 0, max: 40, step: 1, default: 14 },
    {
      id: 'paper',
      label: 'Paper',
      type: 'select',
      options: [
        { value: 'photo', label: 'Photo colors' },
        { value: 'white', label: 'White' },
        { value: 'kraft', label: 'Kraft' },
      ],
      default: 'photo',
    },
    {
      id: 'order',
      label: 'In front',
      type: 'select',
      options: [
        { value: 'dark', label: 'Darker layers' },
        { value: 'light', label: 'Lighter layers' },
      ],
      default: 'dark',
      help: 'Landscapes: darker in front (hazy ridges and sky behind)',
    },
  ],

  create(kit: GLKit) {
    const p = {
      field: kit.program(fragment(COLOR_GLSL, FIELD), 'papercut.field'),
      blur: kit.program(fragment(BLUR3), 'papercut.blur'),
      paper: kit.program(fragment(COLOR_GLSL, PAPER), 'papercut.paper'),
    };
    let a: RenderTarget | null = null;
    let b: RenderTarget | null = null;

    return {
      render(req, target) {
        const W = req.width;
        const H = req.height;
        const s = Math.min(1, FIELD_EDGE[req.quality] / Math.max(W, H));
        const fw = Math.max(2, Math.round(W * s));
        const fh = Math.max(2, Math.round(H * s));
        a = kit.ensureTarget(a, fw, fh, 'rgba16f');
        b = kit.ensureTarget(b, fw, fh, 'rgba16f');
        const fref = refScale(fw, fh);
        const smooth = Number(req.params.smoothing) * fref;
        const sig = [smooth, smooth * COLOR_SIGMA_FACTOR, smooth * COLOR_SIGMA_FACTOR];
        kit.draw(p.field, a, { textures: { u_input: req.input } });
        kit.draw(p.blur, b, { textures: { u_src: a.tex as WebGLTexture }, uniforms: { u_dir: [1 / fw, 0], u_sigma: sig } });
        kit.draw(p.blur, a, { textures: { u_src: b.tex as WebGLTexture }, uniforms: { u_dir: [0, 1 / fh], u_sigma: sig } });
        const ref = refScale(W, H);
        kit.draw(p.paper, target, {
          textures: { u_field: a.tex as WebGLTexture },
          uniforms: {
            u_px: [1 / W, 1 / H],
            u_layers: Math.round(Number(req.params.layers)),
            u_shadow: Number(req.params.shadow) * ref,
            u_ref: ref,
            u_seed: 3.7,
          },
          ints: { u_darkFront: req.params.order === 'light' ? 0 : 1, u_paper: PAPERS[String(req.params.paper)] ?? 0 },
        });
        if (req.quality === 'final') {
          kit.deleteTarget(a);
          kit.deleteTarget(b);
          a = b = null;
        }
      },
      dispose() {
        kit.deleteTarget(a);
        kit.deleteTarget(b);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
