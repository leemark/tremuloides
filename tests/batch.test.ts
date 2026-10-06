import { describe, expect, it } from 'vitest';
import { planBatch } from '../src/app/batch';
import type { Capture } from '../src/storage/types';

const cap = (id: string, createdAt: string, extra: Partial<Capture> = {}) =>
  ({ id, createdAt, outputType: 'image/jpeg', originalKey: `o${id}`, outputKey: `x${id}`, thumbKey: `t${id}`, lensId: 'ink-wash', ...extra }) as Capture;

describe('batch re-render plan', () => {
  it('keeps selected photos oldest first, skips clips, counts missing originals', () => {
    const caps = [
      cap('c', '2026-10-03T10:00:00Z'),
      cap('a', '2026-10-01T10:00:00Z'),
      cap('v', '2026-10-02T10:00:00Z', { outputType: 'video/mp4' }),
      cap('b', '2026-10-02T09:00:00Z', { originalKey: undefined }),
      cap('z', '2026-10-04T10:00:00Z'),
    ];
    const p = planBatch(caps, new Set(['a', 'b', 'c', 'v']));
    expect(p.items.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(p.skippedVideos).toBe(1);
    expect(p.withoutOriginal).toBe(1);
  });
});
