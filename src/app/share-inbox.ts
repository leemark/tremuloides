/** Reads photos the service worker parked from an Android "Share → Tremuloides" (public/share-target.js). */
export const SHARE_CACHE = 'trem-share-inbox';

export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const keys = await cache.keys();
    const files: File[] = [];
    for (const req of [...keys].sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }))) {
      const res = await cache.match(req);
      if (!res) continue;
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get('X-Name') ?? 'shared.jpg');
      const lastModified = Number(res.headers.get('X-Modified')) || Date.now();
      files.push(new File([blob], name, { type: blob.type || res.headers.get('Content-Type') || '', lastModified }));
    }
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}
