import { describe, expect, it } from 'vitest';
import { defaultParams, sanitizeParams, validateSpecs } from '../src/lenses/params';
import type { ParamSpec } from '../src/lenses/types';

const specs: ParamSpec[] = [
  { id: 'levels', label: 'Levels', type: 'range', min: 2, max: 12, step: 1, default: 5 },
  { id: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
  { id: 'soft', label: 'Soft', type: 'toggle', default: false },
  { id: 'mode', label: 'Mode', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' },
  { id: 'ink', label: 'Ink', type: 'color', default: '#1a1c21' },
];

describe('params', () => {
  it('builds defaults', () => {
    expect(defaultParams(specs)).toEqual({ levels: 5, amount: 0.5, soft: false, mode: 'a', ink: '#1a1c21' });
  });

  it('clamps, snaps and type-checks values, dropping unknown keys', () => {
    const out = sanitizeParams(specs, { levels: 99, amount: 0.33, soft: 'yes', mode: 'z', ink: '#ABCDEF', extra: 1 });
    expect(out).toEqual({ levels: 12, amount: 0.35, soft: false, mode: 'a', ink: '#abcdef' });
  });

  it('fills missing values with defaults', () => {
    expect(sanitizeParams(specs, undefined)).toEqual(defaultParams(specs));
    expect(sanitizeParams(specs, { levels: Number.NaN })['levels']).toBe(5);
  });

  it('validates specs', () => {
    expect(validateSpecs(specs)).toEqual([]);
    const bad: ParamSpec[] = [
      { id: 'x', label: 'X', type: 'range', min: 5, max: 1, step: 0, default: 9 },
      { id: 'x', label: '', type: 'select', options: [{ value: 'a', label: 'A' }], default: 'q' },
      { id: 'Bad-Id', label: 'C', type: 'color', default: 'red' },
    ];
    const errors = validateSpecs(bad);
    expect(errors.length).toBeGreaterThanOrEqual(6);
  });
});
