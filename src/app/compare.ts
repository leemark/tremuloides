import { GLAnimator, animationSize } from './animate';
import { fragment, refScale } from '../gl/kit';
import REVEAL from '../gl/shaders/reveal.frag.glsl?raw';
import type { ClipResult } from './video';
import { canvasToBlob } from './pipeline';

/** Reveal timeline (seconds): before, wipe in, hold after, wipe back, short before (loops cleanly). */
export const REVEAL_TIMELINE = { before: 1.2, wipe: 1.6, after: 2.2, back: 1.6, end: 0.4, fps: 30 } as const;

export function revealDuration(): number {
  const t = REVEAL_TIMELINE;
  return t.before + t.wipe + t.after + t.back + t.end;
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Divider position (0 = all original, 1 = all lens) at time `s` seconds. */
export function revealPosition(s: number): number {
  const t = REVEAL_TIMELINE;
  if (s < t.before) return 0;
  let x = s - t.before;
  if (x < t.wipe) return ease(x / t.wipe);
  x -= t.wipe;
  if (x < t.after) return 1;
  x -= t.after;
  if (x < t.back) return 1 - ease(x / t.back);
  return 0;
}

async function decode(blob: Blob, w?: number, h?: number): Promise<ImageBitmap> {
  return w && h
    ? createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    : createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** A short looping video wiping from the original to the lens version and back. */
export async function makeRevealVideo(original: Blob, output: Blob, onProgress?: (f: number) => void): Promise<{ clip: ClipResult; thumb: Blob | null }> {
  const probe = await decode(output);
  const [w, h] = animationSize(probe.width, probe.height);
  probe.close();
  const [before, after] = await Promise.all([decode(original, w, h), decode(output, w, h)]);
  const a = new GLAnimator(w, h, REVEAL_TIMELINE.fps);
  try {
    const tb = a.texture(before);
    const ta = a.texture(after);
    before.close();
    after.close();
    const prog = a.kit.program(fragment(REVEAL), 'reveal');
    const draw = (pos: number) =>
      a.kit.draw(prog, a.target, { textures: { u_before: tb, u_after: ta }, uniforms: { u_pos: pos, u_size: [w, h], u_ref: refScale(w, h) } });
    draw(0);
    await a.start(a.target);
    const total = revealDuration();
    const frames = Math.round(total * REVEAL_TIMELINE.fps);
    for (let i = 0; i < frames; i++) {
      const s = i / REVEAL_TIMELINE.fps;
      draw(revealPosition(s));
      if (Math.abs(s - (REVEAL_TIMELINE.before + REVEAL_TIMELINE.wipe + 0.5)) < 0.5 / REVEAL_TIMELINE.fps) a.snapshot();
      await a.present(1);
      onProgress?.((i + 1) / frames);
    }
    prog.dispose();
    return await a.finish();
  } finally {
    a.dispose();
  }
}

/** Layout for the side-by-side image: two panels and a gap, in px. */
export function sideBySideLayout(w: number, h: number, maxLong = 2400): { panelW: number; panelH: number; gap: number; width: number; height: number } {
  const gap = Math.max(4, Math.round(Math.min(w, h) * 0.012));
  const s = Math.min(1, maxLong / (2 * w + gap));
  const g = Math.max(4, Math.round(gap * s));
  const panelW = Math.min(Math.round(w * s), Math.floor((maxLong - g) / 2));
  const panelH = Math.round((h * panelW) / w);
  return { panelW, panelH, gap: g, width: panelW * 2 + g, height: panelH };
}

/** Original on the left, lens on the right, as a JPEG. */
export async function makeSideBySide(original: Blob, output: Blob): Promise<Blob> {
  const probe = await decode(output);
  const L = sideBySideLayout(probe.width, probe.height);
  probe.close();
  const [b, a] = await Promise.all([decode(original, L.panelW, L.panelH), decode(output, L.panelW, L.panelH)]);
  const c = new OffscreenCanvas(L.width, L.height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#f3f2ec';
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.drawImage(b, 0, 0);
  ctx.drawImage(a, L.panelW + L.gap, 0);
  b.close();
  a.close();
  return canvasToBlob(c, 'image/jpeg', 0.92);
}
