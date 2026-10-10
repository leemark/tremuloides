import type { App } from './app';
import type { Params } from '../lenses/types';
import { h, toast } from './ui';
import { importPhotos, importSummary, isHeic } from './import';

/**
 * Opens the phone's photo picker (multi-select). One photo → straight into the editor with the
 * current lens. Several → added to the gallery as originals, then shown selected so Apply lens
 * is one tap away. `onImported` lets the gallery refresh in place instead of navigating.
 */
export function pickPhotos(app: App, opts: { lensId?: string; params?: Params; onImported?: (ids: string[]) => void } = {}): void {
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.remove();
    if (files.length) void handleFiles(app, files, opts);
  });
  document.body.append(input);
  input.click();
}

export async function handleFiles(app: App, files: File[], opts: { lensId?: string; params?: Params; onImported?: (ids: string[]) => void } = {}): Promise<void> {
  if (files.length === 1) {
    const f = files[0] as File;
    app.navigate({ name: 'editor', input: { blob: f, source: 'import', ...(opts.lensId ? { lensId: opts.lensId } : {}), ...(opts.params ? { params: opts.params } : {}), ...(isHeic(f) ? { heic: true } : {}) } });
    return;
  }
  const pill = h('div', { class: 'import-status', role: 'status', text: `Importing 0 of ${files.length}…` });
  document.body.append(pill);
  try {
    const r = await importPhotos(app.s, files, (done, total) => {
      pill.textContent = `Importing ${Math.min(done + 1, total)} of ${total}…`;
    });
    toast(importSummary(r), { duration: r.failed.length ? 6000 : 3200 });
    const ids = r.imported.map((c) => c.id);
    if (!ids.length) return;
    if (opts.onImported) opts.onImported(ids);
    else app.navigate({ name: 'gallery', select: ids });
  } finally {
    pill.remove();
  }
}
