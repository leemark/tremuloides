import { describe, expect, it } from 'vitest';
import { formatEv, formatZoom, hasControls, parseCapabilities, pinchZoom, snap, viewToFrame } from '../src/camera/controls';

describe('camera controls', () => {
  it('parses Chrome Android style capabilities', () => {
    const c = parseCapabilities({
      zoom: { min: 1, max: 8, step: 0.1 },
      exposureCompensation: { min: -2, max: 2, step: 0.1666 },
      pointsOfInterest: true,
      focusMode: ['manual', 'single-shot', 'continuous'],
      exposureMode: ['continuous'],
    });
    expect(c.zoom).toEqual({ min: 1, max: 8, step: 0.1 });
    expect(c.exposure?.max).toBe(2);
    expect(c.focusPoint).toBe(true);
    expect(c.focusModes).toContain('single-shot');
    expect(hasControls(c)).toBe(true);
  });

  it('treats missing or broken capabilities as no controls', () => {
    const none = parseCapabilities(null);
    expect(hasControls(none)).toBe(false);
    expect(parseCapabilities({ zoom: { min: 1, max: 1 } }).zoom).toBeNull();
    expect(parseCapabilities({ zoom: { min: 1, max: 4 } }).zoom?.step).toBeCloseTo(0.03);
  });

  it('snaps and clamps', () => {
    const r = { min: 1, max: 8, step: 0.1 };
    expect(snap(2.345, r)).toBe(2.3);
    expect(snap(20, r)).toBe(8);
    expect(snap(-1, r)).toBe(1);
    expect(pinchZoom(2, 100, 200, r)).toBe(4);
    expect(pinchZoom(2, 100, 10, r)).toBe(1);
  });

  it('maps a viewfinder tap through the cover crop to the camera frame', () => {
    // 16:9 landscape frame shown in a 9:19.5 portrait view: only the middle strip is visible.
    const p = viewToFrame(0, 0.5, 16 / 9, 9 / 19.5);
    expect(p.y).toBeCloseTo(0.5);
    expect(p.x).toBeGreaterThan(0.3);
    expect(viewToFrame(0.5, 0.5, 4 / 3, 9 / 16)).toEqual({ x: 0.5, y: 0.5 });
    // Taller frame than view: x is unchanged, y is cropped.
    const q = viewToFrame(0.5, 0, 3 / 4, 1);
    expect(q.x).toBe(0.5);
    expect(q.y).toBeCloseTo(0.125);
  });

  it('formats readouts', () => {
    expect(formatZoom(1)).toBe('1.0×');
    expect(formatZoom(12.3)).toBe('12×');
    expect(formatEv(0.66)).toBe('+0.7 EV');
    expect(formatEv(-1)).toBe('−1.0 EV');
    expect(formatEv(0)).toBe('±0.0 EV');
  });
});
