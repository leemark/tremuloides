import { describe, expect, it } from 'vitest';
import { addExif } from '../src/util/exif';
import { parseExifDate, readExif } from '../src/util/exif-read';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);

describe('EXIF reader', () => {
  it('round-trips date and GPS written by our EXIF writer', () => {
    const date = new Date('2026-10-03T16:05:09Z');
    const tagged = addExif(JPEG, { date, gps: { lat: 37.8981, lon: -107.6573, altitude: 3121.5 } });
    const r = readExif(tagged);
    expect(r.date?.getTime()).toBe(date.getTime());
    expect(r.gps?.lat).toBeCloseTo(37.8981, 3);
    expect(r.gps?.lon).toBeCloseTo(-107.6573, 3);
    expect(r.gps?.altitude).toBeCloseTo(3121.5, 1);
  });

  it('applies the UTC offset when present, else reads local time', () => {
    expect(parseExifDate('2026:10:03 10:05:09', '-06:00')?.toISOString()).toBe('2026-10-03T16:05:09.000Z');
    const local = parseExifDate('2026:10:03 10:05:09');
    expect(local?.getHours()).toBe(10);
    expect(parseExifDate('garbage')).toBeUndefined();
  });

  it('returns nothing for non-JPEGs, JPEGs without EXIF, and truncated data', () => {
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({});
    expect(readExif(JPEG)).toEqual({});
    const tagged = addExif(JPEG, { date: new Date(), gps: { lat: 1, lon: 2 } });
    expect(() => readExif(tagged.subarray(0, 40))).not.toThrow();
  });
});
