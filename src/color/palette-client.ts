import { extractPalette, type Palette } from './palette';
import { logEvent } from '../diagnostics/log';

type Pending = { resolve: (p: Palette) => void; reject: (e: Error) => void };

/** Runs palette extraction in a Web Worker, falling back to the main thread if workers fail. */
class PaletteClient {
  private worker: Worker | null | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const w = new Worker(new URL('./palette.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; palette?: Palette; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.palette) p.resolve(e.data.palette);
        else p.reject(new Error(e.data.error ?? 'palette worker failed'));
      };
      w.onerror = (e) => {
        logEvent('warn', 'palette', 'Palette worker error; using main thread', e.message);
        this.worker = null;
        for (const p of this.pending.values()) p.reject(new Error('worker error'));
        this.pending.clear();
      };
      this.worker = w;
    } catch (e) {
      logEvent('warn', 'palette', 'Workers unavailable; computing palettes on the main thread', e);
      this.worker = null;
    }
    return this.worker;
  }

  async compute(pixels: Uint8ClampedArray, k: number, seed = 1): Promise<Palette> {
    const w = this.getWorker();
    if (!w) return extractPalette(pixels, k, seed);
    const id = this.nextId++;
    try {
      return await new Promise<Palette>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        w.postMessage({ id, pixels, k, seed });
      });
    } catch {
      return extractPalette(pixels, k, seed);
    }
  }
}

export const paletteClient = new PaletteClient();
