var CACHE = 'f1-by-ear-v2-1';
var FILES = ['./', './index.html', './js/tracks.js', './js/logic.js', './js/steer.js', './js/audio.js', './js/speech.js', './js/words.js', './js/app.js',
  './audio/eng_lo.mp3', './audio/eng_hi.mp3', './audio/rival.mp3', './audio/kerb.mp3', './audio/gravel.mp3', './audio/squeal.mp3',
  './audio/crowd.mp3', './audio/crash.mp3', './audio/clank.mp3', './audio/cheer.mp3', './audio/horns.mp3', './audio/silence.mp3'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE && k.indexOf('f1-by-ear-v2') === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var isAudio = /\/audio\//.test(e.request.url);
  if (isAudio) { e.respondWith(caches.match(e.request).then(function (m) { return m || fetch(e.request); })); return; }
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); }); }));
});
