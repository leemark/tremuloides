/* Share target (Android): "Share → Tremuloides" from Google Photos or the Files app POSTs the
 * photos here. They're parked in a cache and the app opens with ?shared=1 to import them.
 * Loaded into the service worker via workbox importScripts; must stay dependency-free. */
const SHARE_CACHE = 'trem-share-inbox';
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const base = new URL('./', self.registration.scope);
      try {
        const form = await event.request.formData();
        const files = form.getAll('photos').filter((f) => f && typeof f === 'object' && 'size' in f);
        const cache = await caches.open(SHARE_CACHE);
        for (const k of await cache.keys()) await cache.delete(k);
        let i = 0;
        for (const f of files) {
          const headers = { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || `shared-${i}`), 'X-Modified': String(f.lastModified || 0) };
          await cache.put(new URL(`share-inbox/${i++}`, base).href, new Response(f, { headers }));
        }
        return Response.redirect(new URL(`?shared=${i}`, base).href, 303);
      } catch (e) {
        return Response.redirect(new URL('?shared=error', base).href, 303);
      }
    })(),
  );
});
