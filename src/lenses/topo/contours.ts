import { srgbToOklab } from '../../color/oklab';

/** Long edge of the contour grid (vector contours for final renders and SVG). */
export const GRID_EDGE = 1000;

export interface ContourParams {
  levels: number;
  /** Smoothing in reference px (1080 px short edge). */
  smoothing: number;
}

export interface ContourSet {
  width: number;
  height: number;
  levels: number;
  /** Per level index (1…levels−1): polylines as flat [x0, y0, x1, y1, …] in grid px. */
  lines: { level: number; index: boolean; paths: Float32Array[] }[];
}

/** Oklab lightness of RGBA pixels: the "elevation" map. */
export function lightness(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = srgbToOklab([(rgba[i * 4] ?? 0) / 255, (rgba[i * 4 + 1] ?? 0) / 255, (rgba[i * 4 + 2] ?? 0) / 255])[0];
  return out;
}

/** Separable Gaussian blur (σ in px), edge-clamped. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return Float32Array.from(src);
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] = (k[i] ?? 0) / sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += (k[i + r] ?? 0) * (src[y * w + Math.min(w - 1, Math.max(0, x + i))] ?? 0);
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += (k[i + r] ?? 0) * (tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] ?? 0);
      out[y * w + x] = acc;
    }
  }
  return out;
}

/**
 * Marching squares for one iso value, with segments joined into polylines.
 * Points sit on cell edges (linear interpolation); saddles are resolved by the cell centre.
 */
export function isolines(f: Float32Array, w: number, h: number, iso: number): Float32Array[] {
  const H_EDGES = w * h; // vertical-edge ids are offset by this
  const pts = new Map<number, [number, number]>();
  const adj = new Map<number, number[]>();
  const point = (id: number): [number, number] => {
    let p = pts.get(id);
    if (!p) {
      if (id < H_EDGES) {
        const y = Math.floor(id / w);
        const x = id % w;
        const a = f[y * w + x] ?? 0;
        const b = f[y * w + x + 1] ?? 0;
        p = [x + (iso - a) / (b - a || 1e-9), y];
      } else {
        const j = id - H_EDGES;
        const y = Math.floor(j / w);
        const x = j % w;
        const a = f[y * w + x] ?? 0;
        const b = f[(y + 1) * w + x] ?? 0;
        p = [x, y + (iso - a) / (b - a || 1e-9)];
      }
      pts.set(id, p);
    }
    return p;
  };
  const link = (a: number, b: number) => {
    point(a);
    point(b);
    (adj.get(a) ?? adj.set(a, []).get(a))?.push(b);
    (adj.get(b) ?? adj.set(b, []).get(b))?.push(a);
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = f[y * w + x] ?? 0;
      const tr = f[y * w + x + 1] ?? 0;
      const br = f[(y + 1) * w + x + 1] ?? 0;
      const bl = f[(y + 1) * w + x] ?? 0;
      const c = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const top = y * w + x;
      const bottom = (y + 1) * w + x;
      const left = H_EDGES + y * w + x;
      const right = H_EDGES + y * w + x + 1;
      switch (c) {
        case 1: case 14: link(left, bottom); break;
        case 2: case 13: link(bottom, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(top, right); break;
        case 6: case 9: link(top, bottom); break;
        case 7: case 8: link(left, top); break;
        case 5: case 10: {
          const centre = (tl + tr + br + bl) / 4 >= iso;
          if ((c === 5) === centre) {
            link(left, top);
            link(bottom, right);
          } else {
            link(left, bottom);
            link(top, right);
          }
          break;
        }
      }
    }
  }
  // Walk chains: start at ends (degree 1) first, then remaining loops.
  const used = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const out: Float32Array[] = [];
  const walk = (start: number) => {
    const path: number[] = [];
    let cur = start;
    let prev = -1;
    for (;;) {
      const p = point(cur);
      path.push(p[0], p[1]);
      const next = (adj.get(cur) ?? []).find((n) => n !== prev && !used.has(key(cur, n)));
      if (next === undefined) break;
      used.add(key(cur, next));
      prev = cur;
      cur = next;
    }
    if (path.length >= 4) out.push(Float32Array.from(path));
  };
  for (const [id, n] of adj) if (n.length === 1 && !used.has(key(id, n[0] as number))) walk(id);
  for (const [id, n] of adj) for (const m of n) if (!used.has(key(id, m))) walk(id);
  return out;
}

/** Douglas–Peucker simplification of a flat polyline. */
export function simplify(path: Float32Array, tolerance: number): Float32Array {
  const n = path.length / 2;
  if (n < 3) return path;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = path[a * 2] ?? 0;
    const ay = path[a * 2 + 1] ?? 0;
    const bx = path[b * 2] ?? 0;
    const by = path[b * 2 + 1] ?? 0;
    const len = Math.hypot(bx - ax, by - ay);
    let best = -1;
    let bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = path[i * 2] ?? 0;
      const py = path[i * 2 + 1] ?? 0;
      // Closed loops start and end on the same point: measure from that point instead of a line.
      const d = len < 1e-6 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(path[i * 2] ?? 0, path[i * 2 + 1] ?? 0);
  return Float32Array.from(out);
}

/** Specks shorter than this (grid px) are dropped: they plot as dots. */
export const MIN_PATH_PX = 6;

export function pathLength(path: Float32Array): number {
  let len = 0;
  for (let i = 2; i < path.length; i += 2) len += Math.hypot((path[i] ?? 0) - (path[i - 2] ?? 0), (path[i + 1] ?? 0) - (path[i - 1] ?? 0));
  return len;
}

/** Full CPU pipeline: lightness → blur → contours at k/levels (index every 5th) → simplified polylines. */
export function computeContours(rgba: ArrayLike<number>, w: number, h: number, p: ContourParams): ContourSet {
  const ref = Math.min(w, h) / 1080;
  const field = gaussianBlur(lightness(rgba, w, h), w, h, Math.max(0, p.smoothing) * ref);
  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const levels = Math.max(2, Math.round(p.levels));
  const lines: ContourSet['lines'] = [];
  for (let k = 1; k < levels; k++) {
    const iso = k / levels;
    if (iso <= min || iso >= max) continue;
    const paths = isolines(field, w, h, iso)
      .filter((path) => pathLength(path) >= MIN_PATH_PX)
      .map((path) => simplify(path, 0.5));
    if (paths.length) lines.push({ level: k, index: k % 5 === 0, paths });
  }
  return { width: w, height: h, levels, lines };
}

export const STYLES = {
  usgs: { paper: '#f4eedc', line: '#8b5a2b', index: '#6b4220', sky: '#dce9f2' },
  night: { paper: '#1a1c21', line: '#c99a1e', index: '#e9b825', sky: '#20242c' },
  blueprint: { paper: '#1e4a7a', line: '#dbe6f0', index: '#ffffff', sky: '#245485' },
} as const;
export type TopoStyle = keyof typeof STYLES;

/** Plotter-ready SVG: one <g> per level (labelled), strokes only; background in its own layer. */
export function contoursToSvg(set: ContourSet, style: TopoStyle, lineWeight: number, title: string): string {
  const s = STYLES[style] ?? STYLES.usgs;
  const ref = Math.min(set.width, set.height) / 1080;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  const groups = set.lines.map((l) => {
    const d = l.paths
      .map((p) => {
        let str = `M${fmt(p[0] ?? 0)} ${fmt(p[1] ?? 0)}`;
        for (let i = 2; i < p.length; i += 2) str += `L${fmt(p[i] ?? 0)} ${fmt(p[i + 1] ?? 0)}`;
        return str;
      })
      .join('');
    const sw = fmt(lineWeight * ref * (l.index ? 2 : 1));
    return `  <g id="level-${l.level}" inkscape:groupmode="layer" inkscape:label="Level ${l.level}${l.index ? ' (index)' : ''}" data-level="${l.level}"><path d="${d}" fill="none" stroke="${l.index ? s.index : s.line}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });
  const esc = title.replace(/[<&"]/g, '');
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${set.width}" height="${set.height}" viewBox="0 0 ${set.width} ${set.height}">`,
    `  <title>${esc}</title>`,
    `  <g id="background" inkscape:groupmode="layer" inkscape:label="Background (hide for plotting)"><rect width="100%" height="100%" fill="${s.paper}"/></g>`,
    ...groups,
    `</svg>`,
    '',
  ].join('\n');
}
