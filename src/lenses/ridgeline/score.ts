import { mulberry32 } from '../../util/prng';
import { isWarmFoliage } from '../../fieldlog/analyze';
import { srgbToOklab } from '../../color/oklab';
import { ridgeAt } from './skyline';

export const SCALES: Record<string, { label: string; steps: number[] }> = {
  majpent: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minpent: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { label: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
};
export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface Note {
  beat: number;
  dur: number;
  midi: number;
  vel: number;
}

export interface Score {
  bpm: number;
  beats: number;
  notes: Note[];
  /** Mallet sparkles where bright autumn colour sits just below the ridge. */
  perc: Note[];
  /** Image position (0–1) of each sampled point, for markers and the playhead. */
  points: { x: number; y: number; beat: number; perc: boolean }[];
}

export interface ScoreParams {
  notes: number;
  scale: string;
  root: string;
  tempo: number;
}

/** MIDI note for a 0–1 height within a two-octave range starting at root in octave 3. */
export function heightToMidi(t: number, scale: string, root: string): number {
  const steps = SCALES[scale]?.steps ?? (SCALES.majpent?.steps as number[]);
  const degrees = steps.length * 2 + 1; // two octaves plus the top tonic
  const idx = Math.round(Math.min(1, Math.max(0, t)) * (degrees - 1));
  const octave = Math.floor(idx / steps.length);
  const base = 48 + Math.max(0, ROOTS.indexOf(root as (typeof ROOTS)[number]));
  return base + octave * 12 + (steps[idx % steps.length] ?? 0);
}

/** Fraction of warm-foliage pixels in a band just below the ridge around column u. */
function warmBelow(rgba: ArrayLike<number>, w: number, h: number, u: number, ridgeY: number, halfWidth: number): number {
  const x0 = Math.max(0, Math.floor((u - halfWidth) * w));
  const x1 = Math.min(w - 1, Math.ceil((u + halfWidth) * w));
  const y0 = Math.min(h - 1, Math.floor(ridgeY * h) + 1);
  const y1 = Math.min(h - 1, Math.floor((ridgeY + 0.25) * h));
  let warm = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (isWarmFoliage(srgbToOklab([(rgba[i] ?? 0) / 255, (rgba[i + 1] ?? 0) / 255, (rgba[i + 2] ?? 0) / 255]))) warm++;
      n++;
    }
  }
  return n ? warm / n : 0;
}

/**
 * Turns a skyline into a melody: sampled heights → scale degrees across two octaves; steep
 * sections get shorter notes; flat repeated pitches are tied; bright warm colour under the
 * ridge adds mallet sparkles. The seed only humanizes timing and velocity.
 */
export function buildScore(ridge: Float32Array, rgba: ArrayLike<number>, w: number, h: number, p: ScoreParams, seed: number): Score {
  const rand = mulberry32(seed);
  const n = Math.max(2, Math.round(p.notes));
  const heights = Array.from({ length: n }, (_, i) => 1 - ridgeAt(ridge, (i + 0.5) / n));
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const range = hi - lo;
  const norm = heights.map((v) => (range > 0.02 ? (v - lo) / range : 0.5));
  const notes: Note[] = [];
  const perc: Note[] = [];
  const points: Score['points'] = [];
  let beat = 0;
  for (let i = 0; i < n; i++) {
    const t = norm[i] ?? 0.5;
    const slope = Math.abs((norm[Math.min(n - 1, i + 1)] ?? t) - (norm[Math.max(0, i - 1)] ?? t));
    const dur = slope > 0.25 ? 0.5 : 1;
    const midi = heightToMidi(t, p.scale, p.root);
    const jitter = (rand() - 0.5) * 0.06;
    const vel = Math.round(Math.min(120, Math.max(30, 66 + 34 * t + (rand() - 0.5) * 16)));
    const prev = notes[notes.length - 1];
    if (prev && prev.midi === midi && slope < 0.05 && prev.dur < 4) {
      prev.dur += dur; // tie flat stretches into longer notes
    } else {
      notes.push({ beat: Math.max(0, beat + jitter), dur, midi, vel });
    }
    const u = (i + 0.5) / n;
    const ry = ridgeAt(ridge, u);
    const warm = warmBelow(rgba, w, h, u, ry, 0.5 / n);
    const sparkle = warm > 0.2;
    if (sparkle) perc.push({ beat: Math.max(0, beat + jitter + 0.02), dur: 0.5, midi: midi + 24, vel: Math.round(Math.min(110, 45 + warm * 70)) });
    points.push({ x: u, y: ry, beat, perc: sparkle });
    beat += dur;
  }
  return { bpm: p.tempo, beats: beat, notes, perc, points };
}
