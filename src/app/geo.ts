import type { GeoTag } from '../storage/types';
import { logEvent } from '../diagnostics/log';

/** One GPS fix (works without cell service). Resolves null on denial, timeout or no support. */
export function getPosition(): Promise<GeoTag | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          altitudeAccuracy: p.coords.altitudeAccuracy,
          at: new Date(p.timestamp).toISOString(),
        }),
      (err) => {
        logEvent('info', 'geo', `Location unavailable: ${err.message || err.code}`);
        resolve(null);
      },
      { enableHighAccuracy: true, maximumAge: 300_000, timeout: 15_000 },
    );
  });
}
