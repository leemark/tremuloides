import type { KV } from './settings';
import type { Params, ParamSpec } from '../lenses/types';
import { sanitizeParams } from '../lenses/params';

export interface Preset {
  id: string;
  lensId: string;
  name: string;
  params: Params;
  /** Built-ins ship with the app and can't be deleted. */
  builtIn?: boolean;
  createdAt?: string;
}

const KEY = 'trem:presets';
const VERSION = 1;
export const MAX_NAME = 32;

/** Starting points tuned on the trip's photos. Params missing here fall back to lens defaults. */
export const BUILT_IN_PRESETS: readonly Preset[] = [
  { id: 'b-ink-poster', lensId: 'ink-wash', name: 'San Juan poster', params: { palette: 'sanjuan', paletteStrength: 1, lineAmount: 0.75 }, builtIn: true },
  { id: 'b-ink-soft', lensId: 'ink-wash', name: 'Soft wash', params: { palette: 'gouache', brush: 9, lineAmount: 0.3, lineWeight: 0.9 }, builtIn: true },
  { id: 'b-ink-sketch', lensId: 'ink-wash', name: 'Ink sketch', params: { palette: 'mono', lineAmount: 0.9, lineStyle: 'flow' }, builtIn: true },
  { id: 'b-glass-cathedral', lensId: 'stained-glass', name: 'Cathedral', params: { cells: 700, leadWidth: 4, glow: 0.8 }, builtIn: true },
  { id: 'b-glass-mosaic', lensId: 'stained-glass', name: 'Mosaic', params: { cells: 5000, leadWidth: 1, attraction: 0.8 }, builtIn: true },
  { id: 'b-flow-broad', lensId: 'flow-painter', name: 'Broad strokes', params: { detail: 1.65, strokeLength: 99, strokeWidth: 14 }, builtIn: true },
  { id: 'b-flow-fine', lensId: 'flow-painter', name: 'Fine detail', params: { detail: 1.6, strokeLength: 30, strokeWidth: 4, layers: 4 }, builtIn: true },
  { id: 'b-poster-bold', lensId: 'posterize', name: 'Bold bands', params: { levels: 3, saturation: 1.5 }, builtIn: true },
  { id: 'b-topo-night', lensId: 'topo', name: 'Night map', params: { style: 'night', levels: 30 }, builtIn: true },
];

function newId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** User presets in localStorage (versioned JSON; unreadable entries are skipped, never thrown). */
export class PresetStore {
  constructor(private readonly kv: KV) {}

  private load(): Preset[] {
    try {
      const raw = this.kv.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw) as { version?: number; items?: unknown };
      if (!Array.isArray(data.items)) return [];
      return data.items.filter(
        (p): p is Preset =>
          !!p && typeof p === 'object' && typeof (p as Preset).id === 'string' && typeof (p as Preset).lensId === 'string' && typeof (p as Preset).name === 'string' && typeof (p as Preset).params === 'object' && (p as Preset).params !== null,
      );
    } catch {
      return [];
    }
  }

  private save(items: Preset[]): void {
    this.kv.setItem(KEY, JSON.stringify({ version: VERSION, items }));
  }

  /** Built-ins first, then the user's own (oldest first), for one lens. */
  list(lensId: string): Preset[] {
    return [...BUILT_IN_PRESETS.filter((p) => p.lensId === lensId), ...this.load().filter((p) => p.lensId === lensId)];
  }

  add(lensId: string, name: string, params: Params): Preset {
    const clean = name.trim().slice(0, MAX_NAME) || 'My preset';
    const items = this.load();
    const existing = items.find((p) => p.lensId === lensId && p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      existing.params = { ...params };
      this.save(items);
      return existing;
    }
    const p: Preset = { id: newId(), lensId, name: clean, params: { ...params }, createdAt: new Date().toISOString() };
    this.save([...items, p]);
    return p;
  }

  remove(id: string): void {
    this.save(this.load().filter((p) => p.id !== id));
  }
}

/** A preset's params on top of the lens defaults, validated against the lens's specs. */
export function presetParams(specs: readonly ParamSpec[], preset: Preset): Params {
  return sanitizeParams(specs, preset.params);
}

/** True when the current params equal what the preset would produce. */
export function presetMatches(specs: readonly ParamSpec[], preset: Preset, params: Params): boolean {
  const p = presetParams(specs, preset);
  return specs.every((s) => p[s.id] === params[s.id]);
}
