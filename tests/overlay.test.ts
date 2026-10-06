import { describe, expect, it } from 'vitest';
import { describeOverlay, overlayActive, sanitizeOverlay } from '../src/gl/overlay';
import { SettingsStore } from '../src/storage/settings';

describe('overlay config', () => {
  it('sanitizes kinds and clamps strength', () => {
    expect(sanitizeOverlay({ kind: 'contours', strength: 3 })).toEqual({ kind: 'contours', strength: 1 });
    expect(sanitizeOverlay({ kind: 'lasers', strength: 0.5 })).toEqual({ kind: 'none', strength: 0.5 });
    expect(sanitizeOverlay(undefined)).toEqual({ kind: 'none', strength: 0.8 });
  });

  it('is active only for a real kind with some strength', () => {
    expect(overlayActive({ kind: 'ink', strength: 0.5 })).toBe(true);
    expect(overlayActive({ kind: 'ink', strength: 0 })).toBe(false);
    expect(overlayActive({ kind: 'none', strength: 1 })).toBe(false);
    expect(overlayActive(null)).toBe(false);
    expect(describeOverlay({ kind: 'contours', strength: 0.6 })).toBe('Contours 60%');
    expect(describeOverlay({ kind: 'none', strength: 0.6 })).toBeNull();
  });

  it('settings reject bad overlay values', () => {
    const m = new Map([['trem:settings', JSON.stringify({ overlayKind: 'x', overlayStrength: 7 })]]);
    const st = new SettingsStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
    expect(st.get().overlayKind).toBe('none');
    expect(st.get().overlayStrength).toBe(0.8);
  });
});
