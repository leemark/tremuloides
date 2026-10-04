import type { Score } from './score';

const PPQ = 480;

function varLen(v: number): number[] {
  const bytes = [v & 0x7f];
  let x = v >> 7;
  while (x > 0) {
    bytes.unshift((x & 0x7f) | 0x80);
    x >>= 7;
  }
  return bytes;
}

/**
 * Standard MIDI File (format 0, one track). Melody on channel 1 (Vibraphone), mallet
 * sparkles on channel 2 (Glockenspiel), tempo from the score.
 */
export function writeMidi(score: Score): Uint8Array {
  type Ev = { tick: number; order: number; data: number[] };
  const evs: Ev[] = [];
  const usPerQuarter = Math.round(60_000_000 / Math.max(1, score.bpm));
  evs.push({ tick: 0, order: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] });
  evs.push({ tick: 0, order: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] });
  evs.push({ tick: 0, order: 0, data: [0xc0, 11] }); // ch1: vibraphone
  evs.push({ tick: 0, order: 0, data: [0xc1, 9] }); // ch2: glockenspiel
  const add = (ch: number, notes: Score['notes']) => {
    for (const n of notes) {
      const on = Math.round(n.beat * PPQ);
      const off = Math.max(on + 1, Math.round((n.beat + n.dur * 0.95) * PPQ));
      const key = Math.min(127, Math.max(0, n.midi));
      evs.push({ tick: on, order: 2, data: [0x90 | ch, key, Math.min(127, Math.max(1, n.vel))] });
      evs.push({ tick: off, order: 1, data: [0x80 | ch, key, 0] }); // offs before ons at the same tick
    }
  };
  add(0, score.notes);
  add(1, score.perc);
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const e of evs) {
    track.push(...varLen(e.tick - last), ...e.data);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
  const len = track.length;
  return new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...track]);
}
