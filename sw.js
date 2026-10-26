// Sigma Cap — fonctionne hors connexion pour la page (les données restent en ligne)
const V = 'sigma-cap-v202610262002';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'core.js', 'learn.js', 'data.js', 'config.js', 'manifest.webmanifest',
  'img/logo-full.jpg', 'img/mark.png', 'img/thiam.jpg', 'img/faye.jpg', 'img/sene.jpg', 'img/thiam-p.jpg', 'img/faye-p.jpg', 'img/sene-p.jpg', 'img/profdemaths.jpg', 'img/icon-192.png', 'img/icon-512.png', 'img/qrcode.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // réseau d'abord (pour recevoir les mises à jour), cache en secours
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
