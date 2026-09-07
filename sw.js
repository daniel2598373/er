const CACHE_NAME = 'gestion-it-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/api.js',
  './js/app.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/admin.js',
  './js/task.js',
  './js/cableOptimizer.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
