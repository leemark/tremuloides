import { describe, expect, it } from 'vitest';
import { exportFilename, formatBytes, formatVersion, dayKey } from '../src/util/format';
import { latestChangelogEntry } from '../src/util/changelog';

describe('format', () => {
  it('builds export filenames in local time', () => {
    const d = new Date(2026, 9, 2, 7, 5, 9);
    expect(exportFilename(d, 'ink-wash')).toBe('tremuloides_20261002_070509_ink-wash.jpg');
    expect(exportFilename(d, 'posterize', 'png')).toBe('tremuloides_20261002_070509_posterize.png');
  });

  it('formats versions and sizes', () => {
    expect(formatVersion('0.3.0', 'abc1234')).toBe('v0.3.0 (abc1234)');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
  });

  it('groups by local day', () => {
    const d = new Date(2026, 9, 2, 23, 59);
    expect(dayKey(d.toISOString())).toBe('2026-10-02');
  });
});

describe('changelog', () => {
  it('reads the newest entry', () => {
    const md = '# Changelog\n\n## v0.2.0 (2026-10-02)\n- Ink & Wash lens\n- Faster preview\n\n## v0.1.0\n- First release\n';
    expect(latestChangelogEntry(md)).toEqual({ version: '0.2.0', notes: ['Ink & Wash lens', 'Faster preview'] });
    expect(latestChangelogEntry('')).toBeNull();
  });
});
