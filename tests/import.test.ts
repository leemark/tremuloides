import { describe, expect, it } from 'vitest';
import { decodeFailureReason, importDate, importSummary, isHeic, partitionFiles } from '../src/app/import';
import { pendingCaptures } from '../src/storage/album';
import type { Capture } from '../src/storage/types';

describe('photo import', () => {
  it('keeps images (incl. HEIC by extension), skips other files', () => {
    const files = [
      { name: 'a.jpg', type: 'image/jpeg' },
      { name: 'b.HEIC', type: '' },
      { name: 'c.png', type: '' },
      { name: 'notes.pdf', type: 'application/pdf' },
      { name: 'clip.mp4', type: 'video/mp4' },
    ];
    const r = partitionFiles(files);
    expect(r.images.map((f) => f.name)).toEqual(['a.jpg', 'b.HEIC', 'c.png']);
    expect(r.skipped.map((f) => f.name)).toEqual(['notes.pdf', 'clip.mp4']);
  });

  it('explains HEIC decode failures in plain words', () => {
    expect(isHeic({ name: 'x.heif', type: '' })).toBe(true);
    expect(isHeic({ name: 'x', type: 'image/heic' })).toBe(true);
    expect(decodeFailureReason({ name: 'x.heic', type: '' })).toMatch(/^HEIC/);
    expect(decodeFailureReason({ name: 'x.jpg', type: 'image/jpeg' })).not.toMatch(/HEIC/);
  });

  it('dates imports by EXIF, then file time, never the future', () => {
    const exif = new Date('2026-10-03T16:00:00Z');
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(importDate(exif, 123, now)).toBe(exif);
    expect(importDate(undefined, Date.parse('2026-10-02T10:00:00Z'), now).toISOString()).toBe('2026-10-02T10:00:00.000Z');
    expect(importDate(undefined, now + 86400000, now).getTime()).toBe(now);
    expect(importDate(undefined, 0, now).getTime()).toBe(now);
  });

  it('summarises results', () => {
    expect(importSummary({ imported: [{} as Capture, {} as Capture], failed: [] })).toBe('Imported 2 photos');
    expect(importSummary({ imported: [], failed: [{ name: 'a', reason: 'HEIC photo…' }] })).toMatch(/No photos imported · 1 skipped \(1 HEIC/);
  });

  it('does not copy plain imports to the phone album (they are already there)', () => {
    const base = { albumSavedAt: undefined, createdAt: '2026-10-10T00:00:00Z' };
    const caps = [
      { ...base, id: 'imp', source: 'import', lensId: 'original' },
      { ...base, id: 'render', source: 'import', lensId: 'ink-wash' },
      { ...base, id: 'cam', source: 'camera', lensId: 'original' },
    ] as Capture[];
    expect(pendingCaptures(caps, '2026-01-01T00:00:00Z').map((c) => c.id)).toEqual(['render', 'cam']);
  });
});
