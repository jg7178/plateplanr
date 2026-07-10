const CACHE = 'plateplanr-v37';
const ASSETS = [
  './',
  './index.html',
  './recipes-catalog.js',
  './instruction-helper.js',
  './nutrition-calculator.js',
  './family-settings.js',
  './ban-list.js',
  './price-database.js',
  './store-apis.js',
  './grocery-units.js',
  './grocery-prices.js',
  './grocery-order.js',
  './meal-planner-smart.js',
  './data.js',
  './config.js',
  './config.local.js',
  './billing.js',
  './idb.js',
  './auth.js',
  './barcode.js',
  './photo.js',
  './app.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) {
    if (url.hostname.includes('openfoodfacts.org') || url.hostname.includes('openai.com')) {
      e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { status: 503 })));
    }
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || fetched;
    })
  );
});