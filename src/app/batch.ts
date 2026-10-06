import type { Services } from './services';
import type { Capture } from '../storage/types';
import type { Lens, Params } from '../lenses/types';
import { isVideoType } from './video';
import { processAndSave } from './capture';
import { randomSeed } from '../util/prng';
import { logEvent, errorMessage } from '../diagnostics/log';

export interface BatchPlan {
  /** Photos to render, oldest first so results keep the trip's order. */
  items: Capture[];
  /** Selected clips (can't be re-rendered as stills). */
  skippedVideos: number;
  /** Photos without a kept original: the rendered image is used as the source. */
  withoutOriginal: number;
}

export function planBatch(captures: readonly Capture[], ids: ReadonlySet<string>): BatchPlan {
  const picked = captures.filter((c) => ids.has(c.id));
  const items = picked.filter((c) => !isVideoType(c.outputType)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return { items, skippedVideos: picked.length - items.length, withoutOriginal: items.filter((c) => !c.originalKey).length };
}

export interface BatchStatus {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  lensName: string;
}

type Listener = (s: BatchStatus) => void;

/** One batch at a time, app-wide, so it keeps going if you leave the gallery. */
class BatchRunner {
  status: BatchStatus = { running: false, done: 0, total: 0, failed: 0, lensName: '' };
  private cancelled = false;
  private listeners = new Set<Listener>();

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<BatchStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }

  stop(): void {
    this.cancelled = true;
  }

  async run(s: Services, items: Capture[], lens: Lens, params: Params): Promise<BatchStatus> {
    if (this.status.running) throw new Error('A batch is already running');
    this.cancelled = false;
    this.emit({ running: true, done: 0, total: items.length, failed: 0, lensName: lens.name });
    const end = s.busy.begin();
    try {
      for (const c of items) {
        if (this.cancelled) break;
        await s.queue.add(async () => {
          if (this.cancelled) return;
          try {
            const blob = (await s.store.blob(c.originalKey)) ?? (await s.store.blob(c.outputKey));
            if (!blob) throw new Error('Photo data missing');
            const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
            await processAndSave(s, {
              bitmap,
              originalBlob: blob,
              lens,
              params: { ...params },
              seed: lens.seeded ? randomSeed() : c.seed,
              source: 'derived',
              parentId: c.id,
              ...(c.captureMethod ? { method: c.captureMethod } : {}),
              ...(c.geo ? { geo: c.geo } : {}),
            });
          } catch (e) {
            logEvent('error', 'batch', `Re-render of ${c.id} with ${lens.id} failed`, e);
            this.emit({ failed: this.status.failed + 1 });
            throw new Error(errorMessage(e));
          }
        }).catch(() => undefined);
        this.emit({ done: this.status.done + 1 });
      }
    } finally {
      end();
      this.emit({ running: false });
      void s.album.sync();
    }
    return this.status;
  }
}

export const batch = new BatchRunner();
