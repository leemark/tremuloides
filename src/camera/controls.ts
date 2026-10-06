/** Camera controls (zoom, exposure, tap to focus) from MediaStreamTrack capabilities. Pure helpers. */

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface ControlCaps {
  zoom: Range | null;
  /** Exposure compensation in EV. */
  exposure: Range | null;
  /** pointsOfInterest is supported (tap to focus / meter). */
  focusPoint: boolean;
  focusModes: string[];
  exposureModes: string[];
}

function range(r: unknown): Range | null {
  const x = r as { min?: unknown; max?: unknown; step?: unknown } | null | undefined;
  if (!x || typeof x.min !== 'number' || typeof x.max !== 'number' || !(x.max > x.min)) return null;
  const step = typeof x.step === 'number' && x.step > 0 ? x.step : (x.max - x.min) / 100;
  return { min: x.min, max: x.max, step };
}

export function parseCapabilities(caps: unknown): ControlCaps {
  const c = (caps ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  return {
    zoom: range(c.zoom),
    exposure: range(c.exposureCompensation),
    focusPoint: 'pointsOfInterest' in c,
    focusModes: list(c.focusMode),
    exposureModes: list(c.exposureMode),
  };
}

export function hasControls(c: ControlCaps | null | undefined): boolean {
  return !!c && (!!c.zoom || !!c.exposure || c.focusPoint);
}

/** Clamps to the range and snaps to its step. */
export function snap(v: number, r: Range): number {
  const s = Math.round((Math.min(r.max, Math.max(r.min, v)) - r.min) / r.step) * r.step + r.min;
  return Math.min(r.max, Math.max(r.min, Number(s.toFixed(4))));
}

/** Zoom after a pinch from `startDist` to `dist` pixels, starting at `startZoom`. */
export function pinchZoom(startZoom: number, startDist: number, dist: number, r: Range): number {
  if (!(startDist > 0)) return startZoom;
  return snap(startZoom * (dist / startDist), r);
}

/**
 * A point on the viewfinder (0–1, top-left origin) to the camera frame (0–1, top-left), given the
 * frame and view aspect ratios and the cover crop the display uses (see fitScale/display.frag).
 */
export function viewToFrame(x: number, y: number, frameAspect: number, viewAspect: number): { x: number; y: number } {
  let sx = 1;
  let sy = 1;
  if (frameAspect > 0 && viewAspect > 0) {
    if (frameAspect > viewAspect) sx = viewAspect / frameAspect;
    else sy = frameAspect / viewAspect;
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((x - 0.5) * sx + 0.5), y: clamp((y - 0.5) * sy + 0.5) };
}

/** "2.4×" / "+0.7 EV" */
export function formatZoom(z: number): string {
  return `${z < 10 ? z.toFixed(1) : Math.round(z)}×`;
}

export function formatEv(ev: number): string {
  const r = Math.round(ev * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(1)} EV`;
}
