/* Офлайн-режим: сначала сеть (чтобы правки сразу доходили), без сети — из кэша */
var CACHE = 'lv-v7';
var CORE = ['./', 'index.html', 'css/style.css?v=7', 'js/content.js?v=7', 'js/app.js?v=7', 'assets/icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function timeout(ms) { return new Promise(function (_, rej) { setTimeout(rej, ms); }); }
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;
  if (fonts) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  e.respondWith(
    Promise.race([fetch(req, { cache: 'no-cache' }), timeout(5000)]).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: false }).then(function (hit) {
        return hit || caches.match(req, { ignoreSearch: true }) .then(function (h2) { return h2 || caches.match('index.html'); });
      });
    })
  );
});
