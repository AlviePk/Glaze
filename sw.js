// Offline support for the Cone 10 Glaze Builder.
// The page itself is always fetched fresh when you're online (so updates show up), and the saved copy is used when you're not.
// Bump VERSION if you ever change the list of files below.
const VERSION = 'glaze-v1';
const FONTS = 'glaze-fonts-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Try the network first, but give up after a few seconds and use the saved copy so a bad signal doesn't hang the app.
function networkFirst(req, key) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(key, { ignoreSearch: true }).then(hit => hit || caches.match('./', { ignoreSearch: true }));
    const timer = setTimeout(() => { if (!done) fallback().then(hit => { if (hit && !done) { done = true; resolve(hit); } }); }, 4000);
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) fallback().then(hit => { done = true; resolve(hit || Response.error()); });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, 'index.html')); return; }
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Google Fonts: keep what was loaded so the app looks the same offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
