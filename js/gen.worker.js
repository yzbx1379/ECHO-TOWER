/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/gen.worker.js
 * 楼层预生成 Worker。只加载 data.js + gen.js（二者 UMD 以 self 为 root），
 * 不加载任何 DOM 相关模块；主线程封装见 js/prefetch.js。
 *
 * 注意：本文件由 new Worker('./js/gen.worker.js') 加载，不出现在 index.html
 * 的 <script> 列表中，但必须进 sw.js 的 ASSETS 才能离线可用
 * （test/static.test.cjs 用 CACHE_ONLY 白名单校验这一点）。
 * ========================================================================= */
'use strict';
/* data.js / gen.js 的 UMD 取 `typeof self !== 'undefined' ? self : this` 为 root，
 * Worker 中 self 即全局对象；补 window 别名以兼容将来可能出现的引用。 */
self.window = self;
self.importScripts('./data.js', './gen.js');

self.onmessage = (e) => {
  const msg = e.data || {};
  const seed = msg.seed, floor = msg.floor;
  try {
    const level = self.EchoGen.generateFloor(seed, floor, {});
    self.postMessage({ seed, floor, ok: true, level });
  } catch (err) {
    // 生成失败也要回消息，否则主线程的首层 Promise 只能等超时兜底
    self.postMessage({ seed, floor, ok: false, error: String((err && err.message) || err) });
  }
};
