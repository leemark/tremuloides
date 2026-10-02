/** GPU memory allowed for a frame history (preview or burst). */
export const HISTORY_BUDGET_BYTES = 150 * 1024 * 1024;
export const MAX_FRAMES = 64;

/** Frames a burst needs for a given span (delay range plus the current frame). */
export function burstFrames(span: number): number {
  return Math.min(MAX_FRAMES, Math.max(2, Math.ceil(span) + 2));
}

/** Largest w×h with the source aspect (≤ source, ≤ maxTex) whose `frames` RGBA8 layers fit the budget. */
export function fitHistorySize(
  srcW: number,
  srcH: number,
  frames: number,
  maxTex: number,
  budget: number = HISTORY_BUDGET_BYTES,
): [number, number] {
  if (srcW <= 0 || srcH <= 0) return [1, 1];
  const maxPixels = budget / (4 * Math.max(1, frames));
  let s = Math.min(1, Math.sqrt(maxPixels / (srcW * srcH)), maxTex / Math.max(srcW, srcH));
  s = Math.max(s, 0);
  return [Math.max(1, Math.floor(srcW * s)), Math.max(1, Math.floor(srcH * s))];
}

/** Preview history: historyScale × the lens render size, frames reduced if the budget is tight. */
export function previewHistoryPlan(
  lensW: number,
  lensH: number,
  historyScale: number,
  maxTex: number,
): { width: number; height: number; frames: number } {
  const width = Math.max(1, Math.round(lensW * historyScale));
  const height = Math.max(1, Math.round(lensH * historyScale));
  const frames = Math.max(2, Math.min(MAX_FRAMES, Math.floor(HISTORY_BUDGET_BYTES / (width * height * 4))));
  const [w, h] = fitHistorySize(width, height, frames, maxTex);
  return { width: w, height: h, frames };
}

export interface SlitPlan {
  height: number;
  slitWidth: number;
  /** Width of the strip target. */
  maxWidth: number;
  /** Frames until the strip is full. */
  maxFrames: number;
}

/**
 * Slit-scan strip: full source height (capped at 1920), slits sized so ~240 frames
 * (about 8 s at 30 fps) make a roughly square image, and at most 4096 px (or maxTex) wide.
 */
export function slitPlan(srcW: number, srcH: number, maxTex: number): SlitPlan {
  const height = Math.max(1, Math.min(srcH, 1920, maxTex));
  const slitWidth = Math.max(1, Math.round(height / 240));
  const maxWidth = Math.max(slitWidth, Math.min(4096, maxTex) - (Math.min(4096, maxTex) % slitWidth));
  return { height, slitWidth, maxWidth, maxFrames: Math.floor(maxWidth / slitWidth) };
}

/** Source uv range [x0, x1] for a slit `slitWidth` strip-pixels wide, centred in the frame. */
export function slitSourceRange(srcW: number, srcH: number, stripH: number, slitWidth: number): [number, number] {
  const srcPx = (slitWidth * srcH) / stripH; // keep the strip's pixel aspect square
  const half = srcPx / 2 / srcW;
  return [0.5 - half, 0.5 + half];
}
