import { mulberry32 } from '../../util/prng';
import type { Score } from './score';

const SR = 44100;
const TAIL_S = 2.5;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Seeded exponential-decay noise impulse for a small, warm room. */
function impulse(ctx: BaseAudioContext, seed: number): AudioBuffer {
  const len = Math.floor(SR * 2.2);
  const buf = ctx.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(seed + c * 7919);
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3.2) * Math.exp((-3 * i) / len);
  }
  return buf;
}

/**
 * Renders the score with Web Audio only (no samples): a soft plucked voice (triangle + sine
 * octave through a closing low-pass) for the melody, a two-partial mallet for sparkles, and a
 * procedurally generated reverb. Rendered offline so playback and WAV export sound the same.
 */
export async function renderScore(score: Score, seed: number): Promise<AudioBuffer> {
  const spb = 60 / Math.max(1, score.bpm);
  const length = Math.ceil((score.beats * spb + TAIL_S) * SR);
  const ctx = new OfflineAudioContext(2, length, SR);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, seed);
  dry.connect(master);
  wet.connect(verb).connect(master);

  const bus = (pan: number) => {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dry);
    p.connect(wet);
    return p;
  };

  for (const n of score.notes) {
    const t0 = n.beat * spb;
    const dur = Math.max(0.12, n.dur * spb);
    const f = hz(n.midi);
    const v = (n.vel / 127) * 0.32;
    const out = bus(((n.midi - 60) / 24) * 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.2), t0 + 0.35);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(v, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(v * 0.45, t0 + 0.4);
    env.gain.setValueAtTime(v * 0.45, t0 + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.6);
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = f;
    const sine = ctx.createOscillator();
    sine.frequency.value = f * 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.25;
    tri.connect(lp);
    sine.connect(sg).connect(lp);
    lp.connect(env).connect(out);
    for (const o of [tri, sine]) {
      o.start(t0);
      o.stop(t0 + dur + 0.7);
    }
  }

  for (const n of score.perc) {
    const t0 = n.beat * spb;
    const f = hz(n.midi);
    const v = (n.vel / 127) * 0.16;
    const out = bus(Math.sin(n.beat * 1.7) * 0.6);
    for (const [ratio, amp, decay] of [
      [1, 1, 0.9],
      [2.76, 0.35, 0.35],
    ] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v * amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + decay + 0.05);
    }
  }
  const out = await ctx.startRendering();
  // Normalize to a consistent loudness (peak −2 dBFS) whatever the note count.
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) for (const v of out.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  if (peak > 1e-4) {
    const g = 0.8 / peak;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * g;
    }
  }
  return out;
}
