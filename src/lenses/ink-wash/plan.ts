import { refScale } from '../../gl/kit';
import type { Params } from '../types';

export type Quality = 'fast' | 'balanced' | 'best';

/** Samples per half-axis for the Kuwahara and ink kernels, by quality and render kind. */
const KUWAHARA_SAMPLES: Record<'preview' | 'final', Record<Quality, number>> = {
  preview: { fast: 3, balanced: 4, best: 6 },
  final: { fast: 6, balanced: 6, best: 9 }, // final renders use at least Balanced
};
const INK_TAPS: Record<'preview' | 'final', Record<Quality, number>> = {
  preview: { fast: 3, balanced: 4, best: 5 },
  final: { fast: 5, balanced: 5, best: 7 },
};

export interface InkWashPlan {
  scale: number;
  tensorWidth: number;
  tensorHeight: number;
  /** Tensor smoothing in tensor-target pixels. */
  tensorSigma: number;
  tensorStride: number;
  tensorTaps: number;
  kuwaharaRadius: number;
  kuwaharaSamples: number;
  inkSigma: number;
  inkStride: number;
  inkTaps: number;
  inkThreshold: number;
  flowLength: number;
}

/**
 * Converts params (in reference pixels at a 1080 px short edge) into real-pixel kernel sizes
 * for a render of width×height. Kernels keep the same footprint at any resolution; only the
 * sample density changes with quality, so previews match final renders.
 */
export function planInkWash(width: number, height: number, params: Params, kind: 'preview' | 'final'): InkWashPlan {
  const scale = refScale(width, height);
  const quality = (['fast', 'balanced', 'best'].includes(String(params.quality)) ? params.quality : 'balanced') as Quality;
  const tensorWidth = Math.max(1, Math.ceil(width / 2));
  const tensorHeight = Math.max(1, Math.ceil(height / 2));
  const tensorSigma = Math.max(0.5, (2 * scale) / 2);
  const tensorStride = Math.max(1, (3 * tensorSigma) / 12);
  const tensorTaps = Math.min(16, Math.ceil((3 * tensorSigma) / tensorStride));
  const inkSigma = Math.max(0.5, Number(params.lineWeight) * scale);
  const inkTaps = INK_TAPS[kind][quality];
  const inkStride = Math.max(0.75, (2.5 * 1.6 * inkSigma) / inkTaps);
  const amount = Math.min(1, Math.max(0, Number(params.lineAmount)));
  return {
    scale,
    tensorWidth,
    tensorHeight,
    tensorSigma,
    tensorStride,
    tensorTaps,
    kuwaharaRadius: Math.max(1, Number(params.brush) * scale),
    kuwaharaSamples: KUWAHARA_SAMPLES[kind][quality],
    inkSigma,
    inkStride,
    inkTaps,
    inkThreshold: 0.02 + (0.0015 - 0.02) * amount,
    flowLength: Math.max(2, 4 * scale),
  };
}
