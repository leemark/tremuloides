import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { LENSES, DEFAULT_LENS_ID, adjacentLens, getLens } from '../src/lenses/registry';
import { validateSpecs } from '../src/lenses/params';

describe('lens registry', () => {
  it('has unique kebab-case ids', () => {
    const ids = LENSES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it('every lens has valid metadata and params', () => {
    for (const l of LENSES) {
      expect(l.name.trim(), l.id).not.toBe('');
      expect(l.tagline.trim(), l.id).not.toBe('');
      expect(Number.isInteger(l.version) && l.version >= 1, l.id).toBe(true);
      expect(['realtime', 'temporal', 'still']).toContain(l.kind);
      expect(validateSpecs(l.params), l.id).toEqual([]);
      if (l.kind === 'temporal') expect(l.temporal, l.id).toBeDefined();
      expect(typeof l.create).toBe('function');
    }
  });

  it('every lens has a README', () => {
    for (const l of LENSES) {
      expect(existsSync(new URL(`../src/lenses/${l.id}/README.md`, import.meta.url)), `${l.id}/README.md`).toBe(true);
    }
  });

  it('falls back to the default lens for unknown ids', () => {
    expect(getLens('nope').id).toBe(DEFAULT_LENS_ID);
    expect(getLens(null).id).toBe(DEFAULT_LENS_ID);
  });

  it('cycles through lenses', () => {
    const first = LENSES[0]!;
    const last = LENSES[LENSES.length - 1]!;
    expect(adjacentLens(last.id, 1).id).toBe(first.id);
    expect(adjacentLens(first.id, -1).id).toBe(last.id);
  });
});
