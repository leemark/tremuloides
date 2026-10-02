import type { App, Screen } from '../app';
import { h, ICONS, iconButton, toast, typedConfirm } from '../ui';
import { APP_VERSION, BUILD_DATE, BUILD_SHA } from '../../version';
import { formatBytes } from '../../util/format';
import { buildReport, storageInfo } from '../../diagnostics/report';
import type { Settings } from '../../storage/settings';
import type { LogEntry } from '../../diagnostics/log';

export function createSettings(app: App): Screen {
  const s = app.s;
  const st = s.settings;
  const cleanups: (() => void)[] = [];

  const header = h('header', { class: 'screen-header' }, iconButton(ICONS.back, 'Back', () => app.back()), h('h1', { text: 'Settings' }));
  const body = h('main', { class: 'settings-scroll' });
  const el = h('div', { class: 'screen settings' }, header, body);

  const section = (title: string, ...children: (Node | null)[]) =>
    h('section', { class: 'settings-section' }, h('h2', { text: title }), ...children);

  const row = (label: string, control: Node, hint?: string) =>
    h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('span', { text: label }), hint ? h('small', { text: hint }) : null), control);

  function toggle<K extends keyof Settings>(key: K, label: string, hint?: string) {
    const input = h('input', { type: 'checkbox', class: 'switch', checked: st.get()[key] === true, 'aria-label': label });
    input.addEventListener('change', () => st.set(key, input.checked as Settings[K]));
    return row(label, input, hint);
  }

  function choice<K extends keyof Settings>(key: K, label: string, options: { value: Settings[K]; label: string }[], hint?: string) {
    const sel = h('select', { 'aria-label': label });
    for (const o of options) sel.append(h('option', { value: String(o.value), text: o.label, selected: st.get()[key] === o.value }));
    sel.addEventListener('change', () => {
      const picked = options.find((o) => String(o.value) === sel.value);
      if (picked) st.set(key, picked.value);
    });
    return row(label, sel, hint);
  }

  // About + updates
  const offlineLine = h('p', { class: 'status-line' });
  const renderOffline = () => {
    const ready = s.pwa.offlineReady;
    offlineLine.className = `status-line ${ready ? 'ok' : 'warn'}`;
    offlineLine.textContent = ready ? '✓ Ready to work offline' : 'Not yet cached for offline use. Keep the app open on a connection.';
  };
  renderOffline();
  cleanups.push(s.pwa.on('offline-ready', renderOffline));

  const updateResult = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const updateBtn = h('button', {
    class: 'btn',
    text: 'Check for updates',
    onclick: async () => {
      updateBtn.disabled = true;
      updateResult.textContent = 'Checking…';
      const r = await s.pwa.checkForUpdate();
      updateBtn.disabled = false;
      updateResult.textContent = {
        'up-to-date': 'Up to date.',
        downloading: 'Update downloading… a banner will appear when it’s ready.',
        ready: 'Update ready. Use the banner to reload.',
        offline: 'Offline, can’t check.',
        unsupported: 'Updates unavailable (service worker not registered yet).',
        error: 'Couldn’t check right now.',
      }[r];
    },
  });

  const about = section(
    'About',
    h('p', { class: 'version-line' }, h('strong', { text: `Tremuloides v${APP_VERSION}` }), h('span', { class: 'muted', text: ` (${BUILD_SHA}) · built ${new Date(BUILD_DATE).toLocaleString()}` })),
    offlineLine,
    h('div', { class: 'row-actions' }, updateBtn),
    updateResult,
  );

  // Storage
  const storageLine = h('p', { class: 'muted', text: 'Checking storage…' });
  void (async () => {
    const info = await storageInfo();
    const count = await s.store.count().catch(() => 0);
    const used = info.usage !== null ? formatBytes(info.usage) : '—';
    const quota = info.quota !== null ? formatBytes(info.quota) : '—';
    const persisted = info.persisted === null ? 'unknown' : info.persisted ? 'yes (won’t be cleared automatically)' : 'no (browser may clear it if space runs low)';
    storageLine.textContent = `${count} photo${count === 1 ? '' : 's'} · ${used} used of ${quota} · persistent: ${persisted}`;
  })();
  const storage = section('Storage', storageLine);

  // Captures
  const captures = section(
    'Captures',
    toggle('keepOriginals', 'Keep originals', 'Lets you re-edit later with any lens'),
    choice('maxRenderEdge', 'Max render size', [
      { value: 2048, label: '2048 px' },
      { value: 4096, label: '4096 px' },
      { value: 0, label: `Max (${s.renderer?.maxTextureSize ?? '—'} px)` },
    ]),
    choice('exportFormat', 'Format', [
      { value: 'jpeg', label: 'JPEG' },
      { value: 'png', label: 'PNG' },
    ]),
    choice('captureSource', 'Camera capture', [
      { value: 'auto', label: 'Full-res photo' },
      { value: 'video', label: 'Video frame' },
    ], 'Use “Video frame” if photos come out rotated or fail'),
    toggle('locationTagging', 'Location tagging', 'Saves GPS position and elevation (works offline)'),
    toggle('keepScreenOn', 'Keep screen on', 'While the viewfinder is open'),
  );

  // Diagnostics
  const logList = h('ol', { class: 'log-list' });
  const renderLogs = (logs: LogEntry[]) => {
    logList.replaceChildren(
      ...(logs.length
        ? logs.slice(0, 50).map((l) =>
            h('li', { class: `log-${l.level}` }, h('time', { text: new Date(l.t).toLocaleTimeString() }), h('span', { text: ` [${l.source}] ${l.message}` }), l.detail ? h('pre', { text: l.detail }) : null),
          )
        : [h('li', { class: 'muted', text: 'No events logged.' })]),
    );
  };
  void s.store.logs().then(renderLogs).catch(() => renderLogs([]));
  const glInfo = s.renderer?.info();
  const facts = h(
    'dl',
    { class: 'info-list' },
    h('div', { class: 'info-row' }, h('dt', { text: 'GPU' }), h('dd', { text: glInfo ? glInfo.renderer : `Unavailable: ${s.rendererError ?? ''}` })),
    h('div', { class: 'info-row' }, h('dt', { text: 'Max texture' }), h('dd', { text: glInfo ? `${glInfo.maxTextureSize} px` : '—' })),
    h('div', { class: 'info-row' }, h('dt', { text: 'Service worker' }), h('dd', { text: s.pwa.serviceWorkerState })),
  );
  const copyBtn = h('button', {
    class: 'btn',
    text: 'Copy diagnostics',
    onclick: async () => {
      const report = JSON.stringify(await buildReport(s), null, 1);
      try {
        await navigator.clipboard.writeText(report);
        toast('Diagnostics copied');
      } catch {
        const ta = h('textarea', { class: 'report-text', readonly: true });
        ta.value = report;
        diagnostics.append(ta);
        ta.select();
        toast('Clipboard blocked. Select the text below and copy it.');
      }
    },
  });
  const diagnostics = section(
    'Diagnostics',
    toggle('fpsOverlay', 'FPS overlay', 'Shows frame rate and preview size in the viewfinder'),
    facts,
    h(
      'div',
      { class: 'row-actions' },
      copyBtn,
      h('button', {
        class: 'btn btn-ghost',
        text: 'Clear log',
        onclick: async () => {
          await s.store.clearLogs();
          renderLogs([]);
        },
      }),
    ),
    h('h3', { text: 'Recent events' }),
    logList,
  );

  const danger = section(
    'Danger zone',
    h('button', {
      class: 'btn btn-danger',
      text: 'Delete all photos',
      onclick: async () => {
        if (!(await typedConfirm('Delete every photo stored in this app? Type DELETE to confirm.', 'DELETE'))) return;
        await s.store.deleteAll();
        toast('All photos deleted');
      },
    }),
  );

  body.append(about, storage, captures, diagnostics, danger);

  return {
    el,
    unmount() {
      for (const c of cleanups) c();
    },
  };
}
