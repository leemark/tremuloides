import { computeContours, type ContourParams } from './contours';

self.onmessage = (e: MessageEvent<{ id: number; rgba: Uint8ClampedArray; w: number; h: number; p: ContourParams }>) => {
  const { id, rgba, w, h, p } = e.data;
  try {
    const set = computeContours(rgba, w, h, p);
    const transfer = set.lines.flatMap((l) => l.paths.map((x) => x.buffer));
    (self as unknown as Worker).postMessage({ id, set }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
