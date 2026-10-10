import type { App, Screen } from '../app';
import { h, ICONS, iconButton, openSheet, toast, type SheetHandle } from '../ui';
import { batch, planBatch } from '../batch';
import { pickPhotos } from '../import-ui';
import { STILL_LENSES } from '../../lenses/registry';
import { currentLensState, lensStateFor } from '../capture';
import { paramSummary } from '../params-ui';
import { dayKey, exportFilename, formatDayHeading } from '../../util/format';
import { shareFiles } from '../share';
import { withExif } from '../export';
import { extFor } from '../../storage/album';
import { clock, isVideoType } from '../video';
import type { Capture } from '../../storage/types';
import { logEvent } from '../../diagnostics/log';

export function createGallery(app: App, preselect?: string[]): Screen {
  const s = app.s;
  const urls: string[] = [];
  let captures: Capture[] = [];
  let selecting = false;
  const selected = new Set<string>();

  const grid = h('div', { class: 'gallery-grid' });
  const importOpts = { onImported: (ids: string[]) => void load().then(() => selectIds(ids)) };
  const empty = h(
    'div',
    { class: 'empty-state', hidden: true },
    h('p', { text: 'No photos yet.' }),
    h('p', { class: 'muted', text: 'Take one with the camera, or bring in photos already on your phone.' }),
    h('button', { class: 'btn btn-primary', html: `${ICONS.import}<span>Import photos</span>`, onclick: () => pickPhotos(app, importOpts) }),
  );
  const selectBtn = iconButton(ICONS.select, 'Select photos', () => toggleSelect());
  const header = h('header', { class: 'screen-header' }, iconButton(ICONS.back, 'Back', () => app.back()), h('h1', { text: 'Gallery' }), h('button', { class: 'btn btn-small fl-open', html: `${ICONS.log}<span>Field Log</span>`, onclick: () => app.navigate({ name: 'fieldlog' }) }), iconButton(ICONS.import, 'Import photos', () => pickPhotos(app, importOpts)), selectBtn);
  const shareSelected = h('button', { class: 'btn btn-primary', text: 'Share', onclick: () => void shareSelection() });
  const applySelected = h('button', { class: 'btn', text: 'Apply lens', onclick: () => openApply() });
  const selectBar = h(
    'div',
    { class: 'select-bar', hidden: true },
    h('button', { class: 'btn', text: 'Cancel', onclick: () => toggleSelect(false) }),
    applySelected,
    shareSelected,
  );
  const batchText = h('span', { class: 'batch-text' });
  const batchFill = h('div', { class: 'batch-fill' });
  const batchBar = h(
    'div',
    { class: 'batch-bar', hidden: true, role: 'status' },
    h('div', { class: 'batch-track' }, batchFill),
    h('div', { class: 'batch-row' }, batchText, h('button', { class: 'btn btn-small btn-ghost', text: 'Stop', onclick: () => batch.stop() })),
  );
  const el = h('div', { class: 'screen gallery' }, header, h('main', { class: 'gallery-scroll' }, empty, grid), batchBar, selectBar);
  let sheet: SheetHandle | null = null;

  function renderBatch() {
    const st = batch.status;
    batchBar.hidden = !st.running;
    if (!st.running) return;
    batchText.textContent = `${st.lensName}: ${Math.min(st.done + 1, st.total)} of ${st.total}${st.failed ? ` · ${st.failed} failed` : ''}`;
    batchFill.style.width = `${(st.done / Math.max(1, st.total)) * 100}%`;
  }

  /** Pick a lens and re-render every selected photo with that lens's saved settings. */
  function openApply() {
    const plan = planBatch(captures, selected);
    if (!plan.items.length) {
      toast(plan.skippedVideos ? 'Videos can’t be re-rendered. Select photos.' : 'Select some photos first');
      return;
    }
    if (batch.status.running) {
      toast('Already rendering a batch');
      return;
    }
    sheet?.close();
    const current = currentLensState(s).lens.id;
    let choice = STILL_LENSES.some((l) => l.id === current) ? current : (STILL_LENSES[0]?.id ?? 'ink-wash');
    const summary = h('p', { class: 'muted small' });
    const list = h('div', { class: 'lens-list' });
    const go = h('button', { class: 'btn btn-primary btn-block' });
    const renderChoice = () => {
      const { lens, params } = lensStateFor(s, choice);
      for (const b of list.querySelectorAll<HTMLButtonElement>('.lens-item')) b.classList.toggle('on', b.dataset.id === choice);
      summary.textContent = lens.params.length ? `Settings: ${paramSummary(lens.params, params)}` : '';
      go.textContent = `Render ${plan.items.length} photo${plan.items.length === 1 ? '' : 's'} with ${lens.name}`;
    };
    for (const l of STILL_LENSES) {
      if (l.id === 'original') continue;
      const b = h('button', { class: 'lens-item', 'data-id': l.id, onclick: () => { choice = l.id; renderChoice(); } }, h('span', { class: 'lens-item-name', text: l.name }), h('span', { class: 'lens-item-tagline', text: l.tagline }));
      list.append(b);
    }
    go.addEventListener('click', () => {
      const { lens, params } = lensStateFor(s, choice);
      sheet?.close();
      toggleSelect(false);
      toast(`Rendering ${plan.items.length} with ${lens.name}. New versions appear as they finish.`);
      void batch.run(s, plan.items, lens, params).then((st) => {
        const made = st.done - st.failed;
        toast(`${lens.name}: ${made} new photo${made === 1 ? '' : 's'}${st.failed ? `, ${st.failed} failed` : ''}${st.done < st.total ? ' (stopped)' : ''}`);
      });
    });
    const notes: string[] = [];
    if (plan.skippedVideos) notes.push(`${plan.skippedVideos} video${plan.skippedVideos === 1 ? '' : 's'} skipped.`);
    if (plan.withoutOriginal) notes.push(`${plan.withoutOriginal} without an original will use the rendered image.`);
    const body = h(
      'div',
      { class: 'apply-sheet' },
      h('p', { class: 'muted small', text: `Each photo is rendered again from its original. The new versions are added to the gallery and nothing is replaced.${notes.length ? ` ${notes.join(' ')}` : ''}` }),
      list,
      summary,
      h('p', { class: 'muted small', text: 'Uses each lens’s current settings. Change them in the viewfinder first if you like.' }),
      go,
    );
    renderChoice();
    sheet = openSheet(`Apply a lens to ${plan.items.length}`, body, { onClose: () => (sheet = null) });
  }

  function toggleSelect(force?: boolean) {
    selecting = force ?? !selecting;
    selected.clear();
    selectBar.hidden = !selecting;
    el.classList.toggle('selecting', selecting);
    for (const t of grid.querySelectorAll('.tile')) t.classList.remove('picked');
    updateShareLabel();
  }

  /** Enters select mode with these photos picked (after a multi-photo import). */
  function selectIds(ids: string[]) {
    toggleSelect(true);
    for (const id of ids) selected.add(id);
    for (const t of grid.querySelectorAll<HTMLElement>('.tile')) if (t.dataset.id && selected.has(t.dataset.id)) t.classList.add('picked');
    updateShareLabel();
    grid.querySelector('.tile.picked')?.scrollIntoView({ block: 'center' });
  }

  function updateShareLabel() {
    shareSelected.textContent = selected.size ? `Share ${selected.size}` : 'Share';
    shareSelected.disabled = selected.size === 0;
    applySelected.disabled = selected.size === 0;
  }

  async function shareSelection() {
    const files: File[] = [];
    for (const c of captures.filter((c) => selected.has(c.id))) {
      const raw = await s.store.blob(c.outputKey);
      const blob = raw ? await withExif(raw, c, 'output') : undefined;
      if (blob) files.push(new File([blob], exportFilename(new Date(c.createdAt), c.lensId, extFor(c.outputType)), { type: blob.type || c.outputType }));
    }
    const result = await shareFiles(files);
    if (result === 'downloaded') toast(`Saved ${files.length} file${files.length === 1 ? '' : 's'} to Downloads`);
    toggleSelect(false);
  }

  async function load() {
    try {
      captures = await s.store.list();
    } catch (e) {
      logEvent('error', 'gallery', 'Could not read captures', e);
      toast('Couldn’t read the gallery.');
      return;
    }
    for (const u of urls.splice(0)) URL.revokeObjectURL(u);
    grid.replaceChildren();
    empty.hidden = captures.length > 0;
    selectBtn.hidden = captures.length === 0;
    let currentDay = '';
    let section: HTMLElement | null = null;
    for (const c of captures) {
      const day = dayKey(c.createdAt);
      if (day !== currentDay) {
        currentDay = day;
        section = h('div', { class: 'tiles' });
        grid.append(h('h2', { class: 'day-heading', text: formatDayHeading(day) }), section);
      }
      const clip = isVideoType(c.outputType);
      const tile = h('button', { class: `tile${clip ? ' tile-video' : ''}`, 'data-id': c.id, 'aria-label': `${clip ? 'Video' : 'Photo'} from ${new Date(c.createdAt).toLocaleString()}` });
      if (clip) tile.append(h('span', { class: 'tile-badge', text: c.durationMs ? `▶ ${clock(Math.round(c.durationMs / 1000))}` : '▶' }));
      tile.addEventListener('click', () => {
        if (selecting) {
          if (selected.has(c.id)) selected.delete(c.id);
          else selected.add(c.id);
          tile.classList.toggle('picked', selected.has(c.id));
          updateShareLabel();
        } else {
          app.navigate({ name: 'detail', id: c.id });
        }
      });
      section?.append(tile);
      void s.store.blob(c.thumbKey).then((b) => {
        if (!b) return;
        const url = URL.createObjectURL(b);
        urls.push(url);
        tile.style.backgroundImage = `url("${url}")`;
      });
    }
  }

  let unsubscribe: (() => void) | null = null;
  let offBatchRef: (() => void) | null = null;

  return {
    el,
    mount() {
      void load().then(() => {
        if (preselect?.length) selectIds(preselect);
      });
      renderBatch();
      offBatchRef = batch.onChange(() => renderBatch());
      // Photos still rendering when the gallery opened appear once they're saved.
      unsubscribe = s.queue.onChange((pending) => {
        if (pending === 0 && !selecting) void load();
      });
    },
    unmount() {
      unsubscribe?.();
      sheet?.close();
      offBatchRef?.();
      for (const u of urls) URL.revokeObjectURL(u);
    },
  };
}
