/* 《回声之塔》渲染性能护栏（真浏览器）
 *
 * 背景：曾把「小地图每帧全量遍历」列为中优先级优化，实测 F100（1344 格）
 * 单次 drawMinimap 仅 ~0.09ms（约 0.5% 帧预算），不是瓶颈，因此不做离屏缓存
 * 与脏标记（避免引入失效状态）。本测试只设宽松上限，防止后续改动把它写成
 * O(n²) 或塞进昂贵操作；不追求微基准的精确排名。
 *
 * 运行： node test/perf.cjs
 */
'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const PORT = 8768
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}
let pass = 0
const fails = []
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fails.push(msg)
    console.log('  ✗ ' + msg)
  }
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const f = path.join(ROOT, p)
  fs.readFile(f, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
    res.end(data)
  })
})

async function main() {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    const rows = await page.evaluate(() => {
      const measure = (floor) => {
        const g = window.EchoGame.create({ seed: 4242, floor, classId: 'knight' })
        const cv = document.createElement('canvas')
        cv.width = 220
        cv.height = 130
        const ctx = cv.getContext('2d')
        const N = 400
        for (let i = 0; i < 30; i++) window.EchoRender.drawMinimap(ctx, g, cv)
        const t0 = performance.now()
        for (let i = 0; i < N; i++) window.EchoRender.drawMinimap(ctx, g, cv)
        return { floor, cells: g.level.w * g.level.h, ms: (performance.now() - t0) / N }
      }
      return [measure(1), measure(50), measure(100)]
    })
    for (const r of rows) {
      console.log(`  · F${r.floor} (${r.cells} 格) ${r.ms.toFixed(4)} ms/次`)
      ok(r.ms < 1, `F${r.floor} 单次耗时 ${r.ms.toFixed(4)}ms < 1ms 护栏`)
    }
  } finally {
    await browser.close()
    server.close()
  }
}

main()
  .then(() => {
    console.log('—————————————————————————————')
    if (fails.length) {
      console.error(`✗ ${fails.length} 项失败`)
      process.exit(1)
    }
    console.log(`✓ 渲染性能护栏全部通过（${pass} 项）`)
  })
  .catch((e) => {
    console.error('✗ 测试异常：', e.message)
    server.close()
    process.exit(1)
  })
