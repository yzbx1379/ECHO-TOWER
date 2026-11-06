/* 《回声之塔》静态资源一致性测试
 * sw.js 的 ASSETS 是手写的离线预缓存清单——新增 js/css 时漏一项，
 * 安装成 PWA 后离线启动就会白屏（且开发时 HTTPS 在线不易复现）。
 * 本测试把「index.html 实际引用的同源资源」与「ASSETS」双向比对，
 * 并校验清单与 manifest 图标在磁盘上真实存在。零依赖，纯 Node。
 * 运行： node test/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else fails.push(msg);
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
/* 路径归一：去掉 ./ 前缀与 query/hash，统一分隔符 */
function norm(p) {
  return String(p).replace(/^\.\//, '').replace(/[?#].*$/, '').replace(/\\/g, '/');
}

const html = read('index.html');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

/* ---- 1. 提取 index.html 引用的同源资源 ---- */
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
  const raw = m[1];
  if (/^(https?:)?\/\//i.test(raw) || /^(data:|#|mailto:)/i.test(raw)) continue; // 外部/内联跳过
  refs.add(norm(raw));
}
ok(refs.size >= 12, `index.html 同源引用数偏少（${refs.size}），解析是否失效`);

/* ---- 2. 提取 sw.js 的 ASSETS 数组 ---- */
const block = sw.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/);
ok(!!block, 'sw.js 中未找到 ASSETS 数组');
const assets = block ? [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => norm(x[1])) : [];
ok(assets.length >= 10, `ASSETS 项数偏少（${assets.length}）`);

/* ---- 3. 双向比对 ---- */
const cacheSet = new Set(assets);
for (const r of refs) {
  ok(cacheSet.has(r), `index.html 引用了 ${r}，但 sw.js ASSETS 未缓存 → 离线会缺文件`);
}
for (const a of assets) {
  if (a === '' || a === 'index.html') continue; // './' 与入口页
  ok(exists(a), `sw.js ASSETS 列出了不存在的文件：${a}`);
  ok(refs.has(a), `sw.js 缓存了 ${a}，但 index.html 未引用（陈旧项，建议清理）`);
}

/* ---- 4. manifest 图标存在性 ---- */
ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest 缺少 icons');
for (const ic of (manifest.icons || [])) {
  ok(exists(norm(ic.src)), `manifest 图标不存在：${ic.src}`);
  ok(cacheSet.has(norm(ic.src)), `manifest 图标 ${ic.src} 未进离线缓存`);
}

/* ---- 5. 关键交付文件齐全 ---- */
for (const f of ['index.html', 'css/style.css', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'og.svg']) {
  ok(exists(f), `交付文件缺失：${f}`);
}

/* ---- 结果 ---- */
console.log('—————————————————————————————');
console.log(`同源引用 ${refs.size} 项 · 预缓存清单 ${assets.length} 项 · 断言通过 ${pass}/${pass + fails.length}`);
if (fails.length) {
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('✓ 静态资源一致性测试全部通过');
