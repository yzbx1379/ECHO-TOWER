/* 《回声之塔》浏览器冒烟测试（CDP 版）
 * 沙箱友好：以 stdio:'ignore' 派生系统 Edge（headless），经 CDP 端口连接。 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const EDGE = path.join(__dirname, '..', '.pw-browsers', 'chrome-win64', 'chrome.exe');
const PROFILE = path.join(__dirname, '..', '.edge-profile');
const PORT = 9333;
const URL_ = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const shot = (n) => path.join(__dirname, `shot_${n}.png`);

function waitOk(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function cdpReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get({ host: '127.0.0.1', port: PORT, path: '/json/version' }, (r) => {
          let s = ''; r.on('data', (c) => (s += c)); r.on('end', () => res(s));
        }).on('error', rej);
      });
      if (data.includes('webSocketDebuggerUrl')) return JSON.parse(data).webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    await waitOk(500);
  }
  throw new Error('Edge CDP 端口未就绪');
}

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore', detached: false });

  try {
    const wsUrl = await cdpReady();
    console.log('✓ Edge 已启动，CDP 就绪');
    const browser = await chromium.connectOverCDP(wsUrl);
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL_);
    await page.waitForTimeout(1500);
    console.log('标题界面可见:', await page.locator('.title-name').isVisible());
    await page.screenshot({ path: shot('1_title') });

    await page.locator('#title-btns button', { hasText: /开始攀登|新的一局/ }).first().click();
    await page.waitForTimeout(400);
    console.log('职业数量:', await page.locator('.class-card').count());
    await page.screenshot({ path: shot('2_class') });
    await page.locator('.class-card', { hasText: '守塔骑士' }).click();
    await page.waitForTimeout(1200);

    console.log('HUD 可见:', await page.locator('#hud').isVisible());
    console.log('楼层:', await page.locator('#hud-floor').innerText());
    await page.screenshot({ path: shot('3_floor1') });

    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(keys[i % 4]);
      await page.waitForTimeout(90);
    }
    if (await page.locator('.draft-card').count()) {
      console.log('触发三选一天赋，选择第一张');
      await page.screenshot({ path: shot('4_draft') });
      await page.locator('.draft-card').first().click();
      await page.waitForTimeout(300);
    }
    console.log('步数显示:', (await page.locator('#hud-steps').innerText()).replace(/\s+/g, ' '));
    console.log('金币:', await page.locator('#hud-gold').innerText());
    await page.screenshot({ path: shot('5_gameplay') });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log('暂停菜单可见:', await page.locator('.pause-box').isVisible());
    await page.screenshot({ path: shot('6_pause') });

    await browser.close();
    console.log('-'.repeat(40));
    if (errors.length) {
      console.error('✗ 控制台错误:');
      for (const e of errors.slice(0, 10)) console.error('  ', e.slice(0, 200));
      process.exitCode = 1;
    } else {
      console.log('✓ 浏览器冒烟测试通过，无控制台错误');
    }
  } finally {
    try { proc.kill(); } catch (e) {}
  }
})().catch((e) => { console.error('✗ 测试异常:', e.message); process.exit(1); });
