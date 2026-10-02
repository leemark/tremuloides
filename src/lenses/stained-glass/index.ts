import { COLOR_GLSL, fragment, refScale, type GLKit, type RenderTarget } from '../../gl/kit';
import { hexToRgb01 } from '../params';
import type { Lens, Params, RenderRequest } from '../types';
import { SAMPLE_EDGE, edgeMagnitude, jfaSize, jfaSteps, placeSeeds, seedTexture } from './seeds';
import CODEC from './shaders/seedcodec.glsl?raw';
import JFA from './shaders/jfa.frag.glsl?raw';
import GLASS from './shaders/glass.frag.glsl?raw';
import COPY from './shaders/copy.frag.glsl?raw';

const PREVIEW_JFA_EDGE = 1024;
const FINAL_JFA_EDGE = 2048;
const RESEED_MS = 500; // the live preview re-places seeds at most twice a second

interface Voronoi {
  a: RenderTarget | null;
  b: RenderTarget | null;
  /** Which of a/b holds the finished JFA result. */
  result: RenderTarget | null;
}

export const stainedGlassLens: Lens = {
  id: 'stained-glass',
  name: 'Stained Glass',
  tagline: 'Leaded panes of light, denser at the edges',
  version: 1,
  kind: 'realtime',
  seeded: true,
  params: [
    { id: 'cells', label: 'Cells', type: 'range', min: 200, max: 6000, step: 100, default: 1800 },
    { id: 'attraction', label: 'Edge attraction', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, help: 'Packs smaller panes along edges and detail' },
    { id: 'leadWidth', label: 'Lead width', type: 'range', min: 0.5, max: 6, step: 0.25, default: 2 },
    { id: 'leadColor', label: 'Lead color', type: 'color', default: '#1a1c21' },
    { id: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, help: 'Panes brighter in the middle, darker by the lead' },
    { id: 'texture', label: 'Glass texture', type: 'toggle', default: true },
    { id: 'freeze', label: 'Freeze panes', type: 'toggle', default: false, help: 'Keep the current pane layout while you frame the shot' },
  ],

  create(kit: GLKit) {
    const gl = kit.gl;
    const p = {
      jfa: kit.program(fragment(CODEC, JFA), 'stained-glass.jfa'),
      glass: kit.program(fragment(COLOR_GLSL, CODEC, GLASS), 'stained-glass.glass'),
      copy: kit.program(fragment(COPY), 'stained-glass.copy'),
    };
    let sample: RenderTarget | null = null;
    const preview: Voronoi = { a: null, b: null, result: null };
    const final: Voronoi = { a: null, b: null, result: null };
    let seeds: Float32Array | null = null;
    let seedKey = '';
    let seedValue = -1;
    let lastSeeding = -Infinity;

    function nearestTarget(t: RenderTarget | null, w: number, h: number): RenderTarget {
      if (t && t.width === w && t.height === h) return t;
      kit.deleteTarget(t);
      return kit.createTarget(w, h, 'nearest');
    }

    function computeSeeds(input: WebGLTexture, w: number, h: number, params: Params, seed: number): Float32Array {
      const s = Math.min(1, SAMPLE_EDGE / Math.max(w, h));
      const sw = Math.max(2, Math.round(w * s));
      const sh = Math.max(2, Math.round(h * s));
      if (!sample || sample.width !== sw || sample.height !== sh) {
        kit.deleteTarget(sample);
        sample = kit.createTarget(sw, sh);
      }
      kit.draw(p.copy, sample, { textures: { u_input: input } });
      const px = kit.readPixels(sample);
      return placeSeeds(edgeMagnitude(px, sw, sh), sw, sh, Math.round(Number(params.cells)), Number(params.attraction), seed);
    }

    /** Builds the Voronoi diagram of `pts` on a w×h grid by jump flooding. */
    function buildVoronoi(v: Voronoi, pts: Float32Array, w: number, h: number): RenderTarget {
      v.a = nearestTarget(v.a, w, h);
      v.b = nearestTarget(v.b, w, h);
      gl.bindTexture(gl.TEXTURE_2D, v.a.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, seedTexture(pts, w, h));
      let src = v.a;
      let dst = v.b;
      for (const step of jfaSteps(w, h)) {
        kit.draw(p.jfa, dst, { textures: { u_src: src.tex as WebGLTexture }, uniforms: { u_size: [w, h], u_step: step } });
        [src, dst] = [dst, src];
      }
      v.result = src;
      return src;
    }

    function drawGlass(req: RenderRequest, target: RenderTarget, jfa: RenderTarget) {
      const W = req.width;
      const H = req.height;
      const ref = refScale(W, H);
      const cells = Math.max(1, Number(req.params.cells));
      kit.draw(p.glass, target, {
        textures: { u_input: req.input, u_jfa: jfa.tex as WebGLTexture },
        uniforms: {
          u_outSize: [W, H],
          u_jfaSize: [jfa.width, jfa.height],
          u_leadHalf: Math.max(0.35, (Number(req.params.leadWidth) * ref) / 2),
          u_leadColor: hexToRgb01(String(req.params.leadColor)),
          u_glow: Number(req.params.glow),
          u_texture: req.params.texture === true ? 1 : 0,
          u_cellR: Math.sqrt((W * H) / cells / Math.PI),
          u_ref: ref,
        },
      });
    }

    function freeVoronoi(v: Voronoi) {
      kit.deleteTarget(v.a);
      kit.deleteTarget(v.b);
      v.a = v.b = v.result = null;
    }

    return {
      render(req, target) {
        // Layout key excludes the seed: while frozen, the pane layout survives seed changes
        // (the viewfinder picks a new seed after every shot).
        const key = `${req.params.cells}|${req.params.attraction}`;
        const frozen = req.params.freeze === true && seeds !== null && seedKey === key;
        if (req.quality === 'final') {
          // Frozen: keep the exact pane layout from the viewfinder. Otherwise place seeds from the photo.
          const pts = frozen && seeds ? seeds : computeSeeds(req.input, req.width, req.height, req.params, req.seed);
          const [jw, jh] = jfaSize(req.width, req.height, Math.min(FINAL_JFA_EDGE, kit.maxTextureSize));
          try {
            drawGlass(req, target, buildVoronoi(final, pts, jw, jh));
          } finally {
            freeVoronoi(final);
          }
          return;
        }
        const now = performance.now();
        const [jw, jh] = jfaSize(req.width, req.height, PREVIEW_JFA_EDGE);
        const sizeChanged = !preview.result || preview.result.width !== jw || preview.result.height !== jh;
        const needSeeds = !seeds || seedKey !== key || (!frozen && (seedValue !== req.seed || now - lastSeeding >= RESEED_MS));
        if (needSeeds) {
          seeds = computeSeeds(req.input, req.width, req.height, req.params, req.seed);
          seedKey = key;
          seedValue = req.seed;
          lastSeeding = now;
        }
        if (needSeeds || sizeChanged) buildVoronoi(preview, seeds as Float32Array, jw, jh);
        drawGlass(req, target, preview.result as RenderTarget);
      },
      info() {
        return { seeds: seeds ? seeds.length / 2 : 0, jfa: preview.result ? `${preview.result.width}×${preview.result.height}` : null };
      },
      dispose() {
        freeVoronoi(preview);
        freeVoronoi(final);
        kit.deleteTarget(sample);
        for (const prog of Object.values(p)) prog.dispose();
      },
    };
  },
};
