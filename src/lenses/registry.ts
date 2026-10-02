import { originalLens } from './original';
import { inkWashLens } from './ink-wash';
import { posterizeLens } from './posterize';
import { quakeLens } from './quake';
import type { Lens } from './types';

/** All lenses, in picker order. Add new lenses here (one line each). */
export const LENSES: readonly Lens[] = [originalLens, inkWashLens, quakeLens, posterizeLens];

export const DEFAULT_LENS_ID = 'ink-wash';

export function getLens(id: string | null | undefined): Lens {
  return LENSES.find((l) => l.id === id) ?? LENSES.find((l) => l.id === DEFAULT_LENS_ID) ?? (LENSES[0] as Lens);
}

export function lensExists(id: string): boolean {
  return LENSES.some((l) => l.id === id);
}

export function adjacentLens(id: string, delta: 1 | -1): Lens {
  const i = LENSES.findIndex((l) => l.id === id);
  const n = LENSES.length;
  return LENSES[(((i < 0 ? 0 : i) + delta) % n + n) % n] as Lens;
}

/** Lenses that can be applied to a still image (editor, re-edit). Temporal lenses need live video. */
export const STILL_LENSES: readonly Lens[] = LENSES.filter((l) => l.kind !== 'temporal');
