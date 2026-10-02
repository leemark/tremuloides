import { analyzePixels, samplePixels } from './analyze';

self.onmessage = async (e: MessageEvent<{ id: number; blob: Blob }>) => {
  const { id, blob } = e.data;
  try {
    const data = analyzePixels(await samplePixels(blob));
    self.postMessage({ id, data });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
