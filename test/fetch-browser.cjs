/* 手动下载 Chrome for Testing（绕过 playwright 安装器的管道子进程限制） */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const VER = '151.0.7922.34';
const urls = [
  `https://cdn.playwright.dev/builds/cft/${VER}/win64/chrome-win64.zip`,
  `https://storage.googleapis.com/chrome-for-testing-public/${VER}/win64/chrome-win64.zip`,
];
const dest = process.argv[2] || path.join(__dirname, '..', 'chrome-win64.zip');

function get(url, redirects) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      const total = Number(res.headers['content-length'] || 0);
      let done = 0;
      const ws = fs.createWriteStream(dest);
      res.on('data', (c) => { done += c.length; if (total && Math.floor(done / total * 10) !== Math.floor((done - c.length) / total * 10)) console.log(`  ${Math.round(done / 1e6)}MB / ${Math.round(total / 1e6)}MB`); });
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve()));
      ws.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  let lastErr;
  for (const u of urls) {
    try {
      console.log('下载:', u.split('/')[2], '...');
      await get(u, 0);
      const sz = fs.statSync(dest).size;
      if (sz < 50e6) throw new Error('文件过小 ' + sz);
      console.log(`✓ 下载完成 ${(sz / 1e6).toFixed(1)}MB → ${dest}`);
      process.exit(0);
    } catch (e) { lastErr = e; console.log('✗', e.message); }
  }
  process.exit(1);
})();
