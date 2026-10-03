import { computeContours, type ContourParams, type ContourSet } from './contours';
import { logEvent } from '../../diagnostics/log';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (s: ContourSet) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL('./contours.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; set?: ContourSet; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.set) p.resolve(e.data.set);
      else p.reject(new Error(e.data.error ?? 'contour worker failed'));
    };
    w.onerror = (e) => {
      logEvent('warn', 'topo', 'Contour worker error; using main thread', e.message);
      worker = null;
      for (const p of pending.values()) p.reject(new Error('worker error'));
      pending.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** Contours computed in a Web Worker (main-thread fallback). */
export async function contoursAsync(rgba: Uint8ClampedArray, w: number, h: number, p: ContourParams): Promise<ContourSet> {
  const wk = getWorker();
  if (wk) {
    const id = nextId++;
    try {
      return await new Promise<ContourSet>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        wk.postMessage({ id, rgba, w, h, p });
      });
    } catch {
      /* fall through */
    }
  }
  return computeContours(rgba, w, h, p);
}
