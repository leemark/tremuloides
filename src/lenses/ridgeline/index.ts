import { fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import type { Lens, LensAction, LensActionContext, Params, RenderRequest } from '../types';
import type { Capture } from '../../storage/types';
import { RIDGE_SAMPLE_W, detectRidge, type Ridge } from './skyline';
import { ROOTS, SCALES, buildScore, type Score, type ScoreParams } from './score';
import { writeMidi } from './midi';
import { encodeWav } from './wav';
import { renderScore } from './synth';
import DOWNSAMPLE from './shaders/downsample.frag.glsl?raw';
import RIDGE from './shaders/ridge.frag.glsl?raw';

const PREVIEW_REFRESH_MS = 250;

function scoreParams(p: Params): ScoreParams {
  return { notes: Number(p.notes), scale: String(p.scale), root: String(p.root), tempo: Number(p.tempo) };
}

/** Skyline + score for a stored photo (used by Play, WAV and MIDI). */
export async function scoreFromBlob(blob: Blob, c: Capture): Promise<{ ridge: Ridge; score: Score }> {
  const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const w = RIDGE_SAMPLE_W;
  const h = Math.max(2, Math.round((w * probe.height) / probe.width));
  probe.close();
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  const ridge = detectRidge(px, w, h);
  return { ridge, score: buildScore(ridge.y, px, w, h, scoreParams(c.params), c.seed) };
}

/** Rendered audio per capture, cached while the photo screen is open. */
const audioCache = new Map<string, { buffer: AudioBuffer; score: Score }>();

async function audioFor(ctx: LensActionContext): Promise<{ buffer: AudioBuffer; score: Score }> {
  const hit = audioCache.get(ctx.capture.id);
  if (hit) return hit;
  ctx.toast('Composing…');
  const { score } = await scoreFromBlob(await ctx.source(), ctx.capture);
  const buffer = await renderScore(score, ctx.capture.seed);
  const entry = { buffer, score };
  audioCache.set(ctx.capture.id, entry);
  ctx.onCleanup(() => audioCache.delete(ctx.capture.id));
  return entry;
}

/** Playback with a playhead that follows the note points across the photo. */
function playAction(): LensAction {
  let audio: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let raf = 0;
  let line: HTMLElement | null = null;
  const stop = (ctx: LensActionContext) => {
    cancelAnimationFrame(raf);
    try {
      src?.stop();
    } catch {
      /* already stopped */
    }
    src = null;
    line?.remove();
    line = null;
    ctx.setLabel('Play');
  };
  return {
    id: 'play',
    label: 'Play',
    icon: 'play',
    async run(ctx) {
      if (src) {
        stop(ctx);
        return;
      }
      const { buffer, score } = await audioFor(ctx);
      audio ??= new AudioContext();
      await audio.resume();
      src = audio.createBufferSource();
      src.buffer = buffer;
      src.connect(audio.destination);
      const startAt = audio.currentTime + 0.05;
      src.start(startAt);
      src.onended = () => stop(ctx);
      ctx.setLabel('Stop');
      ctx.onCleanup(() => {
        stop(ctx);
        void audio?.close();
        audio = null;
      });
      line = document.createElement('div');
      line.className = 'playhead';
      ctx.view.append(line);
      const spb = 60 / score.bpm;
      const tick = () => {
        if (!src || !audio || !line) return;
        const beat = (audio.currentTime - startAt) / spb;
        const pts = score.points;
        let x = pts[0]?.x ?? 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (!a) break;
          if (!b || beat < b.beat) {
            const t = b ? Math.min(1, Math.max(0, (beat - a.beat) / Math.max(1e-6, b.beat - a.beat))) : 0;
            x = a.x + ((b?.x ?? a.x) - a.x) * t;
            break;
          }
        }
        // Map image x to the displayed (object-fit: contain) image rectangle.
        const img = ctx.img;
        const vw = img.clientWidth;
        const vh = img.clientHeight;
        const s = Math.min(vw / (img.naturalWidth || 1), vh / (img.naturalHeight || 1));
        const dw = (img.naturalWidth || 1) * s;
        const dh = (img.naturalHeight || 1) * s;
        line.style.left = `${img.offsetLeft + (vw - dw) / 2 + x * dw}px`;
        line.style.top = `${img.offsetTop + (vh - dh) / 2}px`;
        line.style.height = `${dh}px`;
        line.style.opacity = beat < score.beats ? '1' : '0';
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
  };
}

export const ridgelineLens: Lens = {
  id: 'ridgeline',
  name: 'Ridgeline Score',
  tagline: 'Turns the skyline into a melody',
  version: 2,
  kind: 'realtime', // the skyline overlay previews live; audio comes from the saved photo
  seeded: true,
  params: [
    { id: 'notes', label: 'Notes', type: 'range', min: 16, max: 64, step: 1, default: 32 },
    { id: 'scale', label: 'Scale', type: 'select', options: Object.entries(SCALES).map(([value, s]) => ({ value, label: s.label })), default: 'majpent' },
    { id: 'root', label: 'Root', type: 'select', options: ROOTS.map((r) => ({ value: r, label: r })), default: 'D' },
    { id: 'tempo', label: 'Tempo (BPM)', type: 'range', min: 60, max: 140, step: 1, default: 84 },
    { id: 'markers', label: 'Show notes', type: 'toggle', default: true, help: 'Dots where each note is sampled; brighter dots add a mallet sparkle' },
  ],
  actions: [
    playAction(),
    {
      id: 'wav',
      label: 'WAV',
      icon: 'audio',
      async run(ctx) {
        const { buffer } = await audioFor(ctx);
        const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        await ctx.share(new File([encodeWav(chans, buffer.sampleRate)], `${ctx.filenameBase}.wav`, { type: 'audio/wav' }));
      },
    },
    {
      id: 'midi',
      label: 'MIDI',
      icon: 'midi',
      async run(ctx) {
        const { score } = await scoreFromBlob(await ctx.source(), ctx.capture);
        const bytes = writeMidi(score);
        await ctx.share(new File([bytes as Uint8Array<ArrayBuffer>], `${ctx.filenameBase}.mid`, { type: 'audio/midi' }));
      },
    },
  ],

  create(kit: GLKit) {
    const gl = kit.gl;
    const p = {
      down: kit.program(fragment(DOWNSAMPLE), 'ridgeline.down'),
      ridge: kit.program(fragment(RIDGE), 'ridgeline.ridge'),
    };
    let sample: RenderTarget | null = null;
    const ridgeTex = kit.createTexture(0, 0, 'nearest');
    let cols = 0;
    let points = new Float32Array(64 * 3);
    let count = 0;
    let lastKey = '';
    let lastAt = -Infinity;
    let lastRidge: Ridge | null = null;

    function analyse(req: RenderRequest) {
      const w = RIDGE_SAMPLE_W;
      const h = Math.max(2, Math.round((w * req.height) / req.width));
      if (!sample || sample.width !== w || sample.height !== h) {
        kit.deleteTarget(sample);
        sample = kit.createTarget(w, h);
      }
      kit.draw(p.down, sample, { textures: { u_input: req.input }, uniforms: { u_outSize: [w, h] } });
      const px = kit.readPixels(sample);
      const ridge = detectRidge(px, w, h);
      const score = buildScore(ridge.y, px, w, h, scoreParams(req.params), req.seed);
      const data = new Uint8Array(w * 4);
      for (let i = 0; i < w; i++) {
        const v = Math.round(Math.min(1, Math.max(0, ridge.y[i] ?? 0)) * 65535);
        data[i * 4] = v >> 8;
        data[i * 4 + 1] = v & 255;
        data[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, ridgeTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      cols = w;
      points = new Float32Array(64 * 3);
      score.points.slice(0, 64).forEach((pt, i) => points.set([pt.x, pt.y, pt.perc ? 1 : 0], i * 3));
      count = Math.min(64, score.points.length);
      lastRidge = ridge;
    }

    return {
      render(req, target) {
        const key = `${req.params.notes}|${req.params.scale}|${req.params.root}|${req.seed}`;
        const now = performance.now();
        if (req.quality === 'final' || key !== lastKey || now - lastAt >= PREVIEW_REFRESH_MS) {
          analyse(req);
          lastKey = key;
          lastAt = now;
        }
        kit.draw(p.ridge, target, {
          textures: { u_input: req.input, u_ridge: ridgeTex },
          uniforms: { u_cols: cols, u_outSize: [req.width, req.height], u_ref: refScale(req.width, req.height), u_markers: req.params.markers === false ? 0 : 1 },
          ints: { u_count: count },
          vec3Arrays: { u_pts: points },
        });
      },
      info() {
        return lastRidge ? { method: lastRidge.method, confidence: Number(lastRidge.confidence.toFixed(2)), notes: count } : { method: null };
      },
      dispose() {
        kit.deleteTarget(sample);
        gl.deleteTexture(ridgeTex);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
