import { describe, expect, it } from 'vitest';
import { detectRidge, isSky, ridgeAt } from '../src/lenses/ridgeline/skyline';
import { buildScore, heightToMidi } from '../src/lenses/ridgeline/score';
import { writeMidi } from '../src/lenses/ridgeline/midi';
import { encodeWav } from '../src/lenses/ridgeline/wav';

/** Synthetic landscape: blue sky (optionally with a white cloud band), a ridge y = f(x), textured ground. */
function scene(w: number, h: number, ridge: (u: number) => number, opts: { cloud?: boolean; gold?: boolean } = {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ry = ridge(x / w) * h;
      let c: [number, number, number];
      if (y < ry) c = opts.cloud && y > h * 0.1 && y < h * 0.2 ? ((x + y) % 3 ? [236, 240, 248] : [196, 204, 222]) : [78, 134, 210];
      else if (opts.gold && y < ry + h * 0.15) c = [233, 184, 37];
      else c = (x * 7 + y * 13) % 5 < 2 ? [40, 70, 50] : [70, 60, 40]; // dark, textured
      px.set([...c, 255], i);
    }
  }
  return px;
}

describe('skyline', () => {
  const w = 128;
  const h = 96;
  const f = (u: number) => 0.45 + 0.15 * Math.sin(u * 9);

  it('classifies blue sky and clouds as sky, foliage and rock as ground', () => {
    expect(isSky(0.62, -0.03, -0.09, 0.005)).toBe(true); // blue sky
    expect(isSky(0.9, 0.0, -0.01, 0.01)).toBe(true); // cloud
    expect(isSky(0.8, 0.0, 0.15, 0.01)).toBe(false); // gold leaves
    expect(isSky(0.5, 0.03, 0.03, 0.08)).toBe(false); // textured rock
    expect(isSky(0.3, -0.01, -0.03, 0.02)).toBe(false); // dark spruce in shade
  });

  it('traces a ridge under sky, ignoring a textured cloud band above it', () => {
    for (const cloud of [false, true]) {
      const r = detectRidge(scene(w, h, f, { cloud }), w, h);
      expect(r.method).toBe('sky');
      expect(r.confidence).toBeGreaterThan(0.9);
      let err = 0;
      for (let x = 0; x < w; x++) err += Math.abs((r.y[x] ?? 0) - f((x + 0.5) / w));
      expect(err / w).toBeLessThan(0.025);
    }
  });

  it('is not fooled by white aspen trunks', () => {
    const px = scene(w, h, f);
    // Bright, smooth, neutral trunks 2 px wide from the ridge to the bottom.
    for (const tx of [20, 21, 60, 61, 62, 100]) for (let y = 0; y < h; y++) if (y > f(tx / w) * h) px.set([235, 232, 222, 255], (y * w + tx) * 4);
    const r = detectRidge(px, w, h);
    for (const tx of [20, 61, 100]) expect(Math.abs((r.y[tx] ?? 0) - f((tx + 0.5) / w))).toBeLessThan(0.04);
  });

  it('ignores sky reflected in a lake below the ridge', () => {
    // Ridge, then dark shore, then a calm lake mirroring the blue sky over the bottom third.
    const px = scene(w, h, f);
    for (let y = Math.floor(h * 0.68); y < Math.floor(h * 0.95); y++) for (let x = 0; x < w; x++) px.set([88, 140, 212, 255], (y * w + x) * 4);
    const r = detectRidge(px, w, h);
    expect(r.method).toBe('sky');
    let err = 0;
    for (let x = 0; x < w; x++) err += Math.abs((r.y[x] ?? 0) - f((x + 0.5) / w));
    expect(err / w).toBeLessThan(0.025);
  });

  it('flows around a cloud that does not read as sky', () => {
    const px = scene(w, h, f);
    // A dark, textured storm cloud blob hanging just above the ridge in the middle.
    for (let y = Math.floor(h * 0.05); y < Math.floor(h * 0.25); y++) for (let x = 40; x < 90; x++) px.set((x + y) % 2 ? [90, 90, 100, 255] : [140, 140, 150, 255], (y * w + x) * 4);
    const r = detectRidge(px, w, h);
    expect(Math.abs(ridgeAt(r.y, 0.5) - f(0.5))).toBeLessThan(0.04);
  });

  it('falls back to the strongest edge when there is no sky', () => {
    const px = scene(w, h, f);
    for (let i = 0; i < w * h * 4; i += 4) if ((px[i + 2] ?? 0) > 200) px.set([200, 150, 90, 255], i); // orange "sky"
    const r = detectRidge(px, w, h);
    expect(r.method).toBe('edge');
    expect(Math.abs(ridgeAt(r.y, 0.5) - f(0.5))).toBeLessThan(0.06);
  });
});

describe('score', () => {
  it('maps heights across two octaves of the scale', () => {
    expect(heightToMidi(0, 'majpent', 'D')).toBe(50); // D3
    expect(heightToMidi(1, 'majpent', 'D')).toBe(74); // D5
    expect(heightToMidi(0.5, 'majpent', 'C')).toBe(60); // C4
  });

  it('builds a deterministic score, higher peaks → higher notes, gold → sparkles', () => {
    const w = 128;
    const h = 96;
    const f = (u: number) => 0.3 + 0.4 * u; // ridge descends left→right on screen = heights fall
    const px = scene(w, h, f, { gold: true });
    const r = detectRidge(px, w, h);
    const p = { notes: 32, scale: 'majpent', root: 'D', tempo: 84 };
    const a = buildScore(r.y, px, w, h, p, 7);
    expect(a).toEqual(buildScore(r.y, px, w, h, p, 7));
    expect(a.points).toHaveLength(32);
    expect(a.notes[0]!.midi).toBeGreaterThan(a.notes[a.notes.length - 1]!.midi);
    expect(a.perc.length).toBeGreaterThan(20);
    expect(a.beats).toBeGreaterThan(8);
  });
});

describe('exports', () => {
  it('writes a valid single-track MIDI file', () => {
    const bytes = writeMidi({ bpm: 84, beats: 2, notes: [{ beat: 0, dur: 1, midi: 62, vel: 90 }, { beat: 1, dur: 1, midi: 66, vel: 80 }], perc: [{ beat: 0, dur: 0.5, midi: 86, vel: 60 }], points: [] });
    const text = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    expect(text(0)).toBe('MThd');
    expect(text(14)).toBe('MTrk');
    const len = ((bytes[18]! << 24) | (bytes[19]! << 16) | (bytes[20]! << 8) | bytes[21]!) >>> 0;
    expect(bytes.length).toBe(22 + len);
    expect(Array.from(bytes.subarray(bytes.length - 3))).toEqual([0xff, 0x2f, 0x00]);
    // 3 note-ons
    let ons = 0;
    for (let i = 22; i < bytes.length - 2; i++) if ((bytes[i]! & 0xf0) === 0x90 && bytes[i + 2]! > 0 && bytes[i + 1]! < 128) ons++;
    expect(ons).toBeGreaterThanOrEqual(3);
  });

  it('writes a 16-bit stereo WAV', () => {
    const wav = encodeWav([new Float32Array([0, 0.5, -1]), new Float32Array([0, -0.5, 1])], 44100);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(40, true)).toBe(12);
    // interleaved L/R frames: (0, 0), (0.5, -0.5), (-1, 1)
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([0, 0]);
    expect([v.getInt16(48, true), v.getInt16(50, true)]).toEqual([16383, -16384]);
    expect([v.getInt16(52, true), v.getInt16(54, true)]).toEqual([-32768, 32767]);
  });
});
