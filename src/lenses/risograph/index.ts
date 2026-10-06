import { COLOR_GLSL, fragment, refScale, type GLKit } from '../../gl/kit';
import type { Lens } from '../types';
import { mulberry32 } from '../../util/prng';
import { COMBOS, separation, type Separation } from './separation';
import RISO from './shaders/riso.frag.glsl?raw';

const cache = new Map<string, Separation>();
function sepFor(combo: string): Separation {
  const key = combo in COMBOS ? combo : 'pinkteal';
  let s = cache.get(key);
  if (!s) {
    s = separation(COMBOS[key]?.inks ?? ['pink', 'teal']);
    cache.set(key, s);
  }
  return s;
}

export const risographLens: Lens = {
  id: 'risograph',
  name: 'Risograph',
  tagline: 'Two or three spot inks, halftone grain, slightly off-register',
  version: 1,
  kind: 'realtime',
  seeded: true,
  params: [
    { id: 'inks', label: 'Inks', type: 'select', options: Object.entries(COMBOS).map(([value, c]) => ({ value, label: c.label })), default: 'pinkblueyellow' },
    {
      id: 'screen',
      label: 'Screen',
      type: 'select',
      options: [
        { value: 'dots', label: 'Halftone dots' },
        { value: 'grain', label: 'Grain' },
      ],
      default: 'dots',
    },
    { id: 'dot', label: 'Dot size', type: 'range', min: 3, max: 16, step: 0.5, default: 6, help: 'Halftone cell size' },
    { id: 'misregister', label: 'Misregistration', type: 'range', min: 0, max: 12, step: 0.5, default: 3, help: 'How far the ink layers drift apart' },
    { id: 'density', label: 'Ink density', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1.1 },
    { id: 'contrast', label: 'Contrast', type: 'range', min: 0.6, max: 2, step: 0.05, default: 1.25 },
  ],

  create(kit: GLKit) {
    const prog = kit.program(fragment(COLOR_GLSL, RISO), 'risograph');
    return {
      render(req, target) {
        const W = req.width;
        const H = req.height;
        const ref = refScale(W, H);
        const sep = sepFor(String(req.params.inks));
        // Misregistration: a fixed direction per ink from the seed; the first ink stays put.
        const rand = mulberry32(req.seed);
        const mis = Number(req.params.misregister) * ref;
        const offsets = new Float32Array(6);
        for (let i = 1; i < 3; i++) {
          const a = rand() * Math.PI * 2;
          offsets[i * 2] = (Math.cos(a) * mis) / W;
          offsets[i * 2 + 1] = (Math.sin(a) * mis) / H;
        }
        kit.draw(prog, target, {
          textures: { u_input: req.input },
          uniforms: {
            u_paper: sep.paper,
            u_size: [W, H],
            u_cell: Math.max(2, Number(req.params.dot) * ref),
            u_density: Number(req.params.density),
            u_contrast: Number(req.params.contrast),
            u_ref: ref,
            u_seed: (req.seed % 997) * 0.37,
          },
          ints: { u_count: sep.count, u_screen: req.params.screen === 'grain' ? 1 : 0 },
          vec3Arrays: { u_ink: Float32Array.from(sep.inks.flat()), u_rows: Float32Array.from(sep.rows.flat()) },
          vec2Arrays: { u_offset: offsets },
        });
      },
      dispose() {
        prog.dispose();
      },
    };
  },
};

