/** Tiny DOM helpers and shared UI pieces (no framework). */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  lenses: svg('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
  import: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  dice: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  sliders: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  audio: svg('<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2"/>'),
  midi: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v9M12 4v9M16 4v9"/>'),
  compare: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20"/><path d="M3 15l5-5 4 4" />'),
  film: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
  svgfile: svg('<path d="M4 18c3-8 6-8 8-4s5 4 8-4"/><path d="M4 12c3-6 6-6 8-3s5 3 8-3"/>'),
  log: svg('<path d="M3 20h18"/><path d="M5 16l4-6 4 3 6-9"/><circle cx="19" cy="4" r="1.5"/>'),
  select: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M15 17.5l2 2 4-4"/>'),
};

export function iconButton(icon: string, label: string, onClick: (e: MouseEvent) => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `icon-btn ${cls}`.trim(), 'aria-label': label, title: label, html: icon, onclick: onClick });
}

// ---------- Toasts ----------

let toastHost: HTMLElement | null = null;

export function toast(message: string, opts: { duration?: number; action?: { label: string; run: () => void } } = {}): void {
  toastHost ??= document.body.appendChild(h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: 'toast' }, h('span', { text: message }));
  if (opts.action) {
    const { label, run } = opts.action;
    el.append(
      h('button', {
        class: 'toast-action',
        text: label,
        onclick: () => {
          run();
          el.remove();
        },
      }),
    );
  }
  toastHost.append(el);
  setTimeout(() => el.classList.add('leaving'), opts.duration ?? 3200);
  setTimeout(() => el.remove(), (opts.duration ?? 3200) + 400);
}

// ---------- Bottom sheet ----------

export interface SheetHandle {
  close(): void;
  body: HTMLElement;
}

export function openSheet(title: string, content: Node, opts: { onClose?: () => void } = {}): SheetHandle {
  const body = h('div', { class: 'sheet-body' }, content);
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), iconButton(ICONS.close, 'Close', () => close())),
    body,
  );
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e: Event) => e.target === backdrop && close() }, panel);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 250);
    opts.onClose?.();
  }
  return { close, body };
}

// ---------- Dialogs ----------

export function confirmDialog(message: string, confirmLabel = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      backdrop.remove();
      resolve(v);
    };
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop' },
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
        h('p', { text: message }),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn', text: 'Cancel', onclick: () => done(false) }),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmLabel, onclick: () => done(true) }),
        ),
      ),
    );
    document.body.append(backdrop);
  });
}

/** Asks the user to type `word` to confirm a destructive action. */
export function typedConfirm(message: string, word: string): Promise<boolean> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: word, 'aria-label': `Type ${word}` });
    const confirmBtn = h('button', { class: 'btn btn-danger', text: 'Delete', disabled: true });
    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value.trim().toUpperCase() !== word;
    });
    const done = (v: boolean) => {
      backdrop.remove();
      resolve(v);
    };
    confirmBtn.addEventListener('click', () => done(true));
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop' },
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
        h('p', { text: message }),
        input,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', text: 'Cancel', onclick: () => done(false) }), confirmBtn),
      ),
    );
    document.body.append(backdrop);
    input.focus();
  });
}

// ---------- Banner (update available) ----------

export function showBanner(message: string, actionLabel: string, onAction: () => void, onDismiss?: () => void): () => void {
  const el = h(
    'div',
    { class: 'banner', role: 'status' },
    h('span', { class: 'banner-text', text: message }),
    h('button', { class: 'btn btn-primary btn-small', text: actionLabel, onclick: onAction }),
    iconButton(ICONS.close, 'Dismiss', () => {
      remove();
      onDismiss?.();
    }, 'banner-close'),
  );
  document.body.append(el);
  function remove() {
    el.remove();
  }
  return remove;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
