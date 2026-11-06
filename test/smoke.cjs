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
 *   8. 灰度滤镜（真实画面亮度层次 + 门/板组号徽记局部对比度，留截图）
 *   9. 多分辨率（390×844 / 768×1024 / 1920×1080）
 *  10. 触屏虚拟按键（方向 + 动作事件进入输入泵）
 * ========================================================================= */
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const PORT = 8765
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

// 极简静态文件服务器（零第三方依赖）
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let fp = path.join(ROOT, decodeURIComponent(url.pathname))
  if (url.pathname === '/' || url.pathname === '') fp = path.join(ROOT, 'index.html')
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403)
    res.end()
    return
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('404 ' + url.pathname)
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' })
    res.end(data)
  })
})

let pass = 0,
  fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fail++
    console.log('  ✗ ' + msg)
  }
}

;(async () => {
  await new Promise((r) => server.listen(PORT, r))
  console.log('HTTP server → http://localhost:' + PORT + '/')

  const errors = []
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  // ── 1. 标题界面加载
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForSelector('.title-name', { timeout: 5000 })
  ok(true, '标题界面加载完成')

  // ── 2. PWA manifest
  const href = await page.locator('link[rel="manifest"]').first().getAttribute('href')
  ok(!!href, 'manifest link: ' + href)
  const manifest = await page.evaluate(() => fetch('./manifest.webmanifest').then((r) => r.json()))
  ok(!!manifest.name, 'manifest name: ' + manifest.name)
  ok(manifest.display === 'standalone', 'manifest display: standalone')

  // ── 3. Service Worker 注册（reload 让 SW 安装并控制页面）
  await page.reload()
  await page.waitForSelector('.title-name', { timeout: 5000 })
  await page.waitForTimeout(1500) // SW install + skipWaiting + activate
  // 直接回传字符串：ServiceWorkerRegistration 跨进程序列化会丢失原型上的 scope，
  // 旧写法只能断言非空、日志却显示 undefined，无法核验注册到了哪个 scope。
  const swScope = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration()
    return r ? r.scope : null
  })
  ok(!!swScope, 'SW registered: ' + (swScope || 'N/A'))

  // ── 3.5 Worker 预生成：结果必须与主线程同步生成逐字段一致（确定性）
  const pf = await page.evaluate(async () => {
    if (!window.EchoPrefetch) return { available: false }
    const seed = 12345,
      floor = 7
    const fromWorker = await window.EchoPrefetch.generate(seed, floor)
    const direct = window.EchoGen.generateFloor(seed, floor, {})
    const same =
      !!fromWorker &&
      !!direct &&
      fromWorker.w === direct.w &&
      fromWorker.h === direct.h &&
      fromWorker.floor === direct.floor &&
      fromWorker.minSteps === direct.minSteps &&
      fromWorker.biomeId === direct.biomeId &&
      JSON.stringify(fromWorker.spawn) === JSON.stringify(direct.spawn) &&
      JSON.stringify(fromWorker.shards) === JSON.stringify(direct.shards) &&
      fromWorker.grid.length === direct.grid.length &&
      fromWorker.grid.every((v, i) => v === direct.grid[i])
    return { available: true, same, stats: window.EchoPrefetch.stats() }
  })
  ok(pf.available, 'EchoPrefetch 已挂载')
  ok(pf.same === true, 'Worker 生成的层与主线程同步生成逐字段一致（确定性）')
  ok(pf.stats && pf.stats.enabled === true, `Worker 路径已启用: ${JSON.stringify(pf.stats)}`)

  // ── 4. 开局 → 选职业
  const startBtn = page.locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ }).first()
  await startBtn.click()
  await page.waitForTimeout(400)
  const classCount = await page.locator('.class-card').count()
  ok(classCount >= 3, '职业卡片数量: ' + classCount)
  await page
    .locator('.class-card', { hasText: /守塔骑士|Warden/ })
    .first()
    .click()
  await page.waitForTimeout(1500)

  // ── 5. HUD + 楼层
  ok(await page.locator('#hud').isVisible(), 'HUD 可见')
  const floorText = (await page.locator('#hud-floor').innerText()).replace(/\s+/g, ' ')
  ok(/第\s*\d+|Floor\s*\d+/i.test(floorText), '楼层显示: ' + floorText)

  // ── 6. 键盘移动 12 步
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(keys[i % 4])
    await page.waitForTimeout(90)
  }
  if (await page.locator('.draft-card').count()) {
    await page.locator('.draft-card').first().click()
    await page.waitForTimeout(300)
  }
  const steps = (await page.locator('#hud-steps').innerText()).replace(/\s+/g, ' ')
  ok(/\d/.test(steps), '步数: ' + steps)

  // ── 7. 暂停菜单
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  ok(await page.locator('.pause-box').isVisible(), '暂停菜单可见')

  // ── 8. 灰度滤镜（色盲友好实测）：真实画面 + 门/压力板徽记专项探针
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await c.newPage()
    await p.goto(`http://localhost:${PORT}/`)
    await p.waitForSelector('.title-name', { timeout: 5000 })
    await p
      .locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ })
      .first()
      .click()
    await p.waitForTimeout(300)
    await p
      .locator('.class-card', { hasText: /守塔骑士|Warden/ })
      .first()
      .click()
    await p.waitForTimeout(1200)
    await p.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' })
    await p.waitForTimeout(200)

    // 8a. 真实画面：把 Canvas 像素按 luma 公式灰度化，统计亮度层次
    const gray = await p.evaluate(() => {
      const cv = document.getElementById('game')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      const hist = new Array(32).fill(0)
      let min = 255,
        max = 0,
        n = 0
      for (let i = 0; i < d.length; i += 4 * 41) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        hist[Math.min(31, Math.floor(l / 8))]++
        if (l < min) min = l
        if (l > max) max = l
        n++
      }
      return {
        min: Math.round(min),
        max: Math.round(max),
        spread: Math.round(max - min),
        levels: hist.filter((x) => x > n * 0.0005).length,
        sampled: n,
        marks: [0, 1, 2, 3].map((g) => window.EchoRender.groupMark(g)).join(''),
      }
    })
    ok(
      gray.levels >= 8 && gray.spread >= 100,
      `灰度后画面仍有亮度层次: levels=${gray.levels} spread=${gray.spread} (采样 ${gray.sampled}px)`,
    )
    ok(gray.marks === '1234', `灰度侧分组标记仍为可辨数字: ${gray.marks}`)
    await p.screenshot({ path: path.join(ROOT, 'test', 'shot_grayscale.png') })
    ok(fs.existsSync(path.join(ROOT, 'test', 'shot_grayscale.png')), '灰度画面截图 test/shot_grayscale.png')

    // 8b. 专项探针：把一对 GATE/PLATE 放到出生点旁，单独渲染到 canvas，
    //     量化「组号白字 + 深色底板」在灰度后的局部亮度差（数字可读性的硬证据）
    const badge = await p.evaluate(() => {
      const T = window.EchoGen.T
      const g = window.EchoGame.create({ seed: 4242, floor: 1, classId: 'knight' })
      const L = g.level
      const s = L.spawn
      const cand = []
      for (let y = s.y - 3; y <= s.y + 3; y++) {
        for (let x = s.x - 3; x <= s.x + 3; x++) {
          if (g.inBounds(x, y) && g.tileAt(x, y) === T.FLOOR && !(x === s.x && y === s.y)) cand.push([x, y])
        }
      }
      if (cand.length < 2) return null
      const a = cand[0],
        b = cand[1]
      L.grid[g.idx(a[0], a[1])] = T.GATE
      L.gates.push({ x: a[0], y: a[1], group: 2, open: false, charge: 0, need: 2 })
      L.grid[g.idx(b[0], b[1])] = T.PLATE
      L.plates.push({ x: b[0], y: b[1], group: 2 })
      g.player.px = g.player.x
      g.player.py = g.player.y
      const cv = document.createElement('canvas')
      cv.id = 'gray-probe'
      cv.width = 720
      cv.height = 420
      cv.__dpr = 1
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;'
      document.body.appendChild(cv)
      const ctx = cv.getContext('2d')
      window.EchoCore.camera.snap(s.x * 36, s.y * 36)
      window.EchoRender.render(ctx, g, cv, 0)
      const camX = window.EchoCore.camera.x - cv.width / 2
      const camY = window.EchoCore.camera.y - cv.height / 2
      const bx = Math.max(0, Math.round(a[0] * 36 - camX))
      const by = Math.max(0, Math.round(a[1] * 36 - camY))
      const d = ctx.getImageData(bx, by, 36, 36).data
      let min = 255,
        max = 0
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        if (l < min) min = l
        if (l > max) max = l
      }
      return { min: Math.round(min), max: Math.round(max), spread: Math.round(max - min), group: '3' }
    })
    ok(
      !!badge && badge.spread >= 120,
      `灰度后组号徽记局部对比度: ${badge ? `min=${badge.min} max=${badge.max} spread=${badge.spread}` : '探针未构造成功'}`,
    )
    if (badge) {
      await p.locator('#gray-probe').screenshot({ path: path.join(ROOT, 'test', 'shot_grayscale_badge.png') })
      ok(
        fs.existsSync(path.join(ROOT, 'test', 'shot_grayscale_badge.png')),
        '徽记灰度截图 test/shot_grayscale_badge.png',
      )
    }
    await c.close()
  }

  // ── 9. 多分辨率：HUD / Canvas / 横向溢出 / 控制台
  for (const vp of [
    { name: '手机竖屏 390×844', width: 390, height: 844 },
    { name: '平板 768×1024', width: 768, height: 1024 },
    { name: '桌面 1920×1080', width: 1920, height: 1080 },
  ]) {
    const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const p = await c.newPage()
    const errs = []
    p.on('pageerror', (e) => errs.push(String(e)))
    p.on('console', (m) => {
      if (m.type() === 'error') errs.push(m.text())
    })
    await p.goto(`http://localhost:${PORT}/`)
    await p.waitForSelector('.title-name', { timeout: 5000 })
    await p
      .locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ })
      .first()
      .click()
    await p.waitForTimeout(300)
    await p
      .locator('.class-card', { hasText: /守塔骑士|Warden/ })
      .first()
      .click()
    await p.waitForTimeout(1000)
    const m = await p.evaluate(() => {
      const cv = document.getElementById('game')
      const hud = document.getElementById('hud')
      return {
        cw: cv.width,
        ch: cv.height,
        hudVisible: !!hud && !hud.classList.contains('hidden'),
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }
    })
    ok(
      m.cw > 0 && m.ch > 0 && m.hudVisible && m.scrollW <= m.clientW + 2 && errs.length === 0,
      `${vp.name}: canvas ${m.cw}×${m.ch}, HUD=${m.hudVisible}, 横向溢出=${m.scrollW - m.clientW}px, 错误=${errs.length}`,
    )
    await c.close()
  }

  // ── 10. 触屏：虚拟按键显示 + pointerdown 是否真的进入输入泵
  {
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    })
    const p = await c.newPage()
    const errs = []
    p.on('pageerror', (e) => errs.push(String(e)))
    p.on('console', (m) => {
      if (m.type() === 'error') errs.push(m.text())
    })
    await p.goto(`http://localhost:${PORT}/`)
    await p.waitForSelector('.title-name', { timeout: 5000 })
    await p
      .locator('#title-btns button', { hasText: /开始攀登|Start Climbing|新的一局|New Run/ })
      .first()
      .click()
    await p.waitForTimeout(300)
    await p
      .locator('.class-card', { hasText: /守塔骑士|Warden/ })
      .first()
      .click()
    await p.waitForTimeout(1000)
    const pads = await p.evaluate(() => {
      const tp = document.getElementById('touch-pad')
      const ap = document.getElementById('action-pad')
      window.__vbtn = []
      window.addEventListener('echo-vbtn', (e) => window.__vbtn.push(e.detail.action))
      return {
        touchVisible: !!tp && !tp.classList.contains('hidden'),
        actionVisible: !!ap && !ap.classList.contains('hidden'),
        dirs: tp ? tp.querySelectorAll('button[data-act]').length : 0,
        acts: ap ? ap.querySelectorAll('button[data-act]').length : 0,
      }
    })
    ok(
      pads.touchVisible && pads.actionVisible && pads.dirs >= 4 && pads.acts >= 3,
      `触屏虚拟按键: 方向 ${pads.dirs} / 动作 ${pads.acts}, 可见 ${pads.touchVisible && pads.actionVisible}`,
    )
    await p.locator('#touch-pad button[data-act="right"]').tap()
    await p.locator('#action-pad button[data-act="wait"]').tap()
    await p.waitForTimeout(300)
    const fired = await p.evaluate(() => window.__vbtn.slice())
    ok(
      fired.includes('right') && fired.includes('wait') && errs.length === 0,
      `触屏事件进入输入泵: [${fired.join(', ')}], 错误=${errs.length}`,
    )
    await c.close()
  }

  await browser.close()
  server.close()

  // ── 汇总
  console.log('-'.repeat(40))
  if (errors.length) {
    console.error('控制台错误:')
    for (const e of errors.slice(0, 10)) console.error('  ' + e.slice(0, 200))
    fail++
  } else {
    ok(true, '控制台零错误')
  }
  console.log(pass + ' 项通过 / ' + (pass + fail) + ' 项总计')
  if (fail) process.exit(1)
})().catch((e) => {
  console.error('测试异常: ' + e.message)
  server.close()
  process.exit(1)
})
