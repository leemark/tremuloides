import type { Params } from '../lenses/types';

export interface Settings {
  keepOriginals: boolean;
  /** Long edge cap for final renders; 0 means the device maximum. */
  maxRenderEdge: 2048 | 4096 | 0;
  exportFormat: 'jpeg' | 'png';
  locationTagging: boolean;
  keepScreenOn: boolean;
  /** 'auto' uses ImageCapture full-res photos when available; 'video' always uses the stream frame. */
  captureSource: 'auto' | 'video';
  fpsOverlay: boolean;
  currentLens: string;
  /** Also write originals into the phone album folder. */
  albumOriginals: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  keepOriginals: true,
  maxRenderEdge: 4096,
  exportFormat: 'jpeg',
  locationTagging: true,
  keepScreenOn: true,
  captureSource: 'auto',
  fpsOverlay: false,
  currentLens: 'ink-wash',
  albumOriginals: true,
};

/** Minimal synchronous key/value store (localStorage), safe when storage is unavailable. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'trem:';

function safeKV(): KV {
  try {
    const ls = globalThis.localStorage;
    ls.setItem(`${PREFIX}probe`, '1');
    ls.removeItem(`${PREFIX}probe`);
    return ls;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

export class SettingsStore {
  private readonly kv: KV;
  private cache: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(kv?: KV) {
    this.kv = kv ?? safeKV();
    this.cache = this.load();
  }

  private load(): Settings {
    try {
      const raw = this.kv.getItem(`${PREFIX}settings`);
      const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
      const merged = { ...DEFAULT_SETTINGS };
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        const v = parsed[key];
        if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[key]) {
          (merged as Record<string, unknown>)[key] = v;
        }
      }
      if (![2048, 4096, 0].includes(merged.maxRenderEdge)) merged.maxRenderEdge = DEFAULT_SETTINGS.maxRenderEdge;
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return this.cache;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.cache = { ...this.cache, [key]: value };
    this.kv.setItem(`${PREFIX}settings`, JSON.stringify(this.cache));
    for (const fn of this.listeners) fn(this.cache);
  }

  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  lensParams(lensId: string): Record<string, unknown> | undefined {
    try {
      const raw = this.kv.getItem(`${PREFIX}params:${lensId}`);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  setLensParams(lensId: string, params: Params): void {
    this.kv.setItem(`${PREFIX}params:${lensId}`, JSON.stringify(params));
  }

  /** Small flags that aren't user settings (e.g. lastSeenVersion, offlineReady). */
  flag(key: string): string | null {
    return this.kv.getItem(`${PREFIX}flag:${key}`);
  }

  setFlag(key: string, value: string): void {
    this.kv.setItem(`${PREFIX}flag:${key}`, value);
  }
}
