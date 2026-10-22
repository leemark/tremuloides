import type { Lens, LensAction, LensActionContext, Params } from '../types';
import { GLAnimator, animationSize } from '../../app/animate';
import { videoSupported } from '../../app/video';
import { planLayers, totalStrokes } from './plan';
import { logEvent } from '../../diagnostics/log';
import { fragment } from '../../gl/kit';
import { resizeTo } from '../../util/canvas';
import { detectFaces } from '../../util/faces';
import COPY from './shaders/copy.frag.glsl?raw';

/** Seconds: the photo, the strokes going down, and the finished painting. */
export const TIMELAPSE = { intro: 1, strokes: 8, outro: 2.5, fps: 20 } as const;

/**
 * "Timelapse": repaints the photo from its original, recording the canvas as the underpainting
 * and each layer of strokes go down, and saves the video to the gallery.
 */
/** How many strokes (or dots) a lens paints for these params at this size; sets the timelapse's pace. */
export type StrokeCount = (params: Params, width: number, height: number) => number;

function flowStrokes(params: Params, w: number, h: number): number {
  return totalStrokes(
    planLayers(w, h, {
      detail: Number(params.detail),
      strokeLength: Number(params.strokeLength),
      strokeWidth: Number(params.strokeWidth),
      layers: Number(params.layers),
    }),
  );
}

export function timelapseAction(
  load: () => Promise<Lens> = async () => (await import('./index')).flowPainterLens,
  strokeCount: StrokeCount = flowStrokes,
): LensAction {
  let busy = false;
  return {
    id: 'timelapse',
    label: 'Timelapse',
    icon: 'film',
    async run(ctx: LensActionContext) {
      if (busy) return;
      if (!videoSupported()) {
        ctx.toast('This browser can’t record video');
        return;
      }
      if (!ctx.capture.originalKey) {
        ctx.toast('Timelapse needs the original photo (turn on Keep originals)');
        return;
      }
      busy = true;
      ctx.setLabel('Painting…');
      let anim: GLAnimator | null = null;
      try {
        const blob = await ctx.source();
        const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        const [w, h] = animationSize(probe.width, probe.height);
        probe.close();
        const bmp = await resizeTo(blob, w, h);
        const faces = await detectFaces(bmp);
        anim = new GLAnimator(w, h, TIMELAPSE.fps);
        const a = anim;
        const input = a.texture(bmp);
        bmp.close();

        // Show the recording as it happens, over the photo.
        a.canvas.className = 'timelapse-live';
        ctx.view.append(a.canvas);
        ctx.onCleanup(() => a.canvas.remove());

        const lens = await load();
        const inst = lens.create(a.kit);
        const params: Params = ctx.capture.params;
        const strokes = strokeCount(params, w, h);
        // Intro: the photo itself.
        const photo = a.kit.createTarget(w, h);
        const copy = a.kit.program(fragment(COPY), 'timelapse.copy');
        a.kit.draw(copy, photo, { textures: { u_input: input } });
        await a.start(photo);
        await a.present(Math.round(TIMELAPSE.intro * TIMELAPSE.fps), photo);
        a.kit.deleteTarget(photo);
        copy.dispose();

        await inst.render(
          {
            input,
            inputWidth: w,
            inputHeight: h,
            width: w,
            height: h,
            params,
            seed: ctx.capture.seed,
            quality: 'final',
            ...(faces.length ? { faces } : {}),
            timelapse: {
              batch: Math.max(1, Math.ceil(strokes / Math.max(1, Math.round(TIMELAPSE.strokes * TIMELAPSE.fps)))),
              frame: async (f) => {
                ctx.setLabel(`${Math.round(f * 100)}%`);
                await a.present(1);
              },
            },
          },
          a.target,
        );
        a.snapshot();
        await a.present(Math.round(TIMELAPSE.outro * TIMELAPSE.fps));
        inst.dispose();
        ctx.setLabel('Saving…');
        const { clip, thumb } = await a.finish();
        const id = await ctx.saveVideo(clip, thumb);
        ctx.toast('Timelapse saved to the gallery');
        ctx.open(id);
      } catch (e) {
        logEvent('error', 'timelapse', 'Timelapse failed', e);
        throw e;
      } finally {
        anim?.canvas.remove();
        anim?.dispose();
        busy = false;
        ctx.setLabel('Timelapse');
      }
    },
  };
}
