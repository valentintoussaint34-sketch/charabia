/* Charabia — service worker : cache hors ligne de l'app complète.
   Stratégie : réseau d'abord (les mises à jour déployées arrivent dès qu'on est en ligne),
   cache en secours (l'app entière fonctionne hors ligne). Icônes : cache d'abord. */
const CACHE = 'charabia-v3';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/content-data.js', './js/util.js', './js/store.js', './js/srs.js', './js/bank.js',
  './js/tts.js', './js/gemini.js', './js/sync.js', './js/confetti.js', './js/session.js', './js/render.js',
  './js/screens.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API Gemini, GitHub etc. : réseau direct
  if (url.pathname.includes('/icons/')) {
    // images immuables : cache d'abord
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  // code et contenu : réseau d'abord, copie mise en cache, cache si hors ligne
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
