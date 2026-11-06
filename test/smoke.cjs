/* =========================================================================
 * 《回声之塔 ECHO TOWER》浏览器冒烟测试（Playwright，CI 兼容）
 *
 * 用法:
 *   本地: npm run smoke:browser
 *   CI:   npx playwright install --with-deps chromium && npm run smoke:browser
 *
 * 覆盖项:
 *   1. 标题界面加载（HTTP 协议，非 file://）
 *   2. PWA manifest 有效性
 *   3. Service Worker 注册与控制
 *   4. 开局选职业 → HUD/楼层渲染
 *   5. 键盘移动 + 天赋触发
 *   6. 暂停菜单
 *   7. 控制台零错误
 * ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

// 极简静态文件服务器（零第三方依赖）
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let fp = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') fp = path.join(ROOT, 'index.html');
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 ' + url.pathname); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  console.log('HTTP server → http://localhost:' + PORT + '/');

  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  // ── 1. 标题界面加载
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.title-name', { timeout: 5000 });
  ok(true, '标题界面加载完成');

  // ── 2. PWA manifest
  const href = await page.locator('link[rel="manifest"]').first().getAttribute('href');
  ok(!!href, 'manifest link: ' + href);
  const manifest = await page.evaluate(() => fetch('./manifest.webmanifest').then(r => r.json()));
  ok(!!manifest.name, 'manifest name: ' + manifest.name);
  ok(manifest.display === 'standalone', 'manifest display: standalone');

  // ── 3. Service Worker 注册（reload 让 SW 安装并控制页面）
  await page.reload();
  await page.waitForSelector('.title-name', { timeout: 5000 });
  await page.waitForTimeout(1500); // SW install + skipWaiting + activate
  // 直接回传字符串：ServiceWorkerRegistration 跨进程序列化会丢失原型上的 scope，
  // 旧写法只能断言非空、日志却显示 undefined，无法核验注册到了哪个 scope。
  const swScope = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? r.scope : null;
  });
  ok(!!swScope, 'SW registered: ' + (swScope || 'N/A'));

  // ── 4. 开局 → 选职业
  const startBtn = page.locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ }).first();
  await startBtn.click();
  await page.waitForTimeout(400);
  const classCount = await page.locator('.class-card').count();
  ok(classCount >= 3, '职业卡片数量: ' + classCount);
  await page.locator('.class-card', { hasText: /守塔骑士|Warden/ }).first().click();
  await page.waitForTimeout(1500);

  // ── 5. HUD + 楼层
  ok(await page.locator('#hud').isVisible(), 'HUD 可见');
  const floorText = (await page.locator('#hud-floor').innerText()).replace(/\s+/g, ' ');
  ok(/第\s*\d+|Floor\s*\d+/i.test(floorText), '楼层显示: ' + floorText);

  // ── 6. 键盘移动 12 步
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(keys[i % 4]);
    await page.waitForTimeout(90);
  }
  if (await page.locator('.draft-card').count()) {
    await page.locator('.draft-card').first().click();
    await page.waitForTimeout(300);
  }
  const steps = (await page.locator('#hud-steps').innerText()).replace(/\s+/g, ' ');
  ok(/\d/.test(steps), '步数: ' + steps);

  // ── 7. 暂停菜单
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.locator('.pause-box').isVisible(), '暂停菜单可见');

  await browser.close();
  server.close();

  // ── 汇总
  console.log('-'.repeat(40));
  if (errors.length) {
    console.error('控制台错误:');
    for (const e of errors.slice(0, 10)) console.error('  ' + e.slice(0, 200));
    fail++;
  } else {
    ok(true, '控制台零错误');
  }
  console.log(pass + ' 项通过 / ' + (pass + fail) + ' 项总计');
  if (fail) process.exit(1);
})().catch(e => {
  console.error('测试异常: ' + e.message);
  server.close();
  process.exit(1);
});
