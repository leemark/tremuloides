/**
 * Minimal EXIF reader for imported JPEGs: capture time (with UTC offset when present) and GPS.
 * Pairs with exif.ts (the writer). Never throws: malformed data just yields fewer fields.
 */

export interface ExifData {
  /** DateTimeOriginal as an absolute time (offset applied when the file has one, else device-local). */
  date?: Date;
  gps?: { lat: number; lon: number; altitude: number | null };
}

class View {
  constructor(
    readonly b: Uint8Array,
    readonly base: number,
    readonly le: boolean,
  ) {}
  u16(o: number): number {
    const a = this.b[this.base + o] ?? 0;
    const c = this.b[this.base + o + 1] ?? 0;
    return this.le ? a | (c << 8) : (a << 8) | c;
  }
  u32(o: number): number {
    return this.le ? (this.u16(o) | (this.u16(o + 2) << 16)) >>> 0 : ((this.u16(o) << 16) | this.u16(o + 2)) >>> 0;
  }
  ascii(o: number, n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = this.b[this.base + o + i] ?? 0;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  get size(): number {
    return this.b.length - this.base;
  }
}

interface Entry {
  type: number;
  count: number;
  /** Offset of the value (inline or pointed to), relative to the TIFF header. */
  at: number;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readIfd(v: View, off: number): Map<number, Entry> {
  const out = new Map<number, Entry>();
  if (off <= 0 || off + 2 > v.size) return out;
  const n = v.u16(off);
  for (let i = 0; i < n && off + 2 + i * 12 + 12 <= v.size; i++) {
    const e = off + 2 + i * 12;
    const type = v.u16(e + 2);
    const count = v.u32(e + 4);
    const bytes = (TYPE_SIZE[type] ?? 1) * count;
    out.set(v.u16(e), { type, count, at: bytes <= 4 ? e + 8 : v.u32(e + 8) });
  }
  return out;
}

function rational(v: View, at: number): number {
  const d = v.u32(at + 4);
  return d ? v.u32(at) / d : 0;
}

function dms(v: View, e: Entry | undefined): number | null {
  if (!e || e.type !== 5 || e.count < 3 || e.at + 24 > v.size) return null;
  return rational(v, e.at) + rational(v, e.at + 8) / 60 + rational(v, e.at + 16) / 3600;
}

function str(v: View, e: Entry | undefined): string | undefined {
  if (!e || e.type !== 2 || e.at + e.count > v.size) return undefined;
  return v.ascii(e.at, e.count);
}

/** "YYYY:MM:DD HH:MM:SS" (+ optional "+HH:MM") → Date. */
export function parseExifDate(dt: string | undefined, offset?: string): Date | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt ?? '');
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  if (!y || !mo || !d) return undefined;
  const o = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? '');
  if (o) {
    const sign = o[1] === '-' ? -1 : 1;
    const mins = sign * (Number(o[2]) * 60 + Number(o[3]));
    return new Date(Date.UTC(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0) - mins * 60000);
  }
  return new Date(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0);
}

/** Finds the Exif APP1 segment and reads date and GPS. */
export function readExif(bytes: Uint8Array): ExifData {
  try {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
    let p = 2;
    while (p + 4 < bytes.length && bytes[p] === 0xff) {
      const marker = bytes[p + 1] ?? 0;
      if (marker === 0xda || marker === 0xd9) break;
      const len = ((bytes[p + 2] ?? 0) << 8) | (bytes[p + 3] ?? 0);
      if (marker === 0xe1 && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66) {
        return parseTiff(bytes.subarray(0, p + 2 + len), p + 10);
      }
      p += 2 + len;
    }
  } catch {
    /* malformed: return what we have */
  }
  return {};
}

function parseTiff(bytes: Uint8Array, base: number): ExifData {
  const le = bytes[base] === 0x49;
  const v = new View(bytes, base, le);
  if (v.u16(2) !== 42) return {};
  const ifd0 = readIfd(v, v.u32(4));
  const out: ExifData = {};
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = readIfd(v, v.u32(exifPtr.at));
    const date = parseExifDate(str(v, exif.get(0x9003)) ?? str(v, ifd0.get(0x0132)), str(v, exif.get(0x9011)));
    if (date && !Number.isNaN(date.getTime())) out.date = date;
  } else {
    const date = parseExifDate(str(v, ifd0.get(0x0132)));
    if (date) out.date = date;
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const g = readIfd(v, v.u32(gpsPtr.at));
    const lat = dms(v, g.get(2));
    const lon = dms(v, g.get(4));
    if (lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
      const latRef = str(v, g.get(1)) ?? 'N';
      const lonRef = str(v, g.get(3)) ?? 'E';
      const altE = g.get(6);
      let altitude: number | null = altE && altE.type === 5 ? rational(v, altE.at) : null;
      const altRef = g.get(5);
      if (altitude !== null && altRef && (bytes[base + altRef.at] ?? 0) === 1) altitude = -altitude;
      out.gps = { lat: latRef === 'S' ? -lat : lat, lon: lonRef === 'W' ? -lon : lon, altitude };
    }
  }
  return out;
}
