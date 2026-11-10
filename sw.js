/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — service worker
 * 离线缓存核心资源：在线 network-first，离线回落缓存。
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
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest',
]

/* 仅离线缓存、不被 index.html 以同源相对路径引用的资源。
 * static.test.cjs 从这里读取白名单，避免测试里再硬编码一份。
 * （og.png 是社交预览图，只需公开 URL，不进离线缓存。） */
const CACHE_ONLY = ['./js/gen.worker.js']

/* 版本化缓存：缓存名由 ASSETS 清单内容派生（FNV-1a 32 位）。
 * 清单一变（新增/删除脚本）缓存名就变，activate 会清掉所有旧名缓存。
 * ⚠ 缓存名只反映「清单」，不反映「文件内容」：只改 js/css 内容时 sw.js 字节不变，
 * 浏览器不会触发 SW update，install 不重跑。因此所有同源请求一律 network-first
 * （在线拿最新、顺带刷新缓存），离线才回落缓存。实测：改 core.js 内容后，
 * 旧的 stale-while-revalidate 会让第一次 reload 仍执行旧脚本、第二次才更新。 */
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
  // 其余同源资源：network-first + 离线回落（理由见文件头注释）。
  // 在线拿最新内容并刷新缓存；离线或网络失败时用缓存兜底，PWA 仍可玩。
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      .catch(async () => (await caches.match(req)) || Response.error()),
  )
})
