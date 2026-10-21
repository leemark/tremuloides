import { describe, expect, it } from 'vitest';
import { faceDetectorAvailable, toFaceBoxes } from '../src/util/faces';

describe('face boxes', () => {
  it('normalizes detector boxes and clips them to the picture', () => {
    const boxes = toFaceBoxes(
      [
        { boundingBox: { x: 100, y: 50, width: 200, height: 260 } },
        { boundingBox: { x: -40, y: 900, width: 100, height: 200 } },
        { boundingBox: { x: 10, y: 10, width: 0, height: 20 } },
      ],
      1000,
      1000,
    );
    expect(boxes).toHaveLength(2);
    const b = boxes[0]!;
    for (const [k, v] of [['x', 0.1], ['y', 0.05], ['w', 0.2], ['h', 0.26]] as const) expect(b[k]).toBeCloseTo(v, 9);
    expect(boxes[1]!.x).toBe(0);
    expect(boxes[1]!.w).toBeCloseTo(0.06, 9);
    expect(boxes[1]!.h).toBeCloseTo(0.1, 9);
  });

  it('reports no detector where the browser has none', () => {
    expect(faceDetectorAvailable()).toBe(false);
  });
});
