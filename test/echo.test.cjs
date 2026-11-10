/* 《回声之塔》回声重演核心机制回归
 *
 * 与 sim.test.cjs 的分工：sim 只把 game.echo 当作「要避开的格子」，从没断言过
 * 录像内容、重演坐标、消散、撞玩家、回尘奖励、BOSS 回声与回溯。本文件用真实
 * Game 实例 + 平坦受控地形逐条验证，避免核心机制只剩「跑过没抛错」。
 *
 * 运行： node test/echo.test.cjs
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

/* 造一局真实游戏；清掉职业自带遗物，保证 stats 可控 */
function makeGame(opts) {
  opts = opts || {}
  const calls = { toasts: [], over: 0 }
  const fx = {
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
    onGameOver: () => {
      calls.over++
    },
    onVictory() {},
  }
  const g = window.EchoGame.create({
    seed: 4242,
    floor: 1,
    classId: 'knight',
    lastRecording: (opts.lastRecording || []).slice(),
    fx,
  })
  g.relicIds = []
  g.recalcStats()
  g.player.hp = g.player.maxHp
  g.invulnTurns = 0
  return { g, calls }
}

/* 平坦化：全 FLOOR + 清空实体/机关，让重演坐标只由录像决定 */
function flatten(g) {
  const T = window.EchoGen.T
  g.level.grid.fill(T.FLOOR)
  g.level.gates = []
  g.level.plates = []
  g.level.shards = []
  g.level.chests = []
  g.level.meta = {}
  g.enemies = []
  g.pickups = []
  g.bossEchoes = []
  g.pendingSlams = []
  g.tempLava = []
  g.beams = []
  g.stats.dodge = 0
  g.stats.armor = 0
  g.stats.echoDust = 0
  g.stats.dustMul = 0
}

const W = [{ t: 'w' }]
const M = (dx, dy) => ({ t: 'm', dx, dy })

console.log('回声重演核心机制回归')
{
  const { g } = makeGame()
  ok(g.echo === null, 'F1 无上一层录像 → 不生成回声')
  ok(Array.isArray(g.recording) && g.recording.length === 0, 'F1 本层录像为空')
}
{
  const rec = [M(1, 0), W[0]]
  const { g } = makeGame({ lastRecording: rec })
  ok(!!g.echo && g.echo.alive === true && g.echo.spawned === false, '续爬层用录像创建未生成的回声')
  ok(JSON.stringify(g.echo.rec) === JSON.stringify(rec), '回声持有完整录像')
  ok(g.echo.rec !== rec, 'rec 是 slice 副本，不与外部共享引用')
  ok(g.echo.i === 0, '回声指令游标从 0 开始')
}
{
  const { g } = makeGame()
  flatten(g)
  g.recording = []
  g.endTurn('m', 1, 0)
  ok(g.recording.length === 1 && JSON.stringify(g.recording[0]) === JSON.stringify(M(1, 0)), 'endTurn(m) 录制移动指令')
  g.endTurn('w')
  ok(g.recording.length === 2 && g.recording[1].t === 'w', 'endTurn(w) 录制等待指令')
}
{
  const { g } = makeGame()
  flatten(g)
  const before = [M(1, 0), W[0], M(0, 1)]
  g.recording = before.slice()
  g.nextFloor()
  ok(g.floor === 2, 'nextFloor 进入 F2')
  ok(JSON.stringify(g.lastRecording) === JSON.stringify(before), '上一层录像完整转存到 lastRecording')
  ok(g.recording.length === 0, '新层本层录像清空')
  ok(!!g.echo && g.echo.alive === true, '新层生成回声')
  ok(JSON.stringify(g.echo.rec) === JSON.stringify(before), '新层回声录像 = 上一层玩家录像')
}
{
  const { g, calls } = makeGame({ lastRecording: [M(1, 0), W[0]] })
  flatten(g)
  const eco = g.echo
  const sp = g.level.spawn
  g.actEcho(eco)
  ok(eco.spawned === true, '首次 actEcho 生成回声')
  ok(eco.x === sp.x && eco.y === sp.y, `生成位置 = 出生点 (${sp.x},${sp.y})`)
  ok(eco.i === 0, '生成回合不消耗指令')
  g.actEcho(eco)
  ok(eco.i === 1 && eco.x === sp.x + 1 && eco.y === sp.y, 'dx=1 移动指令按录像重演')
  g.actEcho(eco)
  ok(eco.i === 2 && eco.x === sp.x + 1 && eco.y === sp.y, '等待指令只推进游标、不移动')
  g.actEcho(eco)
  ok(eco.alive === false, '录像耗尽后回声自动消散')
  ok(
    calls.toasts.some((t) => t.includes('消散')),
    '消散有提示文案',
  )
  g.actEcho(eco)
  ok(eco.alive === false, '消散后再次调用不复活')
}
{
  const { g } = makeGame({ lastRecording: [M(1, 0)] })
  flatten(g)
  const eco = g.echo
  const sp = g.level.spawn
  g.actEcho(eco) // 生成
  g.player.x = sp.x + 1
  g.player.y = sp.y
  g.invulnTurns = 0
  const hp0 = g.player.hp
  g.stats.echoSafe = false
  g.actEcho(eco) // 回声向右一步，正好撞上玩家
  ok(g.player.hp === hp0 - 1, 'echoSafe 关闭时撞玩家扣 1 HP（回声伤害无视无敌帧）')
  ok(eco.alive === false, '相撞后回声碎裂')
}
{
  const { g } = makeGame({ lastRecording: [M(1, 0)] })
  flatten(g)
  const eco = g.echo
  const sp = g.level.spawn
  g.actEcho(eco)
  g.player.x = sp.x + 1
  g.player.y = sp.y
  const hp0 = g.player.hp
  g.stats.echoSafe = true
  g.actEcho(eco)
  ok(g.player.x === sp.x + 2 && g.player.y === sp.y, 'echoSafe 开启时把玩家推开一格')
  ok(g.player.hp === hp0, 'echoSafe 分支不造成伤害')
  ok(eco.alive === false, '推开后回声仍碎裂')
}
{
  const measure = (cause) => {
    const { g } = makeGame({ lastRecording: W })
    flatten(g)
    g.rng = () => 0 // 固定随机，base = 4
    const eco = g.echo
    eco.spawned = true
    eco.x = 5
    eco.y = 5
    g.shatterEcho(eco, cause)
    const pk = g.pickups.find((p) => p.kind === 'dust')
    return { alive: eco.alive, amount: pk ? pk.amount : 0 }
  }
  const normal = measure('echoWalk')
  const active = measure('playerAttack')
  ok(normal.alive === false && normal.amount > 0, `普通碎裂掉落回尘（${normal.amount}）`)
  ok(active.amount === normal.amount * 2, `完美猎手主动击碎回尘翻倍（${active.amount} vs ${normal.amount}）`)
}
{
  const { g } = makeGame()
  flatten(g)
  g.spawnBossEcho()
  ok(g.bossEchoes.length === 0, '无任何录像时不生成 BOSS 回声')
  g.recording = [W[0], M(0, 1)]
  g.spawnBossEcho()
  ok(g.bossEchoes.length === 1, '有本层录像时生成 1 个 BOSS 回声')
  ok(g.bossEchoes[0].spawned === false, 'BOSS 回声初始未生成')
  ok(JSON.stringify(g.bossEchoes[0].rec) === JSON.stringify(g.recording), 'BOSS 回声优先用本层录像')
}
{
  const { g } = makeGame()
  flatten(g)
  const p = g.player
  p.history = [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
    { x: 6, y: 3 },
  ]
  p.x = 6
  p.y = 3
  g.invulnTurns = 0
  const hp0 = p.hp
  g.rewindPlayer(2, 1)
  ok(p.x === 5 && p.y === 3, 'rewindPlayer(2) 回到历史中 2 步前的位置')
  ok(p.hp === hp0 - 1, '回溯伤害生效')
}
{
  const { g } = makeGame()
  flatten(g)
  g.recording = [M(1, 0), W[0]]
  const snap = g.snapshot()
  ok(JSON.stringify(snap.lastRecording) === JSON.stringify(g.recording), 'snapshot 保存本层录像')
  const { g: g2 } = makeGame({ lastRecording: snap.lastRecording })
  ok(JSON.stringify(g2.echo.rec) === JSON.stringify(snap.lastRecording), '用存档录像重建时回声录像一致')
}

console.log('-'.repeat(40))
if (fail) {
  console.error(`✗ ${fail} 项失败`)
  process.exit(1)
}
console.log(`✓ 回声重演核心机制回归全部通过（${pass} 项）`)
