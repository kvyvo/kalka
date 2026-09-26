const VERSION = 'dev';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'assets/icon.svg', 'assets/demo.svg',
  'js/app.js', 'js/geometry.js', 'js/screens.js', 'js/spring.js', 'js/store.js', 'js/i18n.js',
  'js/image.js', 'js/outline.js', 'js/outline.worker.js', 'js/trace.js', 'js/ui.js', 'js/motion.js', 'js/island.js', 'js/hero.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => { put(req, r.clone()); return r; }).catch(() => caches.match('index.html')));
  } else if (same || /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.host)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') put(req, r.clone()); return r; })));
  }
});
const put = (req, res) => caches.open(VERSION).then((c) => c.put(req, res));
