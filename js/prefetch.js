/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/prefetch.js
 * 楼层预生成：把 Dijkstra + Held-Karp 的计算挪出主线程。
 *
 *  - Worker 可用（https / localhost）：首层异步生成；进入楼层后预取下一层，
 *    buildLevel() 直接取缓存，nextFloor() 保持同步语义、换层零阻塞。
 *  - Worker 不可用（file:// 双击、沙箱、旧浏览器、脚本加载失败）：
 *    全部同步 fallback，行为与引入本模块之前完全一致，双击 index.html 仍可玩。
 *
 * 浏览器挂 window.EchoPrefetch。Node 测试（sim.test）不加载本模块，
 * systems.progress.js 的 buildLevel 会直接走同步生成，逻辑侧零影响。
 * ========================================================================= */
;(function () {
  'use strict'
  const G = window.EchoGen
  const cache = new Map() // key -> level（预取结果，取走即删）
  const waiters = new Map() // key -> [resolve]
  const inflight = new Set()
  let worker = null,
    broken = false
  const stats = { workerGenerated: 0, syncFallback: 0, cacheHits: 0, errors: 0 }
  const key = (seed, floor) => seed + ':' + floor

  function syncGen(seed, floor) {
    stats.syncFallback++
    return G.generateFloor(seed, floor, {})
  }
  function settleAll(err) {
    if (err) stats.errors++
    for (const [, list] of waiters) for (const fn of list) fn(null)
    waiters.clear()
    inflight.clear()
  }
  /* Worker 失效统一收口：终止实例、清空引用、所有等待者以同步兜底结算。
   * 原先 onerror 走这套，但超时分支只置 broken=true 且 worker 仍非 null，
   * 导致 ensureWorker() 在 broken 时仍返回它、post() 继续往卡住的 Worker 发消息。 */
  function disableWorker(countError) {
    broken = true
    if (worker) {
      try {
        worker.terminate()
      } catch (e) {
        /* ignore */
      }
    }
    worker = null
    settleAll(countError)
  }

  const TIMEOUT_MS = 3000
  function ensureWorker() {
    if (broken) return null
    if (worker) return worker
    try {
      // file:// 下同源策略不允许加载 Worker，直接标为不可用，避免一次注定失败的
      // 加载与控制台报错；也让 enabled() 立即为 false，开局保持完全同步。
      const isFile = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:'
      if (typeof Worker === 'undefined' || isFile) {
        broken = true
        return null
      }
      worker = new Worker('./js/gen.worker.js')
      worker.onmessage = (e) => {
        const d = e.data || {}
        const k = key(d.seed, d.floor)
        inflight.delete(k)
        if (d.ok && d.level) {
          cache.set(k, d.level)
          stats.workerGenerated++
        } else stats.errors++
        const list = waiters.get(k)
        if (list) {
          waiters.delete(k)
          for (const fn of list) fn(d.ok ? d.level : null)
        }
      }
      worker.onerror = () => disableWorker(true)
    } catch (e) {
      disableWorker(true)
    }
    return worker
  }

  function post(seed, floor) {
    if (broken) return false
    const w = ensureWorker()
    if (!w) return false
    const k = key(seed, floor)
    if (inflight.has(k)) return true // 已发出，等同一条回消息即可
    inflight.add(k)
    try {
      w.postMessage({ seed, floor })
      return true
    } catch (e) {
      inflight.delete(k)
      return false
    }
  }

  /* 预取：只为「下一层」调用；结果留在 cache 等 buildLevel 来取 */
  function request(seed, floor) {
    if (!(floor >= 1 && floor <= 100)) return
    if (cache.has(key(seed, floor))) return
    post(seed, floor)
  }

  /* buildLevel 调用：命中缓存则取走，否则返回 null 让调用方同步生成 */
  function take(seed, floor) {
    const k = key(seed, floor)
    const lv = cache.get(k)
    if (!lv) return null
    cache.delete(k)
    stats.cacheHits++
    return lv
  }

  /* 首层：返回 Promise<level>。Worker 不可用时立即以同步结果 resolve。 */
  function generate(seed, floor, opts) {
    const hit = take(seed, floor)
    if (hit) return Promise.resolve(hit)
    if (!ensureWorker()) return Promise.resolve(syncGen(seed, floor))
    const k = key(seed, floor)
    return new Promise((resolve) => {
      let done = false
      let timer = null
      const finish = (lv) => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        if (cache.has(k)) {
          cache.delete(k)
          stats.cacheHits++
        } // 首层结果不留在预取缓存里
        resolve(lv || syncGen(seed, floor))
      }
      const list = waiters.get(k) || []
      list.push(finish)
      waiters.set(k, list)
      // Worker 卡住 → 统一失效 + 同步兜底，绝不把开局卡死。
      // opts.timeoutMs 仅供测试注入短超时，生产默认 3000ms。
      timer = setTimeout(() => disableWorker(true), (opts && opts.timeoutMs) || TIMEOUT_MS)
      if (!post(seed, floor)) finish(null)
    })
  }

  /* Worker 是否可用：main.js 据此决定开局走异步还是同步。
   * 同步路径很重要——file:// 双击、DOM 桩、旧浏览器都不该把开局塞进微任务，
   * 否则「点击开始 → 立刻可用」的既有语义会被破坏。 */
  function enabled() {
    return ensureWorker() !== null
  }
  function generateSync(seed, floor) {
    return take(seed, floor) || syncGen(seed, floor)
  }

  window.EchoPrefetch = {
    request,
    take,
    generate,
    generateSync,
    enabled,
    stats: () => Object.assign({ enabled: !broken && !!worker, cached: cache.size }, stats),
  }
})()
