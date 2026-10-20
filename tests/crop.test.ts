import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASPECTS,
  aspectRatio,
  capScale,
  dragRect,
  fitAspect,
  hitHandle,
  isNoCrop,
  noCrop,
  rotateCrop,
  rotateRectCCW,
  rotateRectCW,
  toSourceRect,
  withAspect,
  type CropState,
  type Rect,
} from '../src/util/crop';
import { cropBitmap } from '../src/util/canvas';
import { photoMeta } from '../src/app/import';
import { addExif } from '../src/util/exif';

const closeRect = (a: Rect, b: Rect) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k]).toBeCloseTo(b[k], 6);
};

describe('crop geometry', () => {
  it('treats the full frame with no turn as no crop', () => {
    expect(isNoCrop(noCrop())).toBe(true);
    expect(isNoCrop({ rect: { x: 0, y: 0, w: 1, h: 1 }, quarter: 1 })).toBe(false);
    expect(isNoCrop({ rect: { x: 0.1, y: 0, w: 0.9, h: 1 }, quarter: 0 })).toBe(false);
  });

  it('rotating four times returns the same crop; CW and CCW are inverses', () => {
    const r: Rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.5 };
    let c: CropState = { rect: r, quarter: 0 };
    for (let i = 0; i < 4; i++) c = rotateCrop(c);
    expect(c.quarter).toBe(0);
    closeRect(c.rect, r);
    closeRect(rotateRectCCW(rotateRectCW(r)), r);
  });

  it('maps the top-left quarter of a turned photo back to the right source pixels', () => {
    // 4000×3000 landscape turned once clockwise shows as 3000×4000 portrait.
    // Its top-left corner on screen is the source's bottom-left corner.
    const tl: Rect = { x: 0, y: 0, w: 0.5, h: 0.5 };
    expect(toSourceRect({ rect: tl, quarter: 0 }, 4000, 3000)).toEqual({ sx: 0, sy: 0, sw: 2000, sh: 1500, outW: 2000, outH: 1500 });
    expect(toSourceRect({ rect: tl, quarter: 1 }, 4000, 3000)).toEqual({ sx: 0, sy: 1500, sw: 2000, sh: 1500, outW: 1500, outH: 2000 });
    expect(toSourceRect({ rect: tl, quarter: 2 }, 4000, 3000)).toEqual({ sx: 2000, sy: 1500, sw: 2000, sh: 1500, outW: 2000, outH: 1500 });
    expect(toSourceRect({ rect: tl, quarter: 3 }, 4000, 3000)).toEqual({ sx: 2000, sy: 0, sw: 2000, sh: 1500, outW: 1500, outH: 2000 });
  });

  it('never returns an empty or out-of-bounds source rect', () => {
    const r = toSourceRect({ rect: { x: 0.9999, y: 1, w: 0, h: 0 }, quarter: 0 }, 100, 50);
    expect(r.sw).toBeGreaterThanOrEqual(1);
    expect(r.sh).toBeGreaterThanOrEqual(1);
    expect(r.sx + r.sw).toBeLessThanOrEqual(100);
    expect(r.sy + r.sh).toBeLessThanOrEqual(50);
  });

  it('fits the largest rect of an aspect, centred and inside the photo', () => {
    const s = { w: 4000, h: 3000 };
    closeRect(fitAspect(s, 1), { x: 500, y: 0, w: 3000, h: 3000 });
    closeRect(fitAspect(s, 16 / 9), { x: 0, y: 375, w: 4000, h: 2250 });
    // Centred on a crop near the edge, but pushed back inside.
    const r = withAspect({ x: 3800, y: 0, w: 200, h: 200 }, s, 4 / 5);
    expect(r.x + r.w).toBeLessThanOrEqual(4000 + 1e-6);
    expect(r.w / r.h).toBeCloseTo(0.8, 6);
    expect(r.h).toBeCloseTo(3000, 6);
    expect(withAspect({ x: 1, y: 2, w: 3, h: 4 }, s, null)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('resolves presets, including the photo’s own shape', () => {
    const s = { w: 3000, h: 4000 };
    const byId = (id: string) => ASPECTS.find((a) => a.id === id)!;
    expect(aspectRatio(byId('free'), s)).toBeNull();
    expect(aspectRatio(byId('original'), s)).toBeCloseTo(0.75);
    expect(aspectRatio(byId('4:5'), s)).toBeCloseTo(0.8);
    expect(new Set(ASPECTS.map((a) => a.id)).size).toBe(ASPECTS.length);
  });
});

describe('crop dragging', () => {
  const s = { w: 1000, h: 800 };
  const start: Rect = { x: 100, y: 100, w: 400, h: 300 };

  it('moves the frame but keeps it inside the photo', () => {
    expect(dragRect(start, 'move', 50, -20, s, null, 20)).toEqual({ x: 150, y: 80, w: 400, h: 300 });
    expect(dragRect(start, 'move', 5000, 5000, s, null, 20)).toEqual({ x: 600, y: 500, w: 400, h: 300 });
  });

  it('free corners and edges move only their sides, with a minimum size', () => {
    expect(dragRect(start, 'se', 100, 50, s, null, 20)).toEqual({ x: 100, y: 100, w: 500, h: 350 });
    expect(dragRect(start, 'nw', -500, -500, s, null, 20)).toEqual({ x: 0, y: 0, w: 500, h: 400 });
    expect(dragRect(start, 'w', 1000, 0, s, null, 20)).toEqual({ x: 480, y: 100, w: 20, h: 300 });
    expect(dragRect(start, 'n', 0, 40, s, null, 20)).toEqual({ x: 100, y: 140, w: 400, h: 260 });
  });

  it('locked aspect: corners keep the shape and the opposite corner stays put', () => {
    const sq: Rect = { x: 100, y: 100, w: 300, h: 300 };
    const r = dragRect(sq, 'se', 100, 100, s, 1, 20);
    closeRect(r, { x: 100, y: 100, w: 400, h: 400 });
    const big = dragRect(sq, 'se', 5000, 5000, s, 1, 20);
    expect(big.w).toBeCloseTo(big.h, 6);
    expect(big.y + big.h).toBeLessThanOrEqual(800 + 1e-6);
    expect(big.x + big.w).toBeLessThanOrEqual(1000 + 1e-6);
    const nw = dragRect(sq, 'nw', -50, -50, s, 1, 20);
    expect(nw.x + nw.w).toBeCloseTo(400, 6);
    expect(nw.y + nw.h).toBeCloseTo(400, 6);
  });

  it('locked aspect: edges grow about the centre and stay inside', () => {
    const r = dragRect({ x: 100, y: 300, w: 200, h: 200 }, 'e', 300, 0, s, 1, 20);
    expect(r.w).toBeCloseTo(r.h, 6);
    expect(r.x).toBeCloseTo(100, 6);
    expect(r.y).toBeGreaterThanOrEqual(-1e-6);
    expect(r.y + r.h).toBeLessThanOrEqual(800 + 1e-6);
    expect(r.y + r.h / 2).toBeCloseTo(400, 6);
    const v = dragRect({ x: 400, y: 100, w: 200, h: 100 }, 's', 0, 2000, s, 2, 20);
    expect(v.w / v.h).toBeCloseTo(2, 6);
    expect(v.y + v.h).toBeLessThanOrEqual(800 + 1e-6);
    expect(v.x).toBeGreaterThanOrEqual(-1e-6);
  });

  it('picks the handle under a finger', () => {
    expect(hitHandle(start, 102, 98, 10)).toBe('nw');
    expect(hitHandle(start, 500, 400, 10)).toBe('se');
    expect(hitHandle(start, 300, 100, 10)).toBe('n');
    expect(hitHandle(start, 300, 250, 10)).toBe('move');
    expect(hitHandle(start, 900, 700, 10)).toBeNull();
  });
});

class FakeBitmap {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  close() {
    this.closed = true;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('cropBitmap', () => {
  it('uses the bitmap source rect for a plain crop', async () => {
    const calls: unknown[][] = [];
    vi.stubGlobal('createImageBitmap', async (...a: unknown[]) => {
      calls.push(a.slice(1));
      return new FakeBitmap(a[3] as number, a[4] as number);
    });
    const src = new FakeBitmap(4000, 3000);
    const out = await cropBitmap(src as unknown as ImageBitmap, { rect: { x: 0.25, y: 0, w: 0.5, h: 1 }, quarter: 0 });
    expect([out.width, out.height]).toEqual([2000, 3000]);
    expect(calls).toEqual([[1000, 0, 2000, 3000]]);
    expect(src.closed).toBe(false);
  });

  it('draws turned crops on a canvas, capped for Safari', async () => {
    const ops: string[] = [];
    let size: number[] = [];
    vi.stubGlobal('createImageBitmap', async (c: { width: number; height: number }) => new FakeBitmap(c.width, c.height));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number,
        ) {
          size = [width, height];
        }
        getContext() {
          return {
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'low',
            translate: (x: number, y: number) => ops.push(`t ${x} ${y}`),
            rotate: (a: number) => ops.push(`r ${a.toFixed(4)}`),
            drawImage: (...a: number[]) => ops.push(`d ${a.slice(1).join(' ')}`),
          };
        }
      },
    );
    const src = new FakeBitmap(400, 300);
    const out = await cropBitmap(src as unknown as ImageBitmap, { rect: { x: 0, y: 0, w: 1, h: 1 }, quarter: 1 });
    expect([out.width, out.height]).toEqual([300, 400]);
    expect(size).toEqual([300, 400]);
    expect(ops).toEqual(['t 150 200', `r ${(Math.PI / 2).toFixed(4)}`, 'd 0 0 400 300 -200 -150 400 300']);
    // A 50 MP crop is drawn at ≤ 16.7 MP.
    ops.length = 0;
    await cropBitmap(new FakeBitmap(8160, 6144) as unknown as ImageBitmap, { rect: { x: 0, y: 0, w: 1, h: 1 }, quarter: 2 });
    expect(size[0]! * size[1]!).toBeLessThanOrEqual(16_777_216);
    expect(capScale(100, 100, 1e9)).toBe(1);
  });
});

describe('photoMeta', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);

  it('reads the date and location of a single imported JPEG', async () => {
    const date = new Date('2026-10-03T16:05:09Z');
    const bytes = addExif(JPEG, { date, gps: { lat: 38.84, lon: -104.92, altitude: 1900 } });
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'aspens.jpg', { type: 'image/jpeg', lastModified: Date.UTC(2026, 9, 18) });
    const m = await photoMeta(file);
    expect(m.date.toISOString()).toBe(date.toISOString());
    expect(m.geo?.lat).toBeCloseTo(38.84, 3);
    expect(m.geo?.lon).toBeCloseTo(-104.92, 3);
  });

  it('falls back to the file date without EXIF, and has no location', async () => {
    const t = Date.UTC(2026, 9, 18, 12);
    const m = await photoMeta(new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png', lastModified: t }));
    expect(m.date.getTime()).toBe(t);
    expect(m.geo).toBeUndefined();
  });
});
