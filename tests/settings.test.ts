import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore, type KV } from '../src/storage/settings';

function memKV(init: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('settings', () => {
  it('starts with defaults', () => {
    expect(new SettingsStore(memKV()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists changes and ignores invalid stored values', () => {
    const kv = memKV();
    const a = new SettingsStore(kv);
    a.set('keepOriginals', false);
    a.set('maxRenderEdge', 2048);
    expect(new SettingsStore(kv).get().keepOriginals).toBe(false);
    expect(new SettingsStore(kv).get().maxRenderEdge).toBe(2048);

    const broken = new SettingsStore(memKV({ 'trem:settings': '{"keepOriginals":"yes","maxRenderEdge":999,"exportFormat":"png"}' }));
    expect(broken.get().keepOriginals).toBe(true);
    expect(broken.get().maxRenderEdge).toBe(4096);
    expect(broken.get().exportFormat).toBe('png');
    expect(new SettingsStore(memKV({ 'trem:settings': 'not json' })).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('stores per-lens params and flags', () => {
    const s = new SettingsStore(memKV());
    s.setLensParams('posterize', { levels: 7 });
    expect(s.lensParams('posterize')).toEqual({ levels: 7 });
    expect(s.lensParams('other')).toBeUndefined();
    s.setFlag('lastSeenVersion', '0.1.0');
    expect(s.flag('lastSeenVersion')).toBe('0.1.0');
  });
});

describe('video settings', () => {
  it('rejects unknown capture modes and clip lengths', async () => {
    const { SettingsStore } = await import('../src/storage/settings');
    const mem = new Map<string, string>([['trem:settings', JSON.stringify({ captureMode: 'film', videoSeconds: 7, videoSound: true })]]);
    const st = new SettingsStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    expect(st.get().captureMode).toBe('photo');
    expect(st.get().videoSeconds).toBe(10);
    expect(st.get().videoSound).toBe(true);
  });
});
