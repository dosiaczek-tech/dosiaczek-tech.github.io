// Cache only this app's public catalogue and interface, never accounts or journals.
const CACHE = 'sup:offline:1.0.6';
const FILES = ['index.html', 'assets/app.js?v=1.0.6', 'assets/app.css?v=1.0.6', 'assets/mark.svg',
  'data/routes.json', 'data/route-map.geojson', 'data/access-points.json', 'data/river-network.json'];
const URLS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...URLS])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('sup:offline:') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/sup/')) return;
  const navigation = request.mode === 'navigate' && ['/sup/', '/sup/index.html'].includes(url.pathname);
  const key = navigation ? new URL('index.html', self.registration.scope).href : url.href;
  if (!URLS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (!response.ok) throw new Error('Catalogue temporarily unavailable');
      // Serve the current network response; retain the install-time coherent
      // bundle as the offline fallback, rather than mixing release versions.
      return response;
    } catch (error) {
      const saved = await cache.match(key);
      if (saved) return saved;
      throw error;
    } finally { clearTimeout(timer); }
  })());
});
