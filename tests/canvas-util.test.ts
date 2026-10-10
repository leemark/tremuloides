import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeTo } from '../src/util/canvas';

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

describe('resizeTo', () => {
  it('uses createImageBitmap resize options when the browser honours them', async () => {
    vi.stubGlobal('createImageBitmap', async (_src: unknown, o: ImageBitmapOptions) => new FakeBitmap(o.resizeWidth ?? 0, o.resizeHeight ?? 0));
    const out = await resizeTo(new FakeBitmap(4000, 3000) as unknown as ImageBitmap, 400, 300);
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it('draws the resize itself when the options are ignored (older Safari)', async () => {
    const drawn: number[][] = [];
    vi.stubGlobal('createImageBitmap', async (src: unknown) => (src instanceof FakeBitmap ? new FakeBitmap(4000, 3000) : new FakeBitmap(400, 300)));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number,
        ) {}
        getContext() {
          return { drawImage: (_i: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]), imageSmoothingEnabled: true, imageSmoothingQuality: 'low' };
        }
      },
    );
    const src = new FakeBitmap(4000, 3000);
    const out = await resizeTo(src as unknown as ImageBitmap, 400, 300);
    expect([out.width, out.height]).toEqual([400, 300]);
    expect(drawn).toEqual([[0, 0, 400, 300]]);
    expect(src.closed).toBe(false); // caller's bitmap is left open
  });
});
