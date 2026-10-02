import { describe, expect, it } from 'vitest';
import { finalRenderSize, fitScale, lensRenderSize } from '../src/gl/fit';
import { AdaptiveScale } from '../src/gl/adaptive';
import { pickRotation, rotateGray, type Gray } from '../src/camera/orient';

describe('fit', () => {
  it('covers by cropping the long side', () => {
    expect(fitScale(16 / 9, 9 / 16, 'cover')[0]).toBeCloseTo((9 / 16) / (16 / 9));
    expect(fitScale(9 / 16, 16 / 9, 'cover')).toEqual([1, (9 / 16) / (16 / 9)]);
  });

  it('contains by letterboxing', () => {
    const [sx, sy] = fitScale(2, 1, 'contain');
    expect(sx).toBe(1);
    expect(sy).toBe(2);
  });

  it('never upsamples beyond the source and respects the max size', () => {
    expect(lensRenderSize(1080, 1920, 2160, 3840, 'cover', 1, 4096)).toEqual([1080, 1920]);
    expect(lensRenderSize(1080, 1920, 540, 960, 'cover', 0.5, 4096)).toEqual([270, 480]);
    expect(lensRenderSize(4000, 3000, 8000, 6000, 'contain', 1, 2048)).toEqual([2048, 1536]);
  });

  it('caps final renders by long edge', () => {
    expect(finalRenderSize(4080, 3072, 4096)).toEqual([4080, 3072]);
    expect(finalRenderSize(6000, 4000, 4096)).toEqual([4096, 2731]);
    expect(finalRenderSize(3000, 6000, 2048)).toEqual([1024, 2048]);
  });
});

describe('adaptive scale', () => {
  it('drops resolution when slow and recovers when fast', () => {
    const a = new AdaptiveScale(0.35, 1, 24, 45, 0.75);
    let t = 0;
    a.tick(t);
    for (let i = 0; i < 10; i++) a.tick((t += 100)); // 10 fps
    expect(a.scale).toBeLessThan(0.75);
    const low = a.scale;
    for (let i = 0; i < 120; i++) a.tick((t += 16)); // ~60 fps
    expect(a.scale).toBeGreaterThan(low);
    expect(a.scale).toBeLessThanOrEqual(1);
  });
});

describe('photo orientation', () => {
  // An asymmetric portrait test image (bright top-left corner, gradient).
  function portrait(): Gray {
    const w = 30;
    const h = 40;
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = x * 2 + y * 0.5 + (x < 8 && y < 10 ? 200 : 0);
    return { width: w, height: h, data };
  }

  it('rotates grayscale images', () => {
    const img = portrait();
    const r = rotateGray(img, 90);
    expect(r.width).toBe(40);
    expect(r.height).toBe(30);
    expect(rotateGray(rotateGray(r, 90), 180)).toEqual(img);
  });

  it('recovers the rotation of a sideways photo', () => {
    const ref = portrait();
    expect(pickRotation(rotateGray(ref, 90), ref)).toBe(270);
    expect(pickRotation(rotateGray(ref, 270), ref)).toBe(90);
    expect(pickRotation(ref, ref)).toBe(0);
    expect(pickRotation(rotateGray(ref, 180), ref)).toBe(180);
  });
});
