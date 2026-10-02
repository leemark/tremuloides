import { COLOR_GLSL, fragment } from '../../gl/kit';
import type { Lens } from '../types';
import FRAG from './shaders/posterize.frag.glsl?raw';

export const posterizeLens: Lens = {
  id: 'posterize',
  name: 'Posterize',
  tagline: 'Flat bands of light, colors kept',
  version: 1,
  kind: 'realtime',
  seeded: false,
  params: [
    { id: 'levels', label: 'Levels', type: 'range', min: 2, max: 12, step: 1, default: 5, help: 'Number of lightness bands' },
    { id: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.05, default: 1.2 },
    { id: 'soft', label: 'Soft steps', type: 'toggle', default: false, help: 'Blend the edges between bands' },
  ],
  create(kit) {
    const program = kit.program(fragment(COLOR_GLSL, FRAG), 'posterize');
    return {
      render(req, target) {
        kit.draw(program, target, {
          textures: { u_input: req.input },
          uniforms: {
            u_levels: Number(req.params.levels),
            u_saturation: Number(req.params.saturation),
            u_soft: req.params.soft === true ? 0.18 : 0,
          },
        });
      },
      dispose() {
        program.dispose();
      },
    };
  },
};
