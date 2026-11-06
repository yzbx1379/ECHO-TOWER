/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — service worker
 * 离线缓存核心资源（stale-while-revalidate）。
 * 仅在 https / localhost 下生效；file:// 双击游玩时不注册（main.js 静默失败）。
 * ========================================================================= */
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
  './js/systems.move.js',
  './js/systems.combat.js',
  './js/systems.hazards.js',
  './js/systems.echo.js',
  './js/systems.progress.js',
  './js/systems.js',
  './js/render.js',
  './js/ui.js',
  './js/prefetch.js',
  './js/gen.worker.js',
  './js/main.js',
  './favicon.svg',
  './manifest.webmanifest',
]

/* 版本化缓存：缓存名由 ASSETS 清单内容派生（FNV-1a 32 位）。
 * 清单一变（新增/删除脚本）缓存名就变，activate 会清掉所有旧名缓存，
 * 不再需要人工 bump 版本号——本轮一次新增 7 个 js 却忘了改 v1，正是这个疏漏。
 * JS 文件没有内容哈希文件名，因此还要配合下面 navigation 的 network-first，
 * 避免 stale-while-revalidate 把新旧 index.html / js 混成同一个版本。 */
function cacheKey(list) {
  let h = 2166136261
  const s = list.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'echo-tower-' + (h >>> 0).toString(36)
}
const CACHE = cacheKey(ASSETS)

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  // 只缓存同源资源；字体等跨域请求直接放行
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // 导航请求 network-first：index.html 永远拿最新清单，避免新页面配旧脚本。
  // 离线时回落到预缓存（'./' 或 './index.html'），双击安装后仍可打开。
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('./index.html')) || Response.error()),
    )
    return
  }
  // 其余同源资源：stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
