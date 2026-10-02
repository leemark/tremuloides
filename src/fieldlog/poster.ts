import { mulberry32 } from '../util/prng';
import type { Capture } from '../storage/types';

export type PosterLayout = 'stripes-time' | 'stripes-elevation' | 'rings' | 'grid';

export const POSTER_SIZE = { width: 4800, height: 7200 } as const;

export interface PosterItem {
  palette: { hex: string; weight: number }[];
  altitude: number | null;
  createdAt: string;
}

export interface PosterText {
  title: string;
  dates: string;
  elevation: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const PAPER = '#f3f2ec';
const INK = '#1a1c21';

/** Captures with palettes, ordered for the layout (elevation: highest first; no-GPS captures left out). */
export function posterItems(caps: readonly Capture[], layout: PosterLayout): PosterItem[] {
  const items = caps
    .filter((c) => c.fieldlog && c.fieldlog.palette.length > 0)
    .map((c) => ({ palette: c.fieldlog?.palette ?? [], altitude: c.geo?.altitude ?? null, createdAt: c.createdAt }));
  if (layout === 'stripes-elevation') {
    return items.filter((i) => i.altitude !== null).sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));
  }
  return items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** Columns × rows for n cells in a w×h area, cells roughly square. */
export function gridDims(n: number, w: number, h: number): [number, number] {
  if (n <= 0) return [1, 1];
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
  return [cols, Math.ceil(n / cols)];
}

/** Splits a length by weights (normalised), returning [start, size] pairs. */
export function splitByWeights(total: number, weights: readonly number[]): [number, number][] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let pos = 0;
  return weights.map((w) => {
    const size = (Math.max(0, w) / sum) * total;
    const seg: [number, number] = [pos, size];
    pos += size;
    return seg;
  });
}

export function drawPoster(ctx: Ctx, W: number, H: number, items: readonly PosterItem[], layout: PosterLayout, seed: number, text: PosterText): void {
  const rand = mulberry32(seed);
  const u = W / 1000; // layout unit
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const margin = 70 * u;
  const footer = 190 * u;
  const x0 = margin;
  const y0 = margin;
  const aw = W - margin * 2;
  const ah = H - margin * 2 - footer;

  if (items.length === 0) {
    ctx.fillStyle = INK;
    ctx.font = `${40 * u}px system-ui, sans-serif`;
    ctx.fillText('No analysed photos yet', x0, y0 + 60 * u);
  } else if (layout === 'stripes-time' || layout === 'stripes-elevation') {
    const gap = Math.min(4 * u, ah / items.length / 6);
    const band = ah / items.length;
    items.forEach((it, i) => {
      const y = y0 + i * band;
      const segs = splitByWeights(aw, it.palette.map((p) => p.weight));
      segs.forEach(([sx, sw], k) => {
        ctx.fillStyle = it.palette[k]?.hex ?? INK;
        ctx.fillRect(x0 + sx, y, sw + 0.5, band - gap);
      });
    });
  } else if (layout === 'rings') {
    const cx = x0 + aw / 2;
    const cy = y0 + ah / 2;
    const R = Math.min(aw, ah) / 2;
    const ring = R / (items.length + 0.6);
    // Draw outermost first so inner rings sit on top.
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i] as PosterItem;
      const r = ring * (i + 1.6);
      const rot = rand() * Math.PI * 2;
      const segs = splitByWeights(Math.PI * 2, it.palette.map((p) => p.weight));
      segs.forEach(([a0, a], k) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, rot + a0, rot + a0 + a + 0.002);
        ctx.closePath();
        ctx.fillStyle = it.palette[k]?.hex ?? INK;
        ctx.fill();
      });
    }
    ctx.beginPath();
    ctx.arc(cx, cy, ring * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
  } else {
    const [cols, rows] = gridDims(items.length, aw, ah);
    const cell = Math.min(aw / cols, ah / rows);
    const gx = x0 + (aw - cell * cols) / 2;
    const gy = y0 + (ah - cell * rows) / 2;
    const pad = cell * 0.06;
    items.forEach((it, i) => {
      const cxl = gx + (i % cols) * cell + pad;
      const cyl = gy + Math.floor(i / cols) * cell + pad;
      let size = cell - pad * 2;
      let ox = cxl;
      let oy = cyl;
      // Nested squares (Albers-style): heaviest colour outside, each next one inset with a seeded drift.
      it.palette.forEach((p, k) => {
        ctx.fillStyle = p.hex;
        ctx.fillRect(ox, oy, size, size);
        if (k === it.palette.length - 1) return;
        const inset = size * (0.12 + 0.06 * rand());
        const drift = (rand() - 0.5) * inset * 0.8;
        ox += inset + drift * 0.3;
        oy += inset * 0.6 + Math.abs(drift);
        size -= inset * 2;
      });
    });
  }

  // Footer typography
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${62 * u}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillText(text.title, x0, H - margin - 85 * u);
  ctx.font = `${30 * u}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillStyle = '#4a4a46';
  ctx.fillText([text.dates, text.elevation].filter(Boolean).join('  ·  '), x0, H - margin - 30 * u);
  ctx.textAlign = 'right';
  ctx.fillText('Tremuloides', W - margin, H - margin - 30 * u);
  ctx.textAlign = 'left';
}
