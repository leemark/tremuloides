import type { App, Screen } from '../app';
import { confirmDialog, formatDateTime, h, ICONS, openSheet, toast, type SheetHandle } from '../ui';
import { getLens, lensExists } from '../../lenses/registry';
import { sanitizeParams } from '../../lenses/params';
import { paramSummary } from '../params-ui';
import { exportFilename, metersToFeet } from '../../util/format';
import { downloadBlob, shareFiles } from '../share';
import { extFor } from '../../storage/album';
import { withExif } from '../export';
import { clock, isVideoType, videoSupported } from '../video';
import { makeRevealVideo, makeSideBySide } from '../compare';
import { processAndSave, saveClip } from '../capture';
import { randomSeed } from '../../util/prng';
import type { Capture } from '../../storage/types';
import { errorMessage, logEvent } from '../../diagnostics/log';

export function createDetail(app: App, id: string): Screen {
  const s = app.s;
  const urls: string[] = [];
  const cleanups: (() => void)[] = [];
  let capture: Capture | undefined;
  let outputUrl = '';
  let originalUrl = '';

  const img = h('img', { class: 'detail-img', alt: '' });
  const compareBadge = h('div', { class: 'compare-badge', text: 'Original', hidden: true });
  const view = h('div', { class: 'detail-view' }, img, compareBadge);
  const info = h('div', { class: 'detail-info' });
  const actions = h('div', { class: 'detail-actions' });
  const title = h('h1', { text: 'Photo' });
  const header = h(
    'header',
    { class: 'screen-header' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', html: ICONS.back, onclick: () => app.back() }),
    title,
  );
  const el = h('div', { class: 'screen detail' }, header, view, h('div', { class: 'detail-panel' }, actions, info));

  function filename(c: Capture) {
    return exportFilename(new Date(c.createdAt), c.lensId, extFor(c.outputType));
  }

  async function outputFile(c: Capture): Promise<File | null> {
    const blob = await s.store.blob(c.outputKey);
    if (!blob) return null;
    const tagged = await withExif(blob, c, 'output');
    return new File([tagged], filename(c), { type: tagged.type || blob.type });
  }

  function action(icon: string, label: string, run: () => void | Promise<void>, cls = '') {
    return h('button', { class: `action ${cls}`.trim(), html: `${icon}<span>${label}</span>`, onclick: () => void run() });
  }

  function infoRow(label: string, value: string) {
    return h('div', { class: 'info-row' }, h('dt', { text: label }), h('dd', { text: value }));
  }

  async function load() {
    capture = await s.store.get(id);
    if (!capture) {
      info.replaceChildren(h('p', { text: 'This photo no longer exists.' }));
      return;
    }
    const c = capture;
    const isClip = isVideoType(c.outputType);
    if (isClip) title.textContent = 'Video';
    const out = await s.store.blob(c.outputKey);
    if (out) {
      outputUrl = URL.createObjectURL(out);
      urls.push(outputUrl);
      if (isClip) {
        const video = h('video', { class: 'detail-img detail-video', controls: true, loop: true, playsinline: true, autoplay: true, muted: true });
        video.muted = true; // autoplay needs muted; tap the speaker in the controls for sound
        video.src = outputUrl;
        img.replaceWith(video);
        cleanups.push(() => {
          video.pause();
          video.removeAttribute('src');
          video.load();
        });
      } else img.src = outputUrl;
    }
    const orig = await s.store.blob(c.originalKey);
    if (orig) {
      originalUrl = URL.createObjectURL(orig);
      urls.push(originalUrl);
    }

    const known = lensExists(c.lensId);
    const lens = getLens(c.lensId);
    const rows = h('dl', { class: 'info-list' });
    rows.append(
      infoRow('Taken', formatDateTime(c.createdAt)),
      infoRow('Lens', known ? `${lens.name} (v${c.lensVersion})` : `${c.lensId} (not in this version)`),
    );
    if (known && lens.params.length) rows.append(infoRow('Settings', paramSummary(lens.params, c.params)));
    rows.append(infoRow('Size', `${c.width} × ${c.height}`));
    if (isClip && c.durationMs) rows.append(infoRow('Length', `${clock(Math.round(c.durationMs / 1000))} · ${c.outputType.replace('video/', '').toUpperCase()}`));
    if (c.geo) {
      const alt = c.geo.altitude !== null ? ` · ${Math.round(metersToFeet(c.geo.altitude)).toLocaleString()} ft (${Math.round(c.geo.altitude)} m)` : '';
      rows.append(infoRow('Location', `${c.geo.lat.toFixed(5)}, ${c.geo.lon.toFixed(5)}${alt}`));
    }
    const method = { imagecapture: 'Camera photo', 'video-frame': 'Camera (video frame)', file: 'Imported file', 'test-pattern': 'Demo scene', burst: 'Burst (Quake)', 'slit-scan': 'Slit-scan (Quake)', 'video-clip': 'Video clip' }[c.captureMethod ?? 'file'];
    rows.append(infoRow('Source', `${method}${c.source === 'derived' ? ' · re-edit' : ''}`));
    if (c.albumSavedAt) rows.append(infoRow('Album', `Saved to phone ${formatDateTime(c.albumSavedAt)}`));
    rows.append(infoRow('App', `v${c.appVersion}`));
    info.replaceChildren(rows);

    if (isClip) {
      actions.replaceChildren(
        action(ICONS.share, 'Share', async () => {
          const f = await outputFile(c);
          if (!f) return;
          const r = await shareFiles([f]);
          if (r === 'downloaded') toast('Saved to Downloads');
        }),
        action(ICONS.download, 'Save', async () => {
          const f = await outputFile(c);
          if (f) {
            downloadBlob(f, f.name);
            toast('Saved to Downloads');
          }
        }),
        action(
          ICONS.trash,
          'Delete',
          async () => {
            if (!(await confirmDialog('Delete this clip? This can’t be undone.', 'Delete', true))) return;
            await s.store.delete(c.id);
            toast('Deleted');
            app.back();
          },
          'danger',
        ),
      );
      return;
    }

    const buttons: (HTMLButtonElement | null)[] = [
      action(ICONS.share, 'Share', async () => {
        const f = await outputFile(c);
        if (!f) return;
        const r = await shareFiles([f]);
        if (r === 'downloaded') toast('Saved to Downloads');
      }),
      c.originalKey
        ? action(ICONS.share, 'Original', async () => {
            const raw = await s.store.blob(c.originalKey);
            if (!raw) return;
            const blob = await withExif(raw, c, 'original');
            const name = filename(c).replace(/\.[a-z0-9]+$/, `_original.${extFor(blob.type)}`);
            const r = await shareFiles([new File([blob], name, { type: blob.type || 'image/jpeg' })]);
            if (r === 'downloaded') toast('Original saved to Downloads');
          })
        : null,
      c.originalKey ? action(ICONS.compare, 'Compare', () => openCompare(c)) : null,
      action(ICONS.download, 'Save', async () => {
        const f = await outputFile(c);
        if (f) {
          downloadBlob(f, f.name);
          toast('Saved to Downloads');
        }
      }),
      action(ICONS.edit, 'Re-edit', async () => {
        const blob = (await s.store.blob(c.originalKey)) ?? (await s.store.blob(c.outputKey));
        if (!blob) return;
        if (!c.originalKey) toast('No original kept. Editing the rendered image.');
        app.navigate({
          name: 'editor',
          input: { blob, source: 'derived', parent: c, lensId: c.lensId, params: c.params, seed: c.seed },
        });
      }),
      known && lens.seeded && c.originalKey
        ? action(ICONS.dice, 'New seed', async () => {
            const blob = await s.store.blob(c.originalKey);
            if (!blob) return;
            toast('Rendering with a new seed…');
            try {
              const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
              const next = await processAndSave(s, {
                bitmap,
                originalBlob: blob,
                lens,
                params: sanitizeParams(lens.params, c.params),
                seed: randomSeed(),
                source: 'derived',
                parentId: c.id,
                ...(c.captureMethod ? { method: c.captureMethod } : {}),
                ...(c.geo ? { geo: c.geo } : {}),
              });
              app.replace({ name: 'detail', id: next.id });
            } catch (e) {
              toast(`Render failed: ${errorMessage(e)}`);
            }
          })
        : null,
      action(
        ICONS.trash,
        'Delete',
        async () => {
          if (!(await confirmDialog('Delete this photo? This can’t be undone.', 'Delete', true))) return;
          await s.store.delete(c.id);
          toast('Deleted');
          app.back();
        },
        'danger',
      ),
    ];
    if (known && lens.actions?.length) {
      const icons = { play: ICONS.play, audio: ICONS.audio, midi: ICONS.midi, svg: ICONS.svgfile, film: ICONS.film };
      lens.actions.forEach((la, ai) => {
        const btn = h('button', { class: 'action lens-action', html: `${icons[la.icon]}<span>${la.label}</span>` });
        btn.addEventListener('click', () => {
          void (async () => {
            try {
              await la.run({
                capture: c,
                source: async () => {
                  const b = (await s.store.blob(c.originalKey)) ?? (await s.store.blob(c.outputKey));
                  if (!b) throw new Error('Photo data missing');
                  return b;
                },
                view,
                img,
                filenameBase: filename(c).replace(/\.[a-z0-9]+$/, ''),
                share: async (file) => {
                  const r = await shareFiles([file]);
                  if (r === 'downloaded') toast(`${file.name} saved to Downloads`);
                },
                toast: (m) => toast(m),
                setLabel: (label) => {
                  const span = btn.querySelector('span');
                  if (span) span.textContent = label;
                },
                onCleanup: (fn) => cleanups.push(fn),
                saveVideo: async (clip, thumb) => {
                  const saved = await saveClip(s, {
                    ...clip,
                    thumb,
                    lens,
                    params: c.params,
                    seed: c.seed,
                    createdAt: new Date().toISOString(),
                    parentId: c.id,
                    ...(c.geo ? { geo: c.geo } : {}),
                  });
                  void s.album.sync();
                  return saved.id;
                },
                open: (id) => app.navigate({ name: 'detail', id }),
              });
            } catch (e) {
              logEvent('error', 'lens-action', `${la.id} failed`, e);
              toast(`${la.label} failed: ${errorMessage(e)}`);
            }
          })();
        });
        buttons.splice(1 + ai, 0, btn); // right after Share, in declared order
      });
    }
    actions.replaceChildren(...buttons.filter((b): b is HTMLButtonElement => b !== null));
  }

  let sheet: SheetHandle | null = null;
  let comparing = false;

  /** Before/after: a looping wipe video (saved to the gallery) or a side-by-side image (shared). */
  function openCompare(c: Capture) {
    sheet?.close();
    const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
    const run = async (kind: 'video' | 'image', btn: HTMLButtonElement) => {
      if (comparing) return;
      comparing = true;
      for (const b of body.querySelectorAll('button')) b.disabled = true;
      try {
        const [orig, out] = await Promise.all([s.store.blob(c.originalKey), s.store.blob(c.outputKey)]);
        if (!orig || !out) throw new Error('Photo data missing');
        const base = filename(c).replace(/\.[a-z0-9]+$/, '');
        if (kind === 'image') {
          status.textContent = 'Making the image…';
          const jpg = await makeSideBySide(orig, out);
          sheet?.close();
          const r = await shareFiles([new File([jpg], `${base}_before-after.jpg`, { type: 'image/jpeg' })]);
          if (r === 'downloaded') toast('Saved to Downloads');
          return;
        }
        const end = s.busy.begin();
        try {
          const { clip, thumb } = await makeRevealVideo(orig, out, (f) => {
            btn.textContent = `Recording… ${Math.round(f * 100)}%`;
          });
          const lens = getLens(c.lensId);
          const saved = await saveClip(s, {
            ...clip,
            thumb,
            lens,
            params: c.params,
            seed: c.seed,
            createdAt: new Date().toISOString(),
            parentId: c.id,
            ...(c.geo ? { geo: c.geo } : {}),
          });
          void s.album.sync();
          sheet?.close();
          toast('Before/after video saved to the gallery');
          app.navigate({ name: 'detail', id: saved.id });
        } finally {
          end();
        }
      } catch (e) {
        logEvent('error', 'compare', `${kind} failed`, e);
        status.textContent = `Couldn’t make it: ${errorMessage(e)}`;
        for (const b of body.querySelectorAll('button')) b.disabled = false;
      } finally {
        comparing = false;
      }
    };
    const videoBtn = h('button', { class: 'btn btn-primary btn-block', text: 'Reveal video (loops, ~7 s)' });
    videoBtn.addEventListener('click', () => void run('video', videoBtn));
    const imageBtn = h('button', { class: 'btn btn-block', text: 'Side-by-side image' });
    imageBtn.addEventListener('click', () => void run('image', imageBtn));
    const body = h(
      'div',
      { class: 'compare-sheet' },
      h('p', { class: 'muted small', text: 'Show the original next to the lens version.' }),
      videoSupported() ? videoBtn : null,
      imageBtn,
      status,
    );
    sheet = openSheet('Before / after', body, { onClose: () => (sheet = null) });
  }
  cleanups.push(() => sheet?.close());

  // Hold to compare with the original
  let holdTimer = 0;
  view.addEventListener('pointerdown', () => {
    if (!originalUrl) return;
    holdTimer = window.setTimeout(() => {
      img.src = originalUrl;
      compareBadge.hidden = false;
    }, 180);
  });
  const release = () => {
    clearTimeout(holdTimer);
    if (!compareBadge.hidden) {
      img.src = outputUrl;
      compareBadge.hidden = true;
    }
  };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);
  view.addEventListener('pointerleave', release);
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    el,
    mount() {
      void load();
    },
    unmount() {
      for (const fn of cleanups) fn();
      for (const u of urls) URL.revokeObjectURL(u);
    },
  };
}
