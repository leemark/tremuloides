import type { ParamSpec, Params, ParamValue } from './types';

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultParams(specs: readonly ParamSpec[]): Params {
  const out: Params = {};
  for (const s of specs) out[s.id] = s.default;
  return out;
}

/** Coerces one value to its spec, falling back to the default when it doesn't fit. */
export function sanitizeValue(spec: ParamSpec, value: unknown): ParamValue {
  switch (spec.type) {
    case 'range': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return spec.default;
      const clamped = Math.min(spec.max, Math.max(spec.min, value));
      const steps = Math.round((clamped - spec.min) / spec.step);
      return Number((spec.min + steps * spec.step).toFixed(6));
    }
    case 'toggle':
      return typeof value === 'boolean' ? value : spec.default;
    case 'select':
      return typeof value === 'string' && spec.options.some((o) => o.value === value) ? value : spec.default;
    case 'color':
      return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : spec.default;
  }
}

/** Returns a complete, valid parameter set: unknown keys dropped, missing/invalid ones defaulted. */
export function sanitizeParams(specs: readonly ParamSpec[], values: Record<string, unknown> | undefined): Params {
  const out: Params = {};
  for (const s of specs) out[s.id] = sanitizeValue(s, values?.[s.id]);
  return out;
}

/** Problems with a spec list (empty when valid). Used by the registry test. */
export function validateSpecs(specs: readonly ParamSpec[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of specs) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(s.id)) errors.push(`param id "${s.id}" must be camelCase`);
    if (ids.has(s.id)) errors.push(`duplicate param id "${s.id}"`);
    ids.add(s.id);
    if (!s.label.trim()) errors.push(`param "${s.id}" needs a label`);
    switch (s.type) {
      case 'range':
        if (!(s.min < s.max)) errors.push(`param "${s.id}": min must be < max`);
        if (!(s.step > 0)) errors.push(`param "${s.id}": step must be > 0`);
        if (s.default < s.min || s.default > s.max) errors.push(`param "${s.id}": default out of range`);
        break;
      case 'select':
        if (s.options.length < 2) errors.push(`param "${s.id}": needs at least 2 options`);
        if (!s.options.some((o) => o.value === s.default)) errors.push(`param "${s.id}": default not in options`);
        break;
      case 'color':
        if (!HEX.test(s.default)) errors.push(`param "${s.id}": default must be #rrggbb`);
        break;
      case 'toggle':
        break;
    }
  }
  return errors;
}

/** "#rrggbb" → [r, g, b] in 0–1 (sRGB). */
export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
