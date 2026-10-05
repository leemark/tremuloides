const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** tremuloides_YYYYMMDD_HHMMSS_<lensId>.<ext> in local time. */
export function exportFilename(date: Date, lensId: string, ext = 'jpg'): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const safeLens = lensId.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'lens';
  return `tremuloides_${d}_${t}_${safeLens}.${ext}`;
}

/** "v0.1.0 (abc1234)" */
export function formatVersion(version: string, sha: string): string {
  return `v${version} (${sha})`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Local calendar day key, e.g. "2026-10-02". */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDayHeading(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function metersToFeet(m: number): number {
  return m * 3.28084;
}
