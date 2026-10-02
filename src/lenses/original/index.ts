import { fragment } from '../../gl/kit';
import type { Lens } from '../types';
import FRAG from './shaders/original.frag.glsl?raw';

export const originalLens: Lens = {
  id: 'original',
  name: 'Original',
  tagline: 'The photo as the camera sees it',
  version: 1,
  kind: 'realtime',
  seeded: false,
  params: [],
  create(kit) {
    const program = kit.program(fragment(FRAG), 'original');
    return {
      render(req, target) {
        kit.draw(program, target, { textures: { u_input: req.input } });
      },
      dispose() {
        program.dispose();
      },
    };
  },
};
