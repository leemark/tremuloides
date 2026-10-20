import { h, ICONS, iconButton } from './ui';
import {
  ASPECTS,
  aspectRatio,
  dragRect,
  fitAspect,
  hitHandle,
  noCrop,
  rotateCrop,
  rotatedSize,
  toNormalized,
  toPixels,
  withAspect,
  type AspectPreset,
  type CropState,
  type Handle,
  type Rect,
  type Size,
} from '../util/crop';

const PAD = 28; // CSS px around the image, so edge handles stay grabbable
const SLOP = 26; // CSS px touch slop for handles

/**
 * Full-screen crop and rotate. `source` is the upright, uncropped photo (any size; it is only
 * displayed). Resolves with the new crop, or null when cancelled. The source is not closed.
 */
export function openCropper(source: ImageBitmap, initial: CropState, initialAspect = 'free'): Promise<{ crop: CropState; aspect: string } | null> {
  return new Promise((resolve) => {
    let crop: CropState = { rect: { ...initial.rect }, quarter: initial.quarter };
    let preset: AspectPreset = ASPECTS.find((a) => a.id === initialAspect) ?? (ASPECTS[0] as AspectPreset);
    let drag: { id: number; handle: Handle; x0: number; y0: number; start: Rect } | null = null;
    let raf = 0;

    const canvas = h('canvas', { class: 'cropper-canvas', 'aria-label': 'Crop area. Drag the corners or edges; drag inside to move.' });
    const ctx = canvas.getContext('2d');
    const chips = h('div', { class: 'lens-chips cropper-aspects', role: 'radiogroup', 'aria-label': 'Aspect ratio' });
    const done = h('button', { class: 'btn btn-primary', html: `${ICONS.check}<span>Done</span>`, onclick: () => finish(true) });
    const el = h(
      'div',
      { class: 'cropper', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crop' },
      h('header', { class: 'screen-header' }, iconButton(ICONS.close, 'Cancel crop', () => finish(false)), h('h1', { text: 'Crop' }), done),
      h('div', { class: 'cropper-stage' }, canvas),
      h(
        'div',
        { class: 'cropper-panel' },
        chips,
        h(
          'div',
          { class: 'cropper-tools' },
          h('button', { class: 'btn', html: `${ICONS.rotate}<span>Rotate</span>`, onclick: rotate }),
          h('button', { class: 'btn btn-ghost', text: 'Reset', onclick: reset }),
        ),
      ),
    );

    const imageSize = (): Size => {
      const [w, hh] = rotatedSize(source.width, source.height, crop.quarter);
      return { w, h: hh };
    };

    /** Display layout: image px → CSS px. */
    function layout() {
      const s = imageSize();
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const scale = Math.max(1e-6, Math.min((cw - 2 * PAD) / s.w, (ch - 2 * PAD) / s.h));
      return { s, scale, ox: (cw - s.w * scale) / 2, oy: (ch - s.h * scale) / 2, cw, ch };
    }

    function draw() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ctx) return;
        const dpr = Math.min(devicePixelRatio || 1, 3);
        const L = layout();
        const bw = Math.round(L.cw * dpr);
        const bh = Math.round(L.ch * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, L.cw, L.ch);
        // Photo, turned.
        const iw = L.s.w * L.scale;
        const ih = L.s.h * L.scale;
        ctx.save();
        ctx.translate(L.ox + iw / 2, L.oy + ih / 2);
        ctx.rotate((crop.quarter * Math.PI) / 2);
        const [dw, dh] = rotatedSize(iw, ih, crop.quarter);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        // Dim outside the crop.
        const r = toPixels(crop.rect, L.s);
        const x = L.ox + r.x * L.scale;
        const y = L.oy + r.y * L.scale;
        const w = r.w * L.scale;
        const hh = r.h * L.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.rect(L.ox, L.oy, iw, ih);
        ctx.rect(x, y, w, hh);
        ctx.fill('evenodd');
        // Thirds grid.
        ctx.strokeStyle = drag ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const t of [1 / 3, 2 / 3]) {
          ctx.moveTo(x + w * t, y);
          ctx.lineTo(x + w * t, y + hh);
          ctx.moveTo(x, y + hh * t);
          ctx.lineTo(x + w, y + hh * t);
        }
        ctx.stroke();
        // Frame and corner brackets.
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, hh);
        ctx.lineWidth = 4;
        ctx.lineCap = 'square';
        const k = Math.min(22, w / 3, hh / 3);
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [
          [x, y, 1, 1],
          [x + w, y, -1, 1],
          [x, y + hh, 1, -1],
          [x + w, y + hh, -1, -1],
        ] as const) {
          ctx.moveTo(cx, cy + sy * k);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + sx * k, cy);
        }
        // Edge ticks.
        ctx.moveTo(x + w / 2 - k / 2, y);
        ctx.lineTo(x + w / 2 + k / 2, y);
        ctx.moveTo(x + w / 2 - k / 2, y + hh);
        ctx.lineTo(x + w / 2 + k / 2, y + hh);
        ctx.moveTo(x, y + hh / 2 - k / 2);
        ctx.lineTo(x, y + hh / 2 + k / 2);
        ctx.moveTo(x + w, y + hh / 2 - k / 2);
        ctx.lineTo(x + w, y + hh / 2 + k / 2);
        ctx.stroke();
        // For headless tests: the crop and where the photo sits on screen.
        el.dataset.crop = JSON.stringify(crop);
        el.dataset.view = JSON.stringify({ ox: L.ox, oy: L.oy, scale: L.scale, w: L.s.w, h: L.s.h });
      });
    }

    function buildChips() {
      chips.replaceChildren(
        ...ASPECTS.map((a) =>
          h('button', {
            class: `chip ${a.id === preset.id ? 'on' : ''}`,
            role: 'radio',
            'aria-checked': String(a.id === preset.id),
            'data-aspect': a.id,
            text: a.label,
            onclick: () => setAspect(a),
          }),
        ),
      );
    }

    function setAspect(a: AspectPreset) {
      preset = a;
      const s = imageSize();
      crop = { ...crop, rect: toNormalized(withAspect(toPixels(crop.rect, s), s, aspectRatio(a, s)), s) };
      buildChips();
      draw();
    }

    function rotate() {
      crop = rotateCrop(crop);
      // A locked shape like 4:5 stays 4:5 on screen, so refit it to the turned photo.
      const s = imageSize();
      const ratio = aspectRatio(preset, s);
      if (ratio !== null) crop = { ...crop, rect: toNormalized(withAspect(toPixels(crop.rect, s), s, ratio), s) };
      draw();
    }

    function reset() {
      crop = noCrop();
      preset = ASPECTS[0] as AspectPreset;
      buildChips();
      draw();
    }

    function toImage(e: PointerEvent, L: ReturnType<typeof layout>): [number, number] {
      const b = canvas.getBoundingClientRect();
      return [(e.clientX - b.left - L.ox) / L.scale, (e.clientY - b.top - L.oy) / L.scale];
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (drag) return;
      const L = layout();
      const [px, py] = toImage(e, L);
      const start = toPixels(crop.rect, L.s);
      const handle = hitHandle(start, px, py, SLOP / L.scale);
      if (!handle) return;
      drag = { id: e.pointerId, handle, x0: px, y0: py, start };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const L = layout();
      const [px, py] = toImage(e, L);
      const ratio = aspectRatio(preset, L.s);
      const min = Math.max(8, 48 / L.scale);
      const next = dragRect(drag.start, drag.handle, px - drag.x0, py - drag.y0, L.s, ratio, Math.min(min, L.s.w / 2, L.s.h / 2));
      crop = { ...crop, rect: toNormalized(next, L.s) };
      draw();
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      draw();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onResize = () => draw();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };

    function finish(ok: boolean) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      el.remove();
      resolve(ok ? { crop, aspect: preset.id } : null);
    }

    // A preset from a previous crop may not match the rect any more after a reset elsewhere; fit if needed.
    if (initial.rect.w === 1 && initial.rect.h === 1 && preset.ratio !== null) {
      const s = imageSize();
      const ratio = aspectRatio(preset, s);
      if (ratio !== null) crop = { ...crop, rect: toNormalized(fitAspect(s, ratio), s) };
    }

    document.body.append(el);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    buildChips();
    draw();
    done.focus();
  });
}
