import type { GLKit } from '../../gl/kit';
import { FLOW_PARAMS, createPainter, type Relief } from '../flow-painter';
import { timelapseAction } from '../flow-painter/timelapse';
import type { Lens, ParamSpec, Params } from '../types';

/** Bigger, longer brushes than Flow Painter's: impasto is laid on with a loaded brush. */
const DEFAULTS: Record<string, number> = { strokeLength: 56, strokeWidth: 9, jitter: 0.35 };

const PARAMS: ParamSpec[] = [
  ...FLOW_PARAMS.map((p): ParamSpec => (p.type === 'range' && p.id in DEFAULTS ? { ...p, default: DEFAULTS[p.id] ?? p.default } : p)),
  { id: 'thickness', label: 'Paint thickness', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, help: 'How far the paint stands up from the canvas' },
  { id: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4, help: 'Wet-oil highlights on the ridges' },
  { id: 'lightAngle', label: 'Light from', type: 'range', min: 0, max: 360, step: 5, default: 135, help: 'Degrees around the picture: 90 is above, 180 the left' },
];

export function reliefOf(p: Params): Relief {
  return { thickness: Number(p.thickness), gloss: Number(p.gloss), lightAngle: Number(p.lightAngle) };
}

export const impastoLens: Lens = {
  id: 'impasto',
  name: 'Impasto',
  tagline: 'Thick oil paint, with light raking across the brushwork',
  version: 1,
  usesFaces: true,
  kind: 'still',
  seeded: true,
  actions: [timelapseAction(async () => impastoLens)],
  params: PARAMS,
  create(kit: GLKit) {
    return createPainter(kit, reliefOf);
  },
};
