import { COLOR_GLSL, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import type { Lens } from '../types';
import IR from './shaders/ir.frag.glsl?raw';
import BRIGHT from './shaders/bright.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import GLOW from './shaders/glow.frag.glsl?raw';

const VARIANTS: Record<string, number> = { aerochrome: 0, pink: 1, mono: 2 };
/** Halation radius (reference px) and the resolution it's computed at (fraction of output). */
const GLOW_SIGMA = 14;
const GLOW_SCALE = 0.25;

export const aerochromeLens: Lens = {
  id: 'aerochrome',
  name: 'Aerochrome',
  tagline: 'Infrared film: leaves turn crimson, skies go deep',
  version: 1,
  kind: 'realtime',
  seeded: false,
  params: [
    {
      id: 'variant',
      label: 'Film',
      type: 'select',
      options: [
        { value: 'aerochrome', label: 'Aerochrome' },
        { value: 'pink', label: 'Hot pink' },
        { value: 'mono', label: 'Mono IR' },
      ],
      default: 'aerochrome',
    },
    { id: 'foliage', label: 'Foliage glow', type: 'range', min: 0, max: 1.5, step: 0.05, default: 1, help: 'How strongly leaves shine in infrared' },
    { id: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.05, default: 1.15 },
    { id: 'halation', label: 'Halation', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, help: 'Soft bloom around bright areas, like IR film' },
  ],

  create(kit: GLKit) {
    const p = {
      ir: kit.program(fragment(COLOR_GLSL, IR), 'aerochrome.ir'),
      bright: kit.program(fragment(BRIGHT), 'aerochrome.bright'),
      blur: kit.program(fragment(BLUR), 'aerochrome.blur'),
      glow: kit.program(fragment(GLOW), 'aerochrome.glow'),
    };
    const t: Record<'base' | 'a' | 'b', RenderTarget | null> = { base: null, a: null, b: null };

    return {
      render(req, target) {
        const halation = Number(req.params.halation);
        const irUniforms = {
          textures: { u_input: req.input },
          uniforms: { u_foliage: Number(req.params.foliage), u_saturation: Number(req.params.saturation) },
          ints: { u_variant: VARIANTS[String(req.params.variant)] ?? 0 },
        };
        if (!(halation > 0)) {
          kit.draw(p.ir, target, irUniforms);
          return;
        }
        const W = req.width;
        const H = req.height;
        t.base = kit.ensureTarget(t.base, W, H);
        kit.draw(p.ir, t.base, irUniforms);
        const gw = Math.max(2, Math.round(W * GLOW_SCALE));
        const gh = Math.max(2, Math.round(H * GLOW_SCALE));
        t.a = kit.ensureTarget(t.a, gw, gh);
        t.b = kit.ensureTarget(t.b, gw, gh);
        const sigma = GLOW_SIGMA * refScale(gw, gh);
        kit.draw(p.bright, t.a, { textures: { u_src: t.base.tex as WebGLTexture } });
        kit.draw(p.blur, t.b, { textures: { u_src: t.a.tex as WebGLTexture }, uniforms: { u_dir: [1 / gw, 0], u_sigma: sigma } });
        kit.draw(p.blur, t.a, { textures: { u_src: t.b.tex as WebGLTexture }, uniforms: { u_dir: [0, 1 / gh], u_sigma: sigma } });
        kit.draw(p.glow, target, { textures: { u_base: t.base.tex as WebGLTexture, u_glow: t.a.tex as WebGLTexture }, uniforms: { u_amount: halation } });
        if (req.quality === 'final') {
          for (const k of ['base', 'a', 'b'] as const) {
            kit.deleteTarget(t[k]);
            t[k] = null;
          }
        }
      },
      dispose() {
        for (const k of ['base', 'a', 'b'] as const) kit.deleteTarget(t[k]);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
