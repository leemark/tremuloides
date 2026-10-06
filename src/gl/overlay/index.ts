import { COLOR_GLSL, fragment, refScale, type GLKit, type RenderTarget } from '../kit';
import FIELD from './field.frag.glsl?raw';
import BLUR3 from './blur3.frag.glsl?raw';
import OVERLAY from './overlay.frag.glsl?raw';

export type OverlayKind = 'none' | 'ink' | 'contours';
export interface OverlayConfig {
  kind: OverlayKind;
  /** 0–1 line opacity. */
  strength: number;
}

export const OVERLAY_KINDS: { value: OverlayKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'ink', label: 'Ink lines' },
  { value: 'contours', label: 'Contours' },
];

export function overlayActive(o: OverlayConfig | null | undefined): o is OverlayConfig {
  return !!o && (o.kind === 'ink' || o.kind === 'contours') && o.strength > 0;
}

export function sanitizeOverlay(o: unknown): OverlayConfig {
  const x = (o ?? {}) as Partial<OverlayConfig>;
  const kind: OverlayKind = x.kind === 'ink' || x.kind === 'contours' ? x.kind : 'none';
  const strength = typeof x.strength === 'number' && Number.isFinite(x.strength) ? Math.min(1, Math.max(0, x.strength)) : 0.8;
  return { kind, strength };
}

export function describeOverlay(o: OverlayConfig | null | undefined): string | null {
  if (!overlayActive(o)) return null;
  return `${o.kind === 'ink' ? 'Ink lines' : 'Contours'} ${Math.round(o.strength * 100)}%`;
}

/** Field resolution caps (long edge): lines stay crisp, blur stays affordable at 4K. */
const FIELD_EDGE = { preview: 1280, final: 2048 } as const;
/** Reference-px sigmas: ink DoG pair and contour smoothing (as Topo's default). */
const SIGMA = { ink: 1.1, inkK: 1.6, contours: 8 } as const;

/** Ink-line or contour overlay drawn over any lens (src/gl/overlay). */
export class Overlay {
  private readonly field;
  private readonly blur;
  private readonly draw;
  private a: RenderTarget | null = null;
  private b: RenderTarget | null = null;

  constructor(private readonly kit: GLKit) {
    this.field = kit.program(fragment(COLOR_GLSL, FIELD), 'overlay.field');
    this.blur = kit.program(fragment(BLUR3), 'overlay.blur');
    this.draw = kit.program(fragment(OVERLAY), 'overlay.draw');
  }

  /** Draws `base` (lens output) plus lines derived from `input` into `out` (all image space, same size as out). */
  apply(base: WebGLTexture, input: WebGLTexture, out: RenderTarget, cfg: OverlayConfig, quality: 'preview' | 'final'): void {
    const W = out.width;
    const H = out.height;
    const s = Math.min(1, FIELD_EDGE[quality] / Math.max(W, H));
    const fw = Math.max(2, Math.round(W * s));
    const fh = Math.max(2, Math.round(H * s));
    this.a = this.kit.ensureTarget(this.a, fw, fh, 'rgba16f');
    this.b = this.kit.ensureTarget(this.b, fw, fh, 'rgba16f');
    const fref = refScale(fw, fh);
    const sig = [SIGMA.ink * fref, SIGMA.ink * SIGMA.inkK * fref, SIGMA.contours * fref];
    this.kit.draw(this.field, this.a, { textures: { u_input: input } });
    this.kit.draw(this.blur, this.b, { textures: { u_src: this.a.tex as WebGLTexture }, uniforms: { u_dir: [1 / fw, 0], u_sigma: sig } });
    this.kit.draw(this.blur, this.a, { textures: { u_src: this.b.tex as WebGLTexture }, uniforms: { u_dir: [0, 1 / fh], u_sigma: sig } });
    const ref = refScale(W, H);
    this.kit.draw(this.draw, out, {
      textures: { u_base: base, u_field: this.a.tex as WebGLTexture },
      uniforms: {
        u_strength: cfg.strength,
        u_ink: [0.102, 0.11, 0.129],
        u_phi: 45,
        u_levels: 20,
        u_lineHalf: Math.max(0.5, (1.1 * ref) / 2),
      },
      ints: { u_kind: cfg.kind === 'ink' ? 1 : 2 },
    });
    if (quality === 'final') this.release();
  }

  release(): void {
    this.kit.deleteTarget(this.a);
    this.kit.deleteTarget(this.b);
    this.a = this.b = null;
  }

  dispose(): void {
    this.release();
    this.field.dispose();
    this.blur.dispose();
    this.draw.dispose();
  }
}
