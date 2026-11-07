/* Quill & Sigil — offline cache.
   The game's own files are fetched fresh when there is a connection (so updates arrive at once)
   and served from the cache when there is not. Fonts are cached on first use.
   Bump VERSION together with the ?v=N script versions in index.html. */
const VERSION = 119;
const CACHE = 'quill-sigil-v' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/ink.js?v=' + VERSION,
  './js/world.js?v=' + VERSION,
  './js/tips.js?v=' + VERSION,
  './js/main.js?v=' + VERSION,
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('quill-sigil-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // fonts never change: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // the game itself: network first, cache as a fallback
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true }))
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
