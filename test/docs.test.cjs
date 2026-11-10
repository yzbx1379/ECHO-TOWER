/* 《回声之塔》文档口径护栏
 *
 * 项目里多处数字（测试项数、lint 结果、门禁状态）靠手工同步 README / plan，
 * 历史上出现过「format:check 非门禁」与「已入 CI」自相矛盾。本测试把关键口径
 * 与源码实际断言数绑定，防止文案漂移；纯静态检查，不重复执行任何测试。
 *
 * 运行： node test/docs.test.cjs
 */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const readme = read('README.md')
const plan = read('plan.md')
let pass = 0
const fails = []
const ok = (cond, msg) => {
  if (cond) pass++
  else fails.push(msg)
}

/* 1. 明确废弃的口径短语，任何文档都不该再出现 */
const STALE = [
  'format:check 不作为门禁',
  'format:check 非门禁',
  '27 条存量 warning',
  '不单独放 `LICENSE.md`',
  '仍建议真实设备',
  '灰度待人工复检',
]
for (const s of STALE) ok(!readme.includes(s) && !plan.includes(s), `不含过时口径「${s}」`)

/* 2. README 提到的测试脚本必须真实存在 */
const mentioned = [...new Set([...readme.matchAll(/test\/([A-Za-z0-9._-]+\.(?:cjs|js))/g)].map((m) => m[1]))]
ok(mentioned.length > 0, `README 引用了 ${mentioned.length} 个测试脚本`)
for (const f of mentioned) ok(fs.existsSync(path.join(ROOT, 'test', f)), `README 引用的 test/${f} 存在`)

/* 3. N/N 断言格式：分子分母必须相等。
 * 排除三连写法（dom-stub 的 56/68/68）与「2/3 屏幕」这类比例（小于 10）。 */
const testSection = readme.slice(readme.indexOf('## 🧪 测试'), readme.indexOf('## 🐞 调试模式'))
ok(testSection.length > 100, 'README 能定位到「测试」章节')
for (const m of testSection.matchAll(/\b(\d+)\/(\d+)\b(?!\/\d)/g)) {
  if (Number(m[1]) < 10) continue
  ok(m[1] === m[2], `README 测试章节中 ${m[0]} 分子分母一致`)
}

/* 4. 源码断言数护栏。
 * combat / echo 每个断言都是一次 ok( 调用，静态计数准确；
 * smoke.cjs 的断言分布在不同浏览器阶段且有循环，ok( 数 ≠ 实际项数，
 * 因此只对它校验「N/N 存在且量级合理」，不假装有精确绑定。 */
const okCalls = (f) => (read('test/' + f).match(/\bok\(/g) || []).length
for (const [file, label] of [
  ['combat.test.cjs', 'combat'],
  ['echo.test.cjs', 'echo'],
]) {
  const n = okCalls(file)
  ok(new RegExp(`\\b${n}\\s*项`).test(readme), `README 声明 ${label} ${n} 项（与 ${file} 的 ok( 数一致）`)
}
const smokeDeclared = [...readme.matchAll(/smoke[^\n]{0,40}?(\d+)\/(\d+)/gi)].map((m) => +m[1])
ok(
  smokeDeclared.length > 0 && Math.max(...smokeDeclared) >= 20,
  `README 声明 smoke N/N 且项数 ≥ 20（实际 ${smokeDeclared.join('/') || '无'}）`,
)

/* 5. smoke.cjs 止损：不再往单会话脚本里堆新探针（新增一律独立文件） */
const smokeLines = read('test/smoke.cjs').split('\n').length
ok(smokeLines <= 500, `smoke.cjs ${smokeLines} 行 ≤ 500（新增浏览器探针应走独立文件）`)

/* 6. 关键章节与许可文件 */
ok(/## .*许可与来源/.test(readme), 'README 有「许可与来源」章节')
ok(/\]\(LICENSE\)/.test(readme) && fs.existsSync(path.join(ROOT, 'LICENSE')), 'README 链接的 LICENSE 文件存在')
ok(/## 变更记录/.test(plan), 'plan.md 有变更记录章节')

console.log('—————————————————————————————')
console.log(`文档口径护栏：断言通过 ${pass}/${pass + fails.length}`)
if (fails.length) {
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('✓ 文档口径护栏全部通过')
