import { extractPalette } from './palette';

interface Request {
  id: number;
  pixels: Uint8ClampedArray;
  k: number;
  seed: number;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, pixels, k, seed } = e.data;
  try {
    const palette = extractPalette(pixels, k, seed);
    self.postMessage({ id, palette });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
