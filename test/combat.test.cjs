/* 《回声之塔》战斗 / 伤害 / 死亡 / 复活回归
 * 与 sim.test.cjs 的分工：sim 把玩家设成 9999 HP，只验证「逻辑链路与可达性」，
 * 完全覆盖不到血量结算；本文件一律用真实基础 HP（骑士 8 / 默认 6），
 * 逐分支验证 damagePlayer 的减伤、闪避、免伤、复活与 onGameOver 结算。
 *
 * 运行： node test/combat.test.cjs
 */
'use strict'
const path = require('path')

global.window = global
global.self = global
global.localStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] || null
  },
  setItem(k, v) {
    this._d[k] = String(v)
  },
  removeItem(k) {
    delete this._d[k]
  },
}

window.EchoData = require(path.join(__dirname, '..', 'js', 'data.js'))
window.EchoGen = require(path.join(__dirname, '..', 'js', 'gen.js'))
require(path.join(__dirname, '..', 'js', 'core.js'))
require(path.join(__dirname, '..', 'js', 'audio.js'))
require(path.join(__dirname, '..', 'js', 'entities.js'))
require(path.join(__dirname, '..', 'js', 'systems.move.js'))
require(path.join(__dirname, '..', 'js', 'systems.combat.js'))
require(path.join(__dirname, '..', 'js', 'systems.hazards.js'))
require(path.join(__dirname, '..', 'js', 'systems.echo.js'))
require(path.join(__dirname, '..', 'js', 'systems.progress.js'))
require(path.join(__dirname, '..', 'js', 'systems.js'))

let pass = 0,
  fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fail++
    console.error('  ✗ ' + msg)
  }
}

/* 造一局真实 HP 的游戏。清掉职业自带遗物，保证 relicIds 精确可控。 */
function makeGame(opts) {
  opts = opts || {}
  const calls = { over: 0, toasts: [], summary: null }
  const g = window.EchoGame.create({
    seed: 4242,
    floor: 1,
    classId: opts.classId || 'knight',
    relicIds: (opts.relicIds || []).slice(),
    talentIds: (opts.talentIds || []).slice(),
    charms: (opts.charms || []).slice(),
    fx: {
      toast: (m) => calls.toasts.push(m),
      sfx() {},
      shake() {},
      burst() {},
      floatText() {},
      hitstop() {},
      flashTile() {},
      updateHUD() {},
      openDraft() {},
      openShop() {},
      onMusicBiome() {},
      onMusicIntensity() {},
      onFloorStart() {},
      onGameOver: (s) => {
        calls.over++
        calls.summary = s
      },
      onVictory() {},
    },
  })
  g.relicIds = (opts.relicIds || []).slice() // 去掉 startRelic（骑士的 thorns）
  g.recalcStats()
  g.player.hp = opts.hp != null ? opts.hp : g.player.maxHp
  g.invulnTurns = 0
  g.shadowUsed = false
  g.pendulumUsed = false
  return { g, calls }
}
/* 清掉上一击留下的无敌帧，模拟下一回合的一次独立伤害 */
const hit = (g, n, kind) => {
  g.invulnTurns = 0
  g.damagePlayer(n, kind || 'contact', null)
}

console.log('战斗 / 死亡 / 复活回归（真实 HP）')
{
  const { g } = makeGame()
  ok(g.player.maxHp === 8 && g.player.hp === 8, `骑士真实 HP ${g.player.hp}/${g.player.maxHp}（非 9999）`)
  hit(g, 2)
  ok(g.player.hp === 6, `基础接触伤害 2 点 → ${g.player.hp} HP`)
}
{
  const { g } = makeGame()
  hit(g, 2)
  const hp = g.player.hp
  g.damagePlayer(2, 'contact', null)
  ok(g.player.hp === hp, `同回合第二次接触伤害被 invulnTurns 挡下（${hp} HP 不变）`)
}
{
  const { g } = makeGame()
  g.invulnTurns = 1
  const hp = g.player.hp
  g.damagePlayer(1, 'echo', null)
  g.damagePlayer(1, 'water', null)
  ok(g.player.hp === hp - 2, `回声 / 水伤害无视无敌帧（${hp} → ${g.player.hp}）`)
}
{
  const { g } = makeGame()
  g.stats.armor = 2
  hit(g, 5)
  ok(g.player.hp === 5, `护甲 2 把 5 点伤害减为 3 → ${g.player.hp} HP`)
}
{
  const { g } = makeGame({ relicIds: ['shieldgen'] })
  hit(g, 5, 'explosion')
  ok(g.player.hp === 5, `防爆盾：爆炸 5 → ceil(5/2)=3 → ${g.player.hp} HP`)
}
{
  const { g } = makeGame({ relicIds: ['shieldgen'] })
  g.stats.laserHalf = true
  hit(g, 8, 'laser')
  ok(g.player.hp === 6, `防爆盾 + 偏振镜片叠加：激光 8 → 4 → 2 → ${g.player.hp} HP`)
}
{
  const { g } = makeGame({ relicIds: ['cunning'] })
  g.rng = () => 0.05
  const hp = g.player.hp
  hit(g, 3)
  ok(g.player.hp === hp, `蛇之狡诈 rng<0.1 完全闪避（${hp} HP 不变）`)
  g.rng = () => 0.9
  hit(g, 3)
  ok(g.player.hp === hp - 3, `rng>=0.1 时正常受伤 → ${g.player.hp} HP`)
}
{
  const { g } = makeGame({ classId: 'shadow' })
  const hp = g.player.hp
  hit(g, 3)
  ok(g.player.hp === hp && g.shadowUsed === true, `影行者每层首击免伤（${hp} HP 不变）`)
  hit(g, 3)
  ok(g.player.hp === hp - 3, `首击之后正常受伤 → ${g.player.hp} HP`)
}
{
  const { g, calls } = makeGame({ relicIds: ['pendulum'], hp: 2 })
  hit(g, 9)
  ok(g.player.hp === 1 && g.pendulumUsed === true, `不倒钟摆：致命伤保留 1 HP（实际 ${g.player.hp}）`)
  hit(g, 9)
  ok(g.over === true && calls.over === 1, '钟摆用完后再次致命 → 正常死亡')
}
{
  const { g, calls } = makeGame({ relicIds: ['phoenix'] })
  hit(g, 999)
  ok(g.player.hp === 3 && !g.over && g.reviveUsed.phoenix === true, `凤羽烬复活到 3 HP（实际 ${g.player.hp}）`)
  hit(g, 999)
  ok(g.over === true && calls.over === 1, '复活额度用尽后死亡 → onGameOver 恰好 1 次')
}
{
  const { g } = makeGame({ charms: ['charm_revive'] })
  hit(g, 999)
  ok(g.player.hp === 3 && !g.over && g.reviveUsed.charm === true, `不灭烛护符复活到 3 HP（实际 ${g.player.hp}）`)
}
{
  const { g, calls } = makeGame()
  hit(g, 999)
  ok(g.over === true && calls.over === 1, 'HP 归零 → game.over=true 且触发 onGameOver')
  ok(!!calls.summary && calls.summary.floor === 1, `结算摘要有效（floor=${calls.summary && calls.summary.floor}）`)
  const hp = g.player.hp
  hit(g, 5)
  ok(g.player.hp === hp && calls.over === 1, '死亡后不再重复结算')
}
{
  const { g } = makeGame({ hp: 2 })
  g.healPlayer(99)
  ok(g.player.hp === g.player.maxHp, `治疗封顶在 maxHp（${g.player.hp}/${g.player.maxHp}）`)
}

console.log('-'.repeat(40))
if (fail) {
  console.error(`✗ ${fail} 项失败`)
  process.exit(1)
}
console.log(`✓ 战斗 / 死亡 / 复活回归全部通过（${pass} 项）`)
