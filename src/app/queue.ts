import { logEvent } from '../diagnostics/log';

/** Runs capture jobs one at a time so the shutter never waits on a render. */
export class CaptureQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private listeners = new Set<(pending: number) => void>();

  get size(): number {
    return this.pending;
  }

  add(job: () => Promise<void>): Promise<void> {
    this.pending++;
    this.emit();
    const run = this.chain.then(job).catch((e: unknown) => {
      logEvent('error', 'capture', 'Capture failed', e);
      throw e;
    });
    this.chain = run.catch(() => undefined).finally(() => {
      this.pending--;
      this.emit();
    });
    return run;
  }

  onChange(fn: (pending: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.pending);
  }
}
