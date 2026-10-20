import type { App, EditorInput, Screen } from '../app';
import { h, ICONS, iconButton, toast } from '../ui';
import { DEFAULT_LENS_ID, STILL_LENSES } from '../../lenses/registry';
import { defaultParams } from '../../lenses/params';
import { currentOverlay, lensStateFor, processAndSave } from '../capture';
import { sanitizeOverlay } from '../../gl/overlay';
import { overlayControls, paramControls, presetBar } from '../params-ui';
import { finalRenderSize } from '../../gl/fit';
import { randomSeed } from '../../util/prng';
import { logEvent, errorMessage } from '../../diagnostics/log';
import { bitmapToJpeg, cropBitmap, resizeTo } from '../../util/canvas';
import { isNoCrop, noCrop, type CropState } from '../../util/crop';
import { openCropper } from '../crop-ui';
import { photoMeta } from '../import';
import type { Lens, Params } from '../../lenses/types';

/** Applies a lens to a still image (imports and re-edits) and saves a new capture. */
export function createEditor(app: App, input: EditorInput): Screen {
  const s = app.s;
  const renderer = s.renderer;
  const requested = input.lensId ?? s.settings.get().currentLens;
  const stillOk = STILL_LENSES.some((l) => l.id === requested);
  let { lens, params } = lensStateFor(s, stillOk ? requested : DEFAULT_LENS_ID, stillOk ? input.params : undefined);
  let seed = input.seed ?? randomSeed();
  let overlay = input.overlay ? sanitizeOverlay(input.overlay) : currentOverlay(s);
  let preview: ImageBitmap | null = null;
  /** Uncropped, upright, preview-sized photo shown in the crop screen. */
  let cropSource: ImageBitmap | null = null;
  let crop: CropState = noCrop();
  let cropAspect = 'free';
  let comparing = false;
  let raf = 0;
  let saving = false;
  let alive = true;

  const stage = h('div', { class: 'editor-stage' });
  const compareBadge = h('div', { class: 'compare-badge', text: 'Original', hidden: true });
  const status = h('div', { class: 'editor-status', text: 'Loading…' });
  stage.append(compareBadge, status);

  const lensRow = h('div', { class: 'lens-chips', role: 'radiogroup', 'aria-label': 'Lens' });
  const paramsHost = h('div', { class: 'editor-params' });
  const saveBtn = h('button', { class: 'btn btn-primary btn-block', text: 'Render & save', onclick: () => void save() });
  const seedBtn = h('button', {
    class: 'btn',
    html: `${ICONS.dice}<span>New seed</span>`,
    onclick: () => {
      seed = randomSeed();
      redraw();
    },
  });
  const panel = h(
    'div',
    { class: 'editor-panel' },
    h('div', { class: 'editor-scroll' }, lensRow, paramsHost),
    h('div', { class: 'editor-actions' }, seedBtn, saveBtn),
  );

  const title = input.source === 'import' ? 'Import' : 'Re-edit';
  const cropBtn = h('button', { class: 'btn btn-small btn-ghost crop-btn', html: `${ICONS.crop}<span>Crop</span>`, disabled: true, onclick: () => void editCrop() });
  const header = h('header', { class: 'screen-header' }, iconButton(ICONS.back, 'Back', () => app.back()), h('h1', { text: title }), cropBtn);
  const el = h('div', { class: 'screen editor' }, header, stage, panel);

  function buildLensChips() {
    lensRow.replaceChildren(
      ...STILL_LENSES.map((l) =>
        h('button', {
          class: `chip ${l.id === lens.id ? 'on' : ''}`,
          role: 'radio',
          'aria-checked': String(l.id === lens.id),
          text: l.name,
          onclick: () => selectLens(l),
        }),
      ),
    );
  }

  function buildParams() {
    const bar = presetBar(s.presets, lens, () => params, (next) => {
      params = next;
      buildParams();
      redraw();
    });
    paramsHost.replaceChildren(
      bar,
      paramControls(lens.params, params, (next) => {
        params = next;
        bar.refresh();
        redraw();
      }),
    );
    if (lens.params.length) {
      paramsHost.append(
        h('button', {
            class: 'btn btn-small btn-ghost',
            text: 'Reset settings',
            onclick: () => {
              params = defaultParams(lens.params);
              buildParams();
              redraw();
            },
          }),
      );
    }
    paramsHost.append(
      h('h3', { class: 'sheet-subhead', text: 'Overlay (any lens)' }),
      overlayControls(overlay, (next) => {
        overlay = next;
        redraw();
      }),
    );
    seedBtn.hidden = !lens.seeded;
  }

  function selectLens(l: Lens) {
    ({ lens, params } = lensStateFor(s, l.id));
    buildLensChips();
    buildParams();
    renderer?.trimInstances([lens.id]);
    redraw();
  }

  function redraw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!renderer || !preview || !alive) return;
      try {
        renderer.drawPreview({ lens, params, seed, fit: 'contain', showOriginal: comparing, overlay });
      } catch (e) {
        logEvent('error', 'lens', `Editor preview failed for ${lens.id}`, e);
        status.textContent = `${lens.name} failed to render.`;
        status.hidden = false;
      }
    });
  }

  /** Preview-sized bitmap of the photo with the current crop applied. */
  async function makePreview(full: ImageBitmap): Promise<ImageBitmap> {
    if (!renderer) throw new Error('Renderer unavailable');
    const cropped = isNoCrop(crop) ? full : await cropBitmap(full, crop);
    const long = Math.min(renderer.maxTextureSize, Math.round(Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2)), 2048);
    const [w, hgt] = finalRenderSize(cropped.width, cropped.height, long);
    if (w === cropped.width && hgt === cropped.height) return cropped;
    const out = await resizeTo(cropped, w, hgt);
    if (cropped !== full) cropped.close();
    return out;
  }

  async function loadPreview() {
    if (!renderer) {
      status.textContent = `Lenses can’t run here: ${s.rendererError ?? 'WebGL2 unavailable'}.`;
      saveBtn.disabled = true;
      return;
    }
    try {
      const full = await createImageBitmap(input.blob, { imageOrientation: 'from-image' });
      preview = await makePreview(full);
      // The crop screen shows the whole photo at preview size.
      cropSource = preview === full ? await createImageBitmap(full) : await resizeTo(full, preview.width, preview.height);
      if (preview !== full) full.close();
      if (!alive) return;
      renderer.setInput(preview, preview.width, preview.height);
      status.hidden = true;
      cropBtn.disabled = false;
      redraw();
    } catch (e) {
      logEvent('error', 'editor', 'Could not open image', e);
      status.textContent = input.heic
        ? 'This is a HEIC photo, which this browser can’t open. Share it from your gallery as JPEG, or turn off “High efficiency pictures” in the camera settings.'
        : 'Couldn’t open that image.';
      saveBtn.disabled = true;
    }
  }

  async function editCrop() {
    if (!cropSource || !renderer || saving) return;
    const result = await openCropper(cropSource, crop, cropAspect);
    if (!result || !alive) return;
    crop = result.crop;
    cropAspect = result.aspect;
    cropBtn.classList.toggle('on', !isNoCrop(crop));
    const label = cropBtn.querySelector('span');
    if (label) label.textContent = isNoCrop(crop) ? 'Crop' : 'Cropped';
    status.textContent = 'Cropping…';
    status.hidden = false;
    try {
      const full = await createImageBitmap(input.blob, { imageOrientation: 'from-image' });
      const next = await makePreview(full);
      if (next !== full) full.close();
      if (!alive) {
        next.close();
        return;
      }
      preview?.close();
      preview = next;
      renderer.setInput(preview, preview.width, preview.height);
      status.hidden = true;
      logEvent('info', 'editor', `Crop ${preview.width}×${preview.height} preview, quarter ${crop.quarter}`);
      redraw();
    } catch (e) {
      logEvent('error', 'editor', 'Crop failed', e);
      status.textContent = `Crop failed: ${errorMessage(e)}`;
    }
  }

  async function save() {
    void s.album.ensurePermission();
    if (saving || !renderer) return;
    saving = true;
    saveBtn.disabled = true;
    cropBtn.disabled = true;
    saveBtn.textContent = 'Rendering…';
    const stopProgress = s.busy.onProgress((f) => {
      if (f !== null) saveBtn.textContent = `Painting… ${Math.round(f * 100)}%`;
    });
    try {
      const full = await createImageBitmap(input.blob, { imageOrientation: 'from-image' });
      let bitmap = full;
      let originalBlob: Blob = input.blob;
      if (!isNoCrop(crop)) {
        try {
          bitmap = await cropBitmap(full, crop);
        } finally {
          full.close();
        }
        // The kept original is the cropped photo, so Compare and later re-edits line up.
        if (s.settings.get().keepOriginals) originalBlob = await bitmapToJpeg(bitmap, 0.95);
      }
      // A single imported photo keeps its own date and location, like a multi-photo import.
      const meta = input.source === 'import' ? await photoMeta(input.blob) : null;
      const geo = meta ? meta.geo : input.parent?.geo;
      const capture = await processAndSave(s, {
        overlay,
        bitmap,
        originalBlob,
        lens,
        params: { ...params } as Params,
        seed,
        source: input.source,
        method: input.source === 'import' ? 'file' : input.parent?.captureMethod,
        ...(input.parent ? { parentId: input.parent.id } : {}),
        ...(geo ? { geo } : {}),
        ...(meta ? { createdAt: meta.date.toISOString() } : {}),
      });
      if (input.source === 'import') s.settings.setLensParams(lens.id, params);
      void s.album.sync();
      toast('Saved to gallery');
      if (alive) app.replace({ name: 'detail', id: capture.id });
    } catch (e) {
      logEvent('error', 'editor', 'Render failed', e);
      toast(`Render failed: ${errorMessage(e)}`);
      saveBtn.disabled = false;
      cropBtn.disabled = false;
      saveBtn.textContent = 'Render & save';
    } finally {
      stopProgress();
      saving = false;
    }
  }

  // Hold to compare
  let holdTimer = 0;
  stage.addEventListener('pointerdown', () => {
    holdTimer = window.setTimeout(() => {
      comparing = true;
      compareBadge.hidden = false;
      redraw();
    }, 180);
  });
  const release = () => {
    clearTimeout(holdTimer);
    if (comparing) {
      comparing = false;
      compareBadge.hidden = true;
      redraw();
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', release);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  const onResize = () => redraw();

  return {
    el,
    mount() {
      buildLensChips();
      buildParams();
      if (renderer) stage.prepend(renderer.canvas);
      window.addEventListener('resize', onResize);
      void loadPreview();
    },
    unmount() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      preview?.close();
      cropSource?.close();
    },
  };
}
