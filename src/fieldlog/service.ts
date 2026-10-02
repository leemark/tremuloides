import { analyzePixels, FIELDLOG_VERSION, samplePixels } from './analyze';
import type { CaptureStore } from '../storage/captures';
import type { FieldLogData } from '../storage/types';
import { logEvent } from '../diagnostics/log';

type Pending = { resolve: (d: FieldLogData) => void; reject: (e: Error) => void };

/**
 * Analyzes captures (palette + warm index) in a Web Worker and stores the result.
 * Runs a backfill over every capture missing current data, and re-runs whenever asked
 * (e.g. after new captures are saved).
 */
export class FieldLogService {
  private worker: Worker | null | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private running = false;
  private again = false;
  private listeners = new Set<(remaining: number) => void>();
  remaining = 0;

  constructor(private readonly store: CaptureStore) {}

  onProgress(fn: (remaining: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.remaining);
  }

  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const w = new Worker(new URL('./fieldlog.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; data?: FieldLogData; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.data) p.resolve(e.data.data);
        else p.reject(new Error(e.data.error ?? 'analysis failed'));
      };
      w.onerror = (e) => {
        logEvent('warn', 'fieldlog', 'Field log worker error; using main thread', e.message);
        this.worker = null;
        for (const p of this.pending.values()) p.reject(new Error('worker error'));
        this.pending.clear();
      };
      this.worker = w;
    } catch (e) {
      logEvent('warn', 'fieldlog', 'Workers unavailable; analyzing on the main thread', e);
      this.worker = null;
    }
    return this.worker;
  }

  async analyze(blob: Blob): Promise<FieldLogData> {
    const w = this.getWorker();
    if (w) {
      const id = this.nextId++;
      try {
        return await new Promise<FieldLogData>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          w.postMessage({ id, blob });
        });
      } catch {
        /* fall through to main thread */
      }
    }
    return analyzePixels(await samplePixels(blob));
  }

  /** Processes every capture without current field-log data. Safe to call often. */
  async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const todo = (await this.store.list()).filter((c) => (c.fieldlog?.version ?? 0) < FIELDLOG_VERSION);
        this.remaining = todo.length;
        this.emit();
        for (const c of todo) {
          try {
            const blob = (await this.store.blob(c.originalKey)) ?? (await this.store.blob(c.outputKey));
            if (blob) await this.store.setFieldlog(c.id, await this.analyze(blob));
          } catch (e) {
            logEvent('warn', 'fieldlog', `Could not analyze ${c.id}`, e);
          }
          this.remaining--;
          this.emit();
        }
      } while (this.again);
    } finally {
      this.running = false;
      this.remaining = 0;
      this.emit();
    }
  }
}
