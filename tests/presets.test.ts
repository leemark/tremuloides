import { describe, expect, it } from 'vitest';
import { BUILT_IN_PRESETS, PresetStore, presetMatches, presetParams } from '../src/storage/presets';
import type { KV } from '../src/storage/settings';
import { LENSES, getLens } from '../src/lenses/registry';
import { sanitizeParams } from '../src/lenses/params';

function memKV(init: Record<string, string> = {}): KV & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('presets', () => {
  it('built-ins reference real lenses and real params', () => {
    for (const p of BUILT_IN_PRESETS) {
      const lens = LENSES.find((l) => l.id === p.lensId);
      expect(lens, p.id).toBeDefined();
      for (const k of Object.keys(p.params)) expect(lens?.params.some((s) => s.id === k), `${p.id}.${k}`).toBe(true);
      // Values survive sanitizing unchanged (in range, valid options).
      const clean = presetParams(lens?.params ?? [], p);
      for (const [k, v] of Object.entries(p.params)) expect(clean[k], `${p.id}.${k}`).toBe(v);
    }
  });

  it('adds, lists per lens, overwrites by name, and removes', () => {
    const kv = memKV();
    const st = new PresetStore(kv);
    const a = st.add('posterize', '  Punchy  ', { levels: 4 });
    expect(a.name).toBe('Punchy');
    st.add('ink-wash', 'Other', {});
    expect(st.list('posterize').filter((p) => !p.builtIn).map((p) => p.name)).toEqual(['Punchy']);
    st.add('posterize', 'punchy', { levels: 6 });
    const mine = st.list('posterize').filter((p) => !p.builtIn);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.params.levels).toBe(6);
    st.remove(a.id);
    expect(st.list('posterize').filter((p) => !p.builtIn)).toHaveLength(0);
    expect(st.list('posterize').some((p) => p.builtIn)).toBe(true);
  });

  it('survives corrupt storage', () => {
    expect(new PresetStore(memKV({ 'trem:presets': '{nope' })).list('topo').every((p) => p.builtIn)).toBe(true);
    const st = new PresetStore(memKV({ 'trem:presets': JSON.stringify({ version: 1, items: [{ id: 1 }, null, { id: 'x', lensId: 'topo', name: 'ok', params: {} }] }) }));
    expect(st.list('topo').filter((p) => !p.builtIn).map((p) => p.name)).toEqual(['ok']);
  });

  it('recognises when current settings match a preset', () => {
    const lens = getLens('posterize');
    const p = BUILT_IN_PRESETS.find((x) => x.id === 'b-poster-bold');
    if (!p) throw new Error('missing');
    expect(presetMatches(lens.params, p, presetParams(lens.params, p))).toBe(true);
    expect(presetMatches(lens.params, p, sanitizeParams(lens.params, {}))).toBe(false);
  });
});
