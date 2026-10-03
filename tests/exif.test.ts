import { describe, expect, it } from 'vitest';
import { addExif, buildExif, exifDateTime, hasExif, toAscii } from '../src/util/exif';

/** Tiny big-endian EXIF reader for the tests: returns tag → raw value per IFD. */
function readTiff(t: Uint8Array) {
  const u16 = (o: number) => ((t[o] ?? 0) << 8) | (t[o + 1] ?? 0);
  const u32 = (o: number) => (((t[o] ?? 0) << 24) >>> 0) + (((t[o + 1] ?? 0) << 16) | ((t[o + 2] ?? 0) << 8) | (t[o + 3] ?? 0));
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
  const readIfd = (off: number) => {
    const n = u16(off);
    const out: Record<number, { type: number; count: number; at: number }> = {};
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (sizes[type] ?? 1) * count;
      out[u16(e)] = { type, count, at: size <= 4 ? e + 8 : u32(e + 8) };
    }
    return out;
  };
  const str = (v: { count: number; at: number }) => new TextDecoder().decode(t.subarray(v.at, v.at + v.count - 1));
  const rat = (v: { at: number }, i = 0) => u32(v.at + i * 8) / u32(v.at + i * 8 + 4);
  expect(new TextDecoder().decode(t.subarray(0, 2))).toBe('MM');
  expect(u16(2)).toBe(42);
  const ifd0 = readIfd(u32(4));
  return { ifd0, exif: readIfd(u32(ifd0[0x8769]!.at)), gps: ifd0[0x8825] ? readIfd(u32(ifd0[0x8825].at)) : null, str, rat, t };
}

const fakeJpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);

describe('exif', () => {
  const date = new Date(2026, 9, 2, 16, 5, 9);
  const info = { date, software: 'Tremuloides 0.6.1', comment: 'Lens: Ink & Wash v2', gps: { lat: 37.93841, lon: -107.80777, altitude: 3341.4 } };

  it('formats local date/time and offset', () => {
    const { dateTime, offset } = exifDateTime(date);
    expect(dateTime).toBe('2026:10:02 16:05:09');
    expect(offset).toMatch(/^[+-]\d\d:\d\d$/);
  });

  it('writes readable date, software, comment and GPS', () => {
    const r = readTiff(buildExif(info));
    expect(r.str(r.ifd0[0x0132]!)).toBe('2026:10:02 16:05:09');
    expect(r.str(r.ifd0[0x0131]!)).toBe('Tremuloides 0.6.1');
    expect(r.str(r.exif[0x9003]!)).toBe('2026:10:02 16:05:09');
    const uc = r.exif[0x9286]!;
    expect(new TextDecoder().decode(r.t.subarray(uc.at + 8, uc.at + uc.count))).toBe('Lens: Ink & Wash v2');
    const g = r.gps!;
    expect(r.str(g[0x0001]!)).toBe('N');
    expect(r.str(g[0x0003]!)).toBe('W');
    const lat = r.rat(g[0x0002]!, 0) + r.rat(g[0x0002]!, 1) / 60 + r.rat(g[0x0002]!, 2) / 3600;
    const lon = r.rat(g[0x0004]!, 0) + r.rat(g[0x0004]!, 1) / 60 + r.rat(g[0x0004]!, 2) / 3600;
    expect(lat).toBeCloseTo(37.93841, 5);
    expect(lon).toBeCloseTo(107.80777, 5);
    expect(r.rat(g[0x0006]!)).toBeCloseTo(3341.4, 2);
  });

  it('turns typography into plain ASCII', () => {
    expect(toAscii('Ink & Wash · Levels 5 – 4096×3072 “café”')).toBe('Ink & Wash - Levels 5 - 4096x3072 "cafe"');
  });

  it('omits GPS when there is no fix', () => {
    expect(readTiff(buildExif({ date })).gps).toBeNull();
  });

  it('inserts an APP1 segment into JPEGs once, leaving non-JPEGs and camera EXIF alone', () => {
    const jpg = fakeJpeg();
    expect(hasExif(jpg)).toBe(false);
    const out = addExif(jpg, info);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xe1);
    expect(hasExif(out)).toBe(true);
    expect(addExif(out, info)).toBe(out);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(addExif(png, info)).toBe(png);
    // the rest of the file is preserved
    expect(Array.from(out.subarray(out.length - jpg.length + 2))).toEqual(Array.from(jpg.subarray(2)));
  });
});
