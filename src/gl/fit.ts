export type FitMode = 'cover' | 'contain';

/**
 * UV scale for drawing a source of aspect `src` (w/h) into a destination of aspect `dst`.
 * The display shader computes texUV = (screenUV - 0.5) * scale + 0.5.
 */
export function fitScale(src: number, dst: number, mode: FitMode): [number, number] {
  if (!(src > 0) || !(dst > 0)) return [1, 1];
  if (mode === 'cover') return src > dst ? [dst / src, 1] : [1, src / dst];
  return src > dst ? [1, src / dst] : [dst / src, 1];
}

/**
 * Size to render a lens at so that, once fitted into a display of dw×dh, one lens pixel
 * maps to roughly one display pixel × `scale`. Never upsamples beyond the source or maxSize.
 */
export function lensRenderSize(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  mode: FitMode,
  scale: number,
  maxSize: number,
): [number, number] {
  if (sw <= 0 || sh <= 0) return [1, 1];
  const fit = mode === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  let s = Math.min(1, fit * scale);
  const longEdge = Math.max(sw, sh) * s;
  if (longEdge > maxSize) s *= maxSize / longEdge;
  return [Math.max(1, Math.round(sw * s)), Math.max(1, Math.round(sh * s))];
}

/** Output size for a final render: long edge capped at `maxEdge`, aspect preserved. */
export function finalRenderSize(sw: number, sh: number, maxEdge: number): [number, number] {
  const long = Math.max(sw, sh);
  if (long <= maxEdge) return [sw, sh];
  const s = maxEdge / long;
  return [Math.max(1, Math.round(sw * s)), Math.max(1, Math.round(sh * s))];
}
