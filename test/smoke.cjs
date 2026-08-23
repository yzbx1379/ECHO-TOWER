/* 《回声之塔》浏览器冒烟测试（Playwright 直连版）
 * 浏览器：已下载的 Chrome for Testing（.pw-browsers/chrome-win64/chrome.exe）
 * 沙箱内无法运行（多进程管道受限），需授权后执行或用户本机运行。
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME = path.join(__dirname, '..', '.pw-browsers', 'chrome-win64', 'chrome.exe');
const URL_ = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const shot = (n) => path.join(__dirname, `shot_${n}.png`);

(async () => {
  const errors = [];
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL_);
  await page.waitForTimeout(1500);
  console.log('标题界面可见:', await page.locator('.title-name').isVisible());
  await page.screenshot({ path: shot('1_title') });

  const startBtn = page.locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ }).first();
  await startBtn.click();
  await page.waitForTimeout(400);
  console.log('职业数量:', await page.locator('.class-card').count());
  await page.screenshot({ path: shot('2_class') });
  await page.locator('.class-card', { hasText: /守塔骑士|Warden/ }).first().click();
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
  console.log('步数:', (await page.locator('#hud-steps').innerText()).replace(/\s+/g, ' '));
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
    process.exit(1);
  }
  console.log('✓ 浏览器冒烟测试通过，无控制台错误');
})().catch((e) => { console.error('✗ 测试异常:', e.message); process.exit(1); });
