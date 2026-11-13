/* 《回声之塔》UI 文案国际化护栏
 *
 * UI 文案靠散落在各处的 `en ? 'English' : '中文'` 三元维护（约 57 处），
 * 曾出现英文模式下仍弹中文 toast。本测试静态扫描 UI 层源码：凡含中文字符串
 * 字面量的行，其向前 8 行窗口内必须存在英文分支或字典调用标记。
 * 窗口是为了容忍跨行三元（中文常写在 `: \`...\`` 第二支，标记在上一行）。
 * 纯静态检查，不启动浏览器；数据表与 i18n.js 字典本身不在扫描范围。
 *
 * 运行： node test/i18n.test.cjs
 */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const FILES = ['js/ui.js', 'js/main.js', 'js/render.js']
const WINDOW = 8
/* `en` 常单独占一行、问号在下一行，故用 \s* 允许跨行 */
const HAS_EN_BRANCH = /\ben\s*\?|isEN\(\)|LANG\(\)\.t\(|\bL\.t\(|\bL\.tr\(/
const CJK = /[\u4e00-\u9fff]/

const misses = []
let scanned = 0
for (const rel of FILES) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) return // 注释
    if (!CJK.test(line)) return
    const literals = [...line.matchAll(/['"`]([^'"`]*[\u4e00-\u9fff][^'"`]*)['"`]/g)]
    if (!literals.length) return
    scanned++
    const ctx = lines.slice(Math.max(0, i - WINDOW), i + 1).join('\n')
    if (HAS_EN_BRANCH.test(ctx)) return
    misses.push(
      `${rel}:${i + 1} → ${literals
        .map((m) => m[1])
        .join(' | ')
        .slice(0, 70)}`,
    )
  })
}

console.log('—————————————————————————————')
console.log(`扫描 ${FILES.length} 个 UI 文件 · 含中文字符串 ${scanned} 处 · 未翻译 ${misses.length} 处`)
if (misses.length) {
  for (const m of misses) console.error('  ✗ ' + m)
  process.exit(1)
}
console.log('✓ UI 文案国际化护栏全部通过')
