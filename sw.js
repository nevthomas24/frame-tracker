// Keeps the app's own files on the device so it opens with no internet.
// Your data is never cached here — it lives in the app's local storage and your gist.
const CACHE = 'tekken8-tracker-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API calls always go to the network

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if (isPage) {
    // The app page: try the network first so updates show on the first open,
    // but fall back to the saved copy if offline or the connection is slow.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const network = fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      });
      event.waitUntil(network.catch(() => {}));
      const first = await Promise.race([
        network.catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve('slow'), PAGE_TIMEOUT_MS)),
      ]);
      if (first && first !== 'slow' && first.ok) return first;
      const cached = await cache.match('./index.html');
      if (cached) return cached;
      const late = await network.catch(() => null);
      return late || new Response('Offline and not saved yet — open the app once while online.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }

  // Icons and manifest: saved copy first, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || new Response('', { status: 504 });
  })());
});
