import type { Capture } from '../storage/types';
import { dayKey } from '../util/format';

export interface Trip {
  name: string;
  /** Local day "YYYY-MM-DD"; null = from the first capture. */
  start: string | null;
  /** Local day, inclusive; null = open-ended. */
  end: string | null;
}

export const DEFAULT_TRIP: Trip = { name: 'San Juans 2026', start: null, end: null };

export function parseTrip(raw: string | null): Trip {
  if (!raw) return { ...DEFAULT_TRIP };
  try {
    const t = JSON.parse(raw) as Partial<Trip>;
    const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return {
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 60) : DEFAULT_TRIP.name,
      start: day(t.start),
      end: day(t.end),
    };
  } catch {
    return { ...DEFAULT_TRIP };
  }
}

/** Captures inside the trip's date range, oldest first. */
export function tripCaptures(captures: readonly Capture[], trip: Trip): Capture[] {
  return captures
    .filter((c) => {
      const d = dayKey(c.createdAt);
      return (!trip.start || d >= trip.start) && (!trip.end || d <= trip.end);
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export interface TripStats {
  photos: number;
  days: number;
  first: string | null;
  last: string | null;
  /** Metres; null when no capture has altitude. */
  minAlt: number | null;
  maxAlt: number | null;
  withGeo: number;
  avgWarm: number | null;
}

export function tripStats(caps: readonly Capture[]): TripStats {
  const alts = caps.map((c) => c.geo?.altitude).filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  const warms = caps.map((c) => c.fieldlog?.warmIndex).filter((w): w is number => typeof w === 'number');
  return {
    photos: caps.length,
    days: new Set(caps.map((c) => dayKey(c.createdAt))).size,
    first: caps[0]?.createdAt ?? null,
    last: caps[caps.length - 1]?.createdAt ?? null,
    minAlt: alts.length ? Math.min(...alts) : null,
    maxAlt: alts.length ? Math.max(...alts) : null,
    withGeo: caps.filter((c) => c.geo).length,
    avgWarm: warms.length ? warms.reduce((a, b) => a + b, 0) / warms.length : null,
  };
}
