/* Quill & Sigil — offline cache.
   The game's own files are fetched fresh when there is a connection (so updates arrive at once)
   and served from the cache when there is not. Fonts are cached on first use.
   Bump VERSION together with the ?v=N script versions in index.html. */
const VERSION = 168;
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
  './art/grim-seal.png?v=1',
  './art/seal-1.png?v=2',
  './art/seal-2.png?v=2',
  './art/seal-3.png?v=2',
  './art/seal-4.png?v=2',
  './art/seal-5.png?v=2',
  './art/seal-6.png?v=2',
  './art/folio-book.jpg?v=1',
  './art/folio-page.jpg?v=1',
  './art/folio-leaf.jpg?v=1',
  './art/num-I.png?v=1',
  './art/num-V.png?v=1',
  './art/num-X.png?v=1',
  './art/num-L.png?v=1',
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
  // the game itself: network first (asking the server whether its copy is still current, past the browser's own
  // cache, so a reload always gets the newest version), the offline cache as a fallback
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(fresh.then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true }))
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
