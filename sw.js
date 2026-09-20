/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — service worker
 * 离线缓存核心资源（stale-while-revalidate）。
 * 仅在 https / localhost 下生效；file:// 双击游玩时不注册（main.js 静默失败）。
 * ========================================================================= */
const CACHE = 'echo-tower-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/i18n.js',
  './js/gen.js',
  './js/audio.js',
  './js/core.js',
  './js/entities.js',
  './js/systems.js',
  './js/render.js',
  './js/ui.js',
  './js/main.js',
  './favicon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 只缓存同源资源；字体等跨域请求直接放行
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
