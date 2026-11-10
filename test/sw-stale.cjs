/* 《回声之塔》SW 发布陈旧回归（真浏览器）
 *
 * 背景：CACHE 名只由 ASSETS「清单」派生，JS/CSS 文件名不带内容哈希。
 * 只改文件内容时 sw.js 字节不变 → 浏览器不触发 SW update → install 不重跑，
 * 旧的 stale-while-revalidate（cached || network）会让第一次 reload 仍执行旧脚本，
 * 形成「新 index.html + 旧 js」的混版本窗口，且零控制台错误、用户无感知。
 *
 * 本测试在项目临时副本上模拟一次「只改内容、不改清单」的发布，断言
 * 第一次 reload 就拿到新脚本；顺带确认离线回落仍可用。不改动原仓库文件。
 * 运行： node test/sw-stale.cjs
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const PORT = 8767
let pass = 0
const fails = []
function ok(cond, msg) {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fails.push(msg)
    console.log('  ✗ ' + msg)
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

async function main() {
  // 从 sw.js 单一事实源读取 ASSETS，清单新增资源时本测试自动跟随
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  const block = sw.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error('sw.js 中未找到 ASSETS 数组')
  const assets = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])

  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-sw-stale-'))
  try {
    // SW 不缓存自身，故 sw.js 不在 ASSETS 里，需单独复制
    for (const a of [...assets, './sw.js']) {
      const rel = a === './' ? 'index.html' : a.replace(/^\.\//, '')
      const src = path.join(ROOT, rel)
      if (!fs.existsSync(src)) throw new Error('ASSETS 列出的文件不存在：' + rel)
      const dst = path.join(TMP, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
    }

    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (p === '/') p = '/index.html'
      const f = path.join(TMP, p)
      if (!path.resolve(f).startsWith(path.resolve(TMP)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
      fs.createReadStream(f).pipe(res)
    })
    await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

    const browser = await chromium.launch({ headless: true })
    try {
      const ctx = await browser.newContext({ serviceWorkers: 'allow' })
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', (e) => errs.push(e.message))
      page.on('requestfailed', (r) => errs.push('REQ ' + r.url() + ' ' + (r.failure() || {}).errorText))
      page.on('response', (r) => {
        if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url())
      })
      const url = `http://127.0.0.1:${PORT}/`

      await page.goto(url, { waitUntil: 'load' })
      try {
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 })
        ok(true, 'SW 首次安装并接管页面')
      } catch (e) {
        console.error('  [诊断] 请求/页面错误 ' + JSON.stringify(errs.slice(0, 8)))
        throw e
      }

      // 模拟发布：只改 JS 内容，ASSETS 清单与 sw.js 一字不动
      const corePath = path.join(TMP, 'js', 'core.js')
      fs.appendFileSync(corePath, '\nwindow.__SW_V2__ = true;\n')

      await page.reload({ waitUntil: 'load' })
      ok(await page.evaluate(() => !!window.__SW_V2__), '第 1 次 reload 就执行新 core.js（无陈旧窗口）')

      // network-first 不能以牺牲离线为代价
      await ctx.setOffline(true)
      await page.reload({ waitUntil: 'load' })
      ok(await page.evaluate(() => !!document.getElementById('stage')), '断网 reload 仍能回落缓存打开页面')
      await ctx.setOffline(false)
      ok(errs.length === 0, `页面零错误（实际 ${errs.length} 条）`)
      await ctx.close()
    } finally {
      await browser.close()
      server.close()
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true })
  }
}

main()
  .then(() => {
    console.log('—————————————————————————————')
    if (fails.length) {
      console.error(`✗ ${fails.length} 项失败`)
      process.exit(1)
    }
    console.log(`✓ SW 发布陈旧回归全部通过（${pass} 项）`)
  })
  .catch((e) => {
    console.error('✗ 测试异常：', e.message)
    process.exit(1)
  })
