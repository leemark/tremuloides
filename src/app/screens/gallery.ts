import type { App, Screen } from '../app';
import { h, ICONS, iconButton, toast } from '../ui';
import { dayKey, exportFilename, formatDayHeading } from '../../util/format';
import { shareFiles } from '../share';
import type { Capture } from '../../storage/types';
import { logEvent } from '../../diagnostics/log';

export function createGallery(app: App): Screen {
  const s = app.s;
  const urls: string[] = [];
  let captures: Capture[] = [];
  let selecting = false;
  const selected = new Set<string>();

  const grid = h('div', { class: 'gallery-grid' });
  const empty = h('div', { class: 'empty-state', hidden: true }, h('p', { text: 'No photos yet.' }), h('p', { class: 'muted', text: 'Captures and imports appear here.' }));
  const selectBtn = iconButton(ICONS.select, 'Select photos', () => toggleSelect());
  const header = h('header', { class: 'screen-header' }, iconButton(ICONS.back, 'Back', () => app.back()), h('h1', { text: 'Gallery' }), selectBtn);
  const shareSelected = h('button', { class: 'btn btn-primary', text: 'Share', onclick: () => void shareSelection() });
  const selectBar = h(
    'div',
    { class: 'select-bar', hidden: true },
    h('button', { class: 'btn', text: 'Cancel', onclick: () => toggleSelect(false) }),
    shareSelected,
  );
  const el = h('div', { class: 'screen gallery' }, header, h('main', { class: 'gallery-scroll' }, empty, grid), selectBar);

  function toggleSelect(force?: boolean) {
    selecting = force ?? !selecting;
    selected.clear();
    selectBar.hidden = !selecting;
    el.classList.toggle('selecting', selecting);
    for (const t of grid.querySelectorAll('.tile')) t.classList.remove('picked');
    updateShareLabel();
  }

  function updateShareLabel() {
    shareSelected.textContent = selected.size ? `Share ${selected.size}` : 'Share';
    shareSelected.disabled = selected.size === 0;
  }

  async function shareSelection() {
    const files: File[] = [];
    for (const c of captures.filter((c) => selected.has(c.id))) {
      const blob = await s.store.blob(c.outputKey);
      if (blob) files.push(new File([blob], exportFilename(new Date(c.createdAt), c.lensId, c.outputType === 'image/png' ? 'png' : 'jpg'), { type: blob.type }));
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
      const tile = h('button', { class: 'tile', 'aria-label': `Photo from ${new Date(c.createdAt).toLocaleString()}` });
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

  return {
    el,
    mount() {
      void load();
      // Photos still rendering when the gallery opened appear once they're saved.
      unsubscribe = s.queue.onChange((pending) => {
        if (pending === 0 && !selecting) void load();
      });
    },
    unmount() {
      unsubscribe?.();
      for (const u of urls) URL.revokeObjectURL(u);
    },
  };
}
