import { confirmDialog, h, promptText, toast } from './ui';
import type { Lens, ParamSpec, Params, ParamValue } from '../lenses/types';
import { MAX_NAME, presetMatches, presetParams, type PresetStore } from '../storage/presets';

function formatNumber(v: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  return v.toFixed(decimals);
}

/** Generates controls for a lens's params. Calls onChange with the full updated set. */
export function paramControls(specs: readonly ParamSpec[], values: Params, onChange: (next: Params) => void): HTMLElement {
  const current: Params = { ...values };
  const set = (id: string, v: ParamValue) => {
    current[id] = v;
    onChange({ ...current });
  };
  const wrap = h('div', { class: 'params' });
  if (specs.length === 0) {
    wrap.append(h('p', { class: 'muted', text: 'This lens has no settings.' }));
    return wrap;
  }
  for (const spec of specs) {
    const id = `p-${spec.id}`;
    const row = h('div', { class: `param param-${spec.type}` });
    const label = h('label', { for: id, class: 'param-label' }, h('span', { text: spec.label }));
    switch (spec.type) {
      case 'range': {
        const value = Number(current[spec.id] ?? spec.default);
        const out = h('output', { class: 'param-value', text: formatNumber(value, spec.step) });
        label.append(out);
        const input = h('input', { id, type: 'range', min: spec.min, max: spec.max, step: spec.step, value });
        input.addEventListener('input', () => {
          const v = Number(input.value);
          out.textContent = formatNumber(v, spec.step);
          set(spec.id, v);
        });
        row.append(label, input);
        break;
      }
      case 'toggle': {
        const input = h('input', { id, type: 'checkbox', class: 'switch', checked: current[spec.id] === true });
        input.addEventListener('change', () => set(spec.id, input.checked));
        row.append(label, input);
        break;
      }
      case 'select': {
        row.append(label);
        if (spec.options.length <= 4) {
          const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': spec.label });
          for (const opt of spec.options) {
            const btn = h('button', {
              class: `seg ${current[spec.id] === opt.value ? 'on' : ''}`,
              role: 'radio',
              'aria-checked': String(current[spec.id] === opt.value),
              text: opt.label,
              onclick: () => {
                for (const b of seg.querySelectorAll('.seg')) {
                  b.classList.remove('on');
                  b.setAttribute('aria-checked', 'false');
                }
                btn.classList.add('on');
                btn.setAttribute('aria-checked', 'true');
                set(spec.id, opt.value);
              },
            });
            seg.append(btn);
          }
          row.append(seg);
        } else {
          const sel = h('select', { id });
          for (const opt of spec.options) sel.append(h('option', { value: opt.value, text: opt.label, selected: current[spec.id] === opt.value }));
          sel.addEventListener('change', () => set(spec.id, sel.value));
          row.append(sel);
        }
        break;
      }
      case 'color': {
        const input = h('input', { id, type: 'color', value: String(current[spec.id] ?? spec.default) });
        input.addEventListener('input', () => set(spec.id, input.value));
        row.append(label, input);
        break;
      }
    }
    if (spec.help) row.append(h('p', { class: 'param-help', text: spec.help }));
    wrap.append(row);
  }
  return wrap;
}

/** "Levels 5 · Saturation 1.2 · Soft steps off" */
export function paramSummary(specs: readonly ParamSpec[], values: Params): string {
  return specs
    .map((s) => {
      const v = values[s.id];
      if (s.type === 'toggle') return `${s.label} ${v ? 'on' : 'off'}`;
      if (s.type === 'select') return `${s.label} ${s.options.find((o) => o.value === v)?.label ?? String(v)}`;
      return `${s.label} ${String(v)}`;
    })
    .join(' · ');
}

/**
 * Preset chips for a lens: built-ins, the user's own (with ✕ to delete), and "＋ Save".
 * The chip matching the current settings is highlighted. `getParams` returns the live params.
 */
export function presetBar(store: PresetStore, lens: Lens, getParams: () => Params, apply: (next: Params) => void): HTMLElement & { refresh(): void } {
  const row = h('div', { class: 'preset-row', role: 'group', 'aria-label': 'Presets' });
  const render = () => {
    const params = getParams();
    row.replaceChildren(
      h('span', { class: 'preset-label', text: 'Presets' }),
      ...store.list(lens.id).map((p) => {
        const on = presetMatches(lens.params, p, params);
        const chip = h('button', {
          class: `preset-chip ${on ? 'on' : ''}`,
          'aria-pressed': String(on),
          text: p.name,
          onclick: () => {
            apply(presetParams(lens.params, p));
            render();
          },
        });
        if (p.builtIn) return chip;
        const del = h('button', {
          class: 'preset-del',
          'aria-label': `Delete preset ${p.name}`,
          text: '×',
          onclick: async (e: Event) => {
            e.stopPropagation();
            if (!(await confirmDialog(`Delete the preset “${p.name}”?`, 'Delete', true))) return;
            store.remove(p.id);
            render();
          },
        });
        return h('span', { class: 'preset-own' }, chip, del);
      }),
      h('button', {
        class: 'preset-chip preset-add',
        text: '＋ Save',
        onclick: async () => {
          const name = await promptText(`Save these ${lens.name} settings as a preset`, { placeholder: 'e.g. Golden hour', okLabel: 'Save', maxLength: MAX_NAME });
          if (!name) return;
          store.add(lens.id, name, getParams());
          toast(`Saved preset “${name}”`);
          render();
        },
      }),
    );
  };
  render();
  return Object.assign(row, { refresh: render });
}
