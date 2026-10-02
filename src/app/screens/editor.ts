import type { App, EditorInput, Screen } from '../app';
import { h, ICONS, iconButton, toast } from '../ui';
import { DEFAULT_LENS_ID, STILL_LENSES } from '../../lenses/registry';
import { defaultParams } from '../../lenses/params';
import { lensStateFor, processAndSave } from '../capture';
import { paramControls } from '../params-ui';
import { finalRenderSize } from '../../gl/fit';
import { randomSeed } from '../../util/prng';
import { logEvent, errorMessage } from '../../diagnostics/log';
import type { Lens, Params } from '../../lenses/types';

/** Applies a lens to a still image (imports and re-edits) and saves a new capture. */
export function createEditor(app: App, input: EditorInput): Screen {
  const s = app.s;
  const renderer = s.renderer;
  const requested = input.lensId ?? s.settings.get().currentLens;
  const stillOk = STILL_LENSES.some((l) => l.id === requested);
  let { lens, params } = lensStateFor(s, stillOk ? requested : DEFAULT_LENS_ID, stillOk ? input.params : undefined);
  let seed = input.seed ?? randomSeed();
  let preview: ImageBitmap | null = null;
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
  const header = h('header', { class: 'screen-header' }, iconButton(ICONS.back, 'Back', () => app.back()), h('h1', { text: title }));
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
    paramsHost.replaceChildren(
      paramControls(lens.params, params, (next) => {
        params = next;
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
        renderer.drawPreview({ lens, params, seed, fit: 'contain', showOriginal: comparing });
      } catch (e) {
        logEvent('error', 'lens', `Editor preview failed for ${lens.id}`, e);
        status.textContent = `${lens.name} failed to render.`;
        status.hidden = false;
      }
    });
  }

  async function loadPreview() {
    if (!renderer) {
      status.textContent = `Lenses can’t run here: ${s.rendererError ?? 'WebGL2 unavailable'}.`;
      saveBtn.disabled = true;
      return;
    }
    try {
      const full = await createImageBitmap(input.blob, { imageOrientation: 'from-image' });
      const long = Math.min(renderer.maxTextureSize, Math.round(Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2)), 2048);
      const [w, hgt] = finalRenderSize(full.width, full.height, long);
      preview = w === full.width ? full : await createImageBitmap(full, { resizeWidth: w, resizeHeight: hgt, resizeQuality: 'high' });
      if (preview !== full) full.close();
      if (!alive) return;
      renderer.setInput(preview, preview.width, preview.height);
      status.hidden = true;
      redraw();
    } catch (e) {
      logEvent('error', 'editor', 'Could not open image', e);
      status.textContent = 'Couldn’t open that image.';
      saveBtn.disabled = true;
    }
  }

  async function save() {
    if (saving || !renderer) return;
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Rendering…';
    try {
      const bitmap = await createImageBitmap(input.blob, { imageOrientation: 'from-image' });
      const capture = await processAndSave(s, {
        bitmap,
        originalBlob: input.blob,
        lens,
        params: { ...params } as Params,
        seed,
        source: input.source,
        method: input.source === 'import' ? 'file' : input.parent?.captureMethod,
        ...(input.parent ? { parentId: input.parent.id } : {}),
        ...(input.parent?.geo ? { geo: input.parent.geo } : {}),
      });
      if (input.source === 'import') s.settings.setLensParams(lens.id, params);
      toast('Saved to gallery');
      if (alive) app.replace({ name: 'detail', id: capture.id });
    } catch (e) {
      logEvent('error', 'editor', 'Render failed', e);
      toast(`Render failed: ${errorMessage(e)}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Render & save';
    } finally {
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
    },
  };
}
