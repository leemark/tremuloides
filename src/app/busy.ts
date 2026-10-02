/** Counts in-progress renders/recordings so updates never interrupt them. */
export class Busy {
  private n = 0;
  private listeners = new Set<(busy: boolean) => void>();

  get active(): boolean {
    return this.n > 0;
  }

  get count(): number {
    return this.n;
  }

  begin(): () => void {
    this.n++;
    if (this.n === 1) this.emit();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.n = Math.max(0, this.n - 1);
      this.emit();
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const end = this.begin();
    try {
      return await fn();
    } finally {
      end();
    }
  }

  onChange(fn: (busy: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.active);
  }
}
