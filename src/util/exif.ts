/**
 * Minimal EXIF writer for JPEGs: date/time (with UTC offset), GPS position and altitude,
 * software, and a UserComment describing the lens. Canvas-encoded JPEGs carry no metadata,
 * so without this Google Photos sorts album files by file date and can't place them on a map.
 */

export interface ExifInfo {
  /** Capture time. Local wall-clock time and offset are derived from it. */
  date: Date;
  software?: string;
  /** Free text, e.g. lens name and settings (stored as ASCII UserComment). */
  comment?: string;
  description?: string;
  gps?: { lat: number; lon: number; altitude?: number | null };
}

type Entry = { tag: number; type: number; count: number; data: Uint8Array };

const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const UNDEFINED = 7;
const BYTE = 1;

const enc = new TextEncoder();

/** EXIF strings are ASCII: map common typography to plain characters, drop the rest. */
export function toAscii(s: string): string {
  return s
    .replace(/[·•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '');
}

function ascii(s: string): Uint8Array {
  const clean = toAscii(s);
  const b = new Uint8Array(clean.length + 1);
  b.set(enc.encode(clean));
  return b;
}

function u16(v: number): Uint8Array {
  return new Uint8Array([(v >> 8) & 255, v & 255]);
}

function u32(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}

function rationals(pairs: [number, number][]): Uint8Array {
  const out = new Uint8Array(pairs.length * 8);
  pairs.forEach(([n, d], i) => {
    out.set(u32(n), i * 8);
    out.set(u32(d), i * 8 + 4);
  });
  return out;
}

/** Degrees → [deg, min, sec×100] rationals. */
function dms(value: number): [number, number][] {
  const a = Math.abs(value);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "YYYY:MM:DD HH:MM:SS" in local time, and "+HH:MM" offset. */
export function exifDateTime(d: Date): { dateTime: string; offset: string } {
  const dateTime = `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return { dateTime, offset: `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}` };
}

/** Serialises one IFD at `start` (offset from the TIFF header). Returns bytes and the next free offset. */
function ifd(entries: Entry[], start: number): { bytes: Uint8Array; end: number } {
  entries.sort((a, b) => a.tag - b.tag);
  const headerSize = 2 + entries.length * 12 + 4;
  let dataOffset = start + headerSize;
  const head = new Uint8Array(headerSize);
  const blobs: Uint8Array[] = [];
  head.set(u16(entries.length), 0);
  entries.forEach((e, i) => {
    const o = 2 + i * 12;
    head.set(u16(e.tag), o);
    head.set(u16(e.type), o + 2);
    head.set(u32(e.count), o + 4);
    if (e.data.length <= 4) {
      head.set(e.data, o + 8);
    } else {
      head.set(u32(dataOffset), o + 8);
      const padded = e.data.length % 2 ? new Uint8Array([...e.data, 0]) : e.data;
      blobs.push(padded);
      dataOffset += padded.length;
    }
  });
  // next-IFD offset stays 0
  const total = new Uint8Array(dataOffset - start);
  total.set(head, 0);
  let p = headerSize;
  for (const b of blobs) {
    total.set(b, p);
    p += b.length;
  }
  return { bytes: total, end: dataOffset };
}

/** Builds the TIFF structure (big-endian) that goes after "Exif\0\0". */
export function buildExif(info: ExifInfo): Uint8Array {
  const { dateTime, offset } = exifDateTime(info.date);
  const ifd0: Entry[] = [{ tag: 0x0112, type: SHORT, count: 1, data: new Uint8Array([0, 1, 0, 0]) }]; // Orientation: upright
  if (info.description) {
    const d = ascii(info.description);
    ifd0.push({ tag: 0x010e, type: ASCII, count: d.length, data: d });
  }
  if (info.software) {
    const d = ascii(info.software);
    ifd0.push({ tag: 0x0131, type: ASCII, count: d.length, data: d });
  }
  const dt = ascii(dateTime);
  ifd0.push({ tag: 0x0132, type: ASCII, count: dt.length, data: dt });

  const exifEntries: Entry[] = [
    { tag: 0x9003, type: ASCII, count: dt.length, data: dt }, // DateTimeOriginal
    { tag: 0x9011, type: ASCII, count: offset.length + 1, data: ascii(offset) }, // OffsetTimeOriginal
  ];
  if (info.comment) {
    const body = enc.encode(toAscii(info.comment));
    const data = new Uint8Array(8 + body.length);
    data.set(enc.encode('ASCII\0\0\0'), 0);
    data.set(body, 8);
    exifEntries.push({ tag: 0x9286, type: UNDEFINED, count: data.length, data }); // UserComment
  }

  let gpsEntries: Entry[] | null = null;
  if (info.gps && Number.isFinite(info.gps.lat) && Number.isFinite(info.gps.lon)) {
    const g = info.gps;
    gpsEntries = [
      { tag: 0x0000, type: BYTE, count: 4, data: new Uint8Array([2, 3, 0, 0]) },
      { tag: 0x0001, type: ASCII, count: 2, data: ascii(g.lat >= 0 ? 'N' : 'S') },
      { tag: 0x0002, type: RATIONAL, count: 3, data: rationals(dms(g.lat)) },
      { tag: 0x0003, type: ASCII, count: 2, data: ascii(g.lon >= 0 ? 'E' : 'W') },
      { tag: 0x0004, type: RATIONAL, count: 3, data: rationals(dms(g.lon)) },
    ];
    if (typeof g.altitude === 'number' && Number.isFinite(g.altitude)) {
      gpsEntries.push(
        { tag: 0x0005, type: BYTE, count: 1, data: new Uint8Array([g.altitude < 0 ? 1 : 0, 0, 0, 0]) },
        { tag: 0x0006, type: RATIONAL, count: 1, data: rationals([[Math.round(Math.abs(g.altitude) * 100), 100]]) },
      );
    }
  }

  // Pointers to sub-IFDs live in IFD0; their values are known only after laying out IFD0.
  ifd0.push({ tag: 0x8769, type: LONG, count: 1, data: u32(0) });
  if (gpsEntries) ifd0.push({ tag: 0x8825, type: LONG, count: 1, data: u32(0) });

  const first = ifd(ifd0.map((e) => ({ ...e })), 8);
  const exif = ifd(exifEntries, first.end);
  const gps = gpsEntries ? ifd(gpsEntries, exif.end) : null;
  // Re-serialise IFD0 with the real pointers (same layout, so offsets don't move).
  for (const e of ifd0) {
    if (e.tag === 0x8769) e.data = u32(first.end);
    if (e.tag === 0x8825) e.data = u32(exif.end);
  }
  const ifd0Final = ifd(ifd0, 8);

  const tiff = new Uint8Array((gps ? gps.end : exif.end));
  tiff.set(enc.encode('MM'), 0);
  tiff.set(u16(42), 2);
  tiff.set(u32(8), 4);
  tiff.set(ifd0Final.bytes, 8);
  tiff.set(exif.bytes, first.end);
  if (gps) tiff.set(gps.bytes, exif.end);
  return tiff;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** True when the JPEG already has an Exif APP1 segment (e.g. straight from the camera). */
export function hasExif(bytes: Uint8Array): boolean {
  let p = 2;
  while (p + 4 < bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    const len = ((bytes[p + 2] ?? 0) << 8) | (bytes[p + 3] ?? 0);
    if (marker === 0xe1 && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66) return true;
    p += 2 + len;
  }
  return false;
}

/** Inserts an Exif APP1 segment right after SOI. Non-JPEGs and JPEGs that already have Exif are returned unchanged. */
export function addExif(bytes: Uint8Array, info: ExifInfo): Uint8Array {
  if (!isJpeg(bytes) || hasExif(bytes)) return bytes;
  const tiff = buildExif(info);
  const payloadLen = 6 + tiff.length; // "Exif\0\0" + TIFF
  if (payloadLen + 2 > 0xffff) return bytes; // too large for one segment (never in practice)
  const seg = new Uint8Array(4 + payloadLen);
  seg.set([0xff, 0xe1], 0);
  seg.set(u16(payloadLen + 2), 2);
  seg.set(enc.encode('Exif\0\0'), 4);
  seg.set(tiff, 10);
  const out = new Uint8Array(bytes.length + seg.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(bytes.subarray(2), 2 + seg.length);
  return out;
}
