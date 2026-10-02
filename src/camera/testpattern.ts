import { mulberry32 } from '../util/prng';

/**
 * Procedural autumn scene used when no camera is available (desktop, headless,
 * permission denied) or with ?demo=1: sky, a jagged ridge with snow, dark
 * conifers, and aspen trunks with flickering gold leaves.
 */
export function drawTestPattern(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number, seed = 7): void {
  const rand = mulberry32(seed);
  const t = timeMs / 1000;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#2f6fb8');
  sky.addColorStop(1, '#a9cbe8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 4; i++) {
    const cx = ((rand() * 1.4 - 0.2 + t * 0.01 * (i + 1)) % 1.4) * w;
    const cy = (0.08 + rand() * 0.18) * h;
    const r = (0.04 + rand() * 0.05) * Math.min(w, h);
    for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.arc(cx + j * r * 0.8, cy + Math.sin(j * 2.1) * r * 0.25, r * (0.8 + 0.3 * Math.sin(j)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ridge: sum of seeded sines, with snow above a line
  const ridgeY = (x: number) => {
    const u = x / w;
    return (
      h *
      (0.42 +
        0.08 * Math.sin(u * 7.1 + 1.3) +
        0.05 * Math.sin(u * 17.3 + 0.4) +
        0.025 * Math.sin(u * 41.7 + 2.2) +
        0.012 * Math.sin(u * 97.0))
    );
  };
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 2) ctx.lineTo(x, ridgeY(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  const rock = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7);
  rock.addColorStop(0, '#8b6f68');
  rock.addColorStop(0.5, '#a4412e');
  rock.addColorStop(1, '#5a3a30');
  ctx.fillStyle = rock;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#f3f2ec';
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = ridgeY(x);
    ctx.rect(x, y, 2, Math.max(0, h * 0.37 - y) * 0.9 + 3);
  }
  ctx.fill();
  ctx.restore();

  // Meadow
  ctx.fillStyle = '#6f7d4f';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  // Conifers
  const conifers = 26;
  for (let i = 0; i < conifers; i++) {
    const x = rand() * w;
    const base = h * (0.62 + rand() * 0.12);
    const th = h * (0.12 + rand() * 0.1);
    const tw = th * 0.32;
    ctx.fillStyle = i % 3 === 0 ? '#1f3529' : '#2e4a3b';
    ctx.beginPath();
    ctx.moveTo(x, base - th);
    ctx.lineTo(x - tw / 2, base);
    ctx.lineTo(x + tw / 2, base);
    ctx.closePath();
    ctx.fill();
  }

  // Aspens: white trunks with dark marks and flickering gold leaves
  const aspens = 14;
  const leafR = Math.max(2, Math.min(w, h) * 0.008);
  for (let i = 0; i < aspens; i++) {
    const x = (i + 0.5 + (rand() - 0.5) * 0.6) * (w / aspens);
    const top = h * (0.5 + rand() * 0.1);
    const bottom = h * (0.92 + rand() * 0.06);
    const tw = Math.max(2, w * 0.008);
    ctx.fillStyle = '#ece8df';
    ctx.fillRect(x - tw / 2, top, tw, bottom - top);
    ctx.fillStyle = '#2a2724';
    for (let k = 0; k < 6; k++) ctx.fillRect(x - tw / 2, top + rand() * (bottom - top), tw * (0.5 + rand() * 0.5), 2);
    const leaves = 70;
    for (let k = 0; k < leaves; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * w * 0.05;
      const lx = x + Math.cos(a) * r;
      const ly = top + h * 0.02 + Math.sin(a) * r * 1.3;
      const flicker = 0.5 + 0.5 * Math.sin(t * (6 + rand() * 6) + k);
      const g = Math.round(150 + flicker * 50);
      ctx.fillStyle = `rgb(${Math.round(220 + flicker * 25)},${g},${Math.round(20 + flicker * 30)})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, leafR * (0.6 + flicker * 0.6), leafR, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
