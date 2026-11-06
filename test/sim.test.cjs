/* 《回声之塔》端到端逻辑模拟测试
 * 用最优路线机器人在真实游戏逻辑里爬塔：
 *   走图 → 收集碎片 → 出口 → 下一层 …… 直到 F100 击败「初生回声」通关
 * 验证：移动语义(滑冰/传送/箭头)、机关门、回声重演、战斗、全部 10 个 BOSS、楼层流转全链路。
 * 运行： node test/sim.test.cjs   （单种子调试：ECHO_SIM_SEED=777 node test/sim.test.cjs）
 */
'use strict'
const path = require('path')

// ---- 浏览器环境垫片 ----
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

window.EchoData = require(path.join('..', 'js', 'data.js'))
window.EchoGen = require(path.join('..', 'js', 'gen.js'))
require(path.join(__dirname, '..', 'js', 'core.js'))
require(path.join(__dirname, '..', 'js', 'audio.js'))
require(path.join(__dirname, '..', 'js', 'entities.js'))
// systems 按域拆分：mixin 必须先于 systems.js 加载
require(path.join(__dirname, '..', 'js', 'systems.move.js'))
require(path.join(__dirname, '..', 'js', 'systems.combat.js'))
require(path.join(__dirname, '..', 'js', 'systems.hazards.js'))
require(path.join(__dirname, '..', 'js', 'systems.echo.js'))
require(path.join(__dirname, '..', 'js', 'systems.progress.js'))
require(path.join(__dirname, '..', 'js', 'systems.js'))

const G = window.EchoGen,
  T = G.T

/* ---------------- 模拟玩家 ---------------- */
function blocked(g, x, y) {
  const t = g.tileAt(x, y)
  const gt = g.gateAt(x, y)
  // 注意：不把敌人算作阻挡 —— 走向敌人格 = 撞击攻击（doMove 自动处理）
  return !g.inBounds(x, y) || t === T.WALL || t === T.PHASE || (t === T.GATE && !(gt && gt.open)) || !!g.chestAt(x, y)
}
/* 与 doMove 完全一致的落点模型：滑冰→传送→箭头。
 * 注意：enemyCanEnter/arrowPushSafe 含「玩家占位」子句（systems.js:173-174），
 * 而 doMove 是边推边更新 p.x/p.y 的——模型必须模拟中间占位，
 * 不能直接调真实方法（那时玩家还站在起点，会误拒绝回推）。F20 实测教训。
 * out 非空时收集 visited 途经格：doMove 会对每一格调 enterCellEffects
 * （拾取碎片/踩刺），所以碎片不必是最终落点，途经即可捡到。
 * 发条暴君 arrowStorm 会把碎片格铺成箭头（一踩就被推走），F20 实测教训。 */
function computeLanding(g, cx, cy, d, out) {
  // —— enemyCanEnter 的精确镜像（玩家占位 = 模拟位置 px,py）——
  const simEnter = (x, y, px, py) => {
    if (!g.inBounds(x, y)) return false
    const t = g.tileAt(x, y)
    if (t === T.WALL || t === T.PHASE || t === T.EXIT) return false
    if (t === T.GATE && !(g.gateAt(x, y) || {}).open) return false
    if (x === px && y === py) return false
    if (g.enemyAt(x, y)) return false
    if (g.chestAt(x, y)) return false
    return true
  }
  // —— arrowPushSafe 的精确镜像 ——
  const simPushSafe = (x, y, px, py) => {
    let free = 0
    for (const [ddx, ddy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (simEnter(x + ddx, y + ddy, px, py)) free++
    }
    return free >= 2
  }
  const [dx, dy] = d
  const nx = cx + dx,
    ny = cy + dy
  if (blocked(g, nx, ny)) return null
  let x = nx,
    y = ny,
    guard = 0
  if (out) out.push([x, y])
  // 冰面滑行：与 doMove 一致——遇敌/箱/相位/出口即停；冰爪/弹簧靴不滑
  while (guard++ < 40) {
    if (g.tileAt(x, y) !== T.ICE) break
    if (g.stats.iceClaw || g.has('spring')) break
    const tx = x + dx,
      ty = y + dy
    if (!g.inBounds(tx, ty)) break
    const tt = g.tileAt(tx, ty)
    const g2 = g.gateAt(tx, ty)
    if (tt === T.WALL || tt === T.PHASE || tt === T.EXIT || (tt === T.GATE && !(g2 && g2.open))) break
    if (g.enemyAt(tx, ty) || g.chestAt(tx, ty)) break
    x = tx
    y = ty
    if (out) out.push([x, y])
  }
  const meta = g.metaAt(x, y)
  if (meta && meta.pair && g.tileAt(x, y) === T.PORTAL) {
    x = meta.pair[0]
    y = meta.pair[1]
    if (out) out.push([x, y])
  }
  // 箭头推动（最多 3 连）：模拟占位于当前所在格 (x,y)
  for (let i = 0; i < 3; i++) {
    const m = g.metaAt(x, y)
    if (!m || g.tileAt(x, y) !== T.ARROW) break
    const ax = x + m.dir[0],
      ay = y + m.dir[1]
    if (!simEnter(ax, ay, x, y) || !simPushSafe(ax, ay, x, y)) break
    x = ax
    y = ay
    if (out) out.push([x, y])
  }
  return [x, y]
}
function landing(g, cx, cy, d) {
  return computeLanding(g, cx, cy, d, null)
}
/* 返回本回合 visited 途经格（末项为最终落点）；不可移动时返回空数组 */
function landingCells(g, cx, cy, d) {
  const out = []
  return computeLanding(g, cx, cy, d, out) ? out : []
}
const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }

/* BFS：返回从 (sx,sy) 到目标的首个动作名，找不到返回 null。
 * viaPath=true：目标只要出现在 visited 途经格上就算命中（碎片拾取语义），
 * 不必是最终落点；出口/压力板等需停留的效果仍用 viaPath=false。 */
function firstActionToward(g, sx, sy, isGoal, viaPath) {
  if (isGoal(sx, sy)) return null
  const W = g.level.w
  const seen = new Set([sy * W + sx])
  let q = [[sx, sy, null]]
  while (q.length) {
    const nq = []
    for (const [x, y, act0] of q) {
      for (const [name, d] of Object.entries(DIRS)) {
        let l,
          cells = null
        if (viaPath) {
          cells = landingCells(g, x, y, d)
          if (!cells.length) continue
          l = cells[cells.length - 1]
        } else {
          l = landing(g, x, y, d)
          if (!l) continue
        }
        const [lx, ly] = l
        const act = act0 || name
        if (cells ? cells.some(([gx, gy]) => isGoal(gx, gy)) : isGoal(lx, ly)) return act
        const key = ly * W + lx
        if (seen.has(key)) continue
        seen.add(key)
        nq.push([lx, ly, act])
      }
    }
    q = nq
  }
  return null
}

/* ---------------- 主模拟 ---------------- */
function simulate(seed, maxFloor) {
  const drafts = []
  const game = window.EchoGame.create({
    seed,
    floor: 1,
    classId: 'knight',
    charms: [],
    fx: {
      toast() {},
      shake() {},
      burst() {},
      floatText() {},
      sfx() {},
      hitstop() {},
      flashTile() {},
      updateHUD() {},
      onMusicBiome() {},
      onMusicIntensity() {},
      onFloorStart() {},
      openDraft: (choices, reason) => {
        drafts.push(reason)
        game.applyTalent(choices[0])
      },
      openShop: () => {},
      onGameOver: (s) => {
        throw new Error('模拟中死亡于第 ' + s.floor + ' 层')
      },
      onVictory: () => {},
    },
  })
  // 测试作弊：巨大生命值（专注验证逻辑链路而非平衡）
  game.player.maxHp = 9999
  game.player.hp = 9999
  let totalTurns = 0
  const log = []
  const lastActs = []
  // 回合上限随目标层数放大：每层约 1500 回合预算 + 20000 基础余量
  const turnCap = 20000 + maxFloor * 1500

  while (game.floor <= maxFloor && totalTurns < turnCap) {
    if (game.victory) break // F100 初生回声倒地 → 通关，收工
    const L = game.level
    // 不再强制开门：机器人必须真实地踩压力板充能（验证防软锁设计）

    // 目标序列：关着的门→找板充能 → 未收集碎片 → （BOSS层）击杀 BOSS → 出口
    let guard = 0
    let failStreak = 0
    while (guard++ < 8000) {
      totalTurns++
      if (totalTurns % 500 === 0) log.push(`F${game.floor}@${totalTurns}`)
      const pend = L.shards.filter((s) => !s.got)
      // 安全碎片选择：箭头地牢里"先收哪枚"决定成败——收错顺序会被单向阀关死
      // （seed 777 F24 实测：先扎进水槽 → 槽外碎片永久不可达）。有箭头时才做
      // 顺序校验（无箭头地形不存在单向阀，省得每回合跑全图 BFS）。
      const hasArrows = L.grid.includes(T.ARROW)
      const pendingShard = hasArrows && pend.length > 1 ? pickSafeShard(game, pend) : pend[0] || null
      let act = null
      const px0 = game.player.x,
        py0 = game.player.y
      // ① 关门充能：只挑"压力板当前可达"的门（板可能要穿过另一扇门时先放一放）
      for (const cg of L.gates.filter((g) => !g.open)) {
        const plates = L.plates.filter((p) => p.group === cg.group)
        if (!plates.length) continue
        const onPlate = plates.some((p) => p.x === px0 && p.y === py0)
        if (onPlate) {
          act =
            ['up', 'down', 'left', 'right'].find((n) => {
              const l = landing(game, px0, py0, DIRS[n])
              return l && !plates.some((p) => p.x === l[0] && p.y === l[1])
            }) || 'wait'
          break
        }
        const near = plates.reduce((a, b) =>
          Math.abs(a.x - px0) + Math.abs(a.y - py0) <= Math.abs(b.x - px0) + Math.abs(b.y - py0) ? a : b,
        )
        const a = firstActionToward(game, px0, py0, (x, y) => x === near.x && y === near.y)
        if (a != null) {
          act = a
          break
        }
      }
      // ② 碎片：viaPath —— doMove 逐格结算 enterCellEffects，途经即可拾取
      if (act == null && pendingShard) {
        act = firstActionToward(game, game.player.x, game.player.y, (x, y) => landing2Goal(x, y, pendingShard), true)
      }
      // ③ BOSS（出口锁定时）
      if (act == null && L.exitLock) {
        const bosses = game.enemies.filter((e) => e.boss && !e.dead)
        const target = bosses.find((b) => Math.abs(b.x - game.player.x) + Math.abs(b.y - game.player.y) === 1)
        if (target) {
          // 正交贴身 → 出拳！
          act = ['right', 'left', 'down', 'up'].find((n) => {
            const [dx, dy] = DIRS[n]
            return game.player.x + dx === target.x && game.player.y + dy === target.y
          })
        } else if (bosses.length) {
          const boss = bosses[0]
          act = firstActionToward(
            game,
            game.player.x,
            game.player.y,
            (x, y) =>
              Math.max(Math.abs(x - boss.x), Math.abs(y - boss.y)) <= 1 &&
              !(x === game.player.x && y === game.player.y),
          )
        }
      }
      // ④ 出口（仅当碎片已收齐：未齐时站在出口上也不会传送，回去只会振荡）
      if (act == null && !pend.length && !L.exitLock) {
        const px = game.player.x,
          py = game.player.y
        act = firstActionToward(game, px, py, (x, y) => game.tileAt(x, y) === T.EXIT && !(x === px && y === py))
        if (act == null && game.tileAt(px, py) === T.EXIT) {
          // 已站在出口上（解锁后）：先走开一步，下回合再踏入
          act =
            ['up', 'down', 'left', 'right'].find((n) => {
              const l = landing(game, px, py, DIRS[n])
              return l && !(l[0] === px && l[1] === py)
            }) || 'wait'
        }
      }
      if (act == null) {
        // 无路可走：若有正交相邻敌人（含BOSS/幽灵）→ 出拳清路；否则等待
        const adj = game.enemies.find(
          (e) => !e.dead && Math.abs(e.x - game.player.x) + Math.abs(e.y - game.player.y) === 1,
        )
        if (adj && failStreak > 1) {
          act = ['right', 'left', 'down', 'up'].find((n) => {
            const [dx, dy] = DIRS[n]
            return game.player.x + dx === adj.x && game.player.y + dy === adj.y
          })
        }
        if (act == null) {
          failStreak++
          if (failStreak > 60) {
            console.error(`\n=== 失败现场 F${game.floor} 玩家@(${game.player.x},${game.player.y}) ===`)
            const pend = game.level.shards.filter((s) => !s.got)
            console.error(
              '未收集碎片:',
              pend.map((s) => `(${s.x},${s.y})`).join(' ') || '无',
              '| 出口锁定:',
              !!game.level.exitLock,
            )
            // 可达域
            const W = game.level.w
            const reach = new Set([game.player.y * W + game.player.x])
            let q = [[game.player.x, game.player.y]]
            while (q.length) {
              const nq = []
              for (const [x, y] of q)
                for (const d of Object.values(DIRS)) {
                  const l = landing(game, x, y, d)
                  if (!l) continue
                  const k = l[1] * W + l[0]
                  if (!reach.has(k)) {
                    reach.add(k)
                    nq.push(l)
                  }
                }
              q = nq
            }
            for (const s of pend)
              console.error(`  碎片(${s.x},${s.y}) ${reach.has(s.y * W + s.x) ? '可达' : '不可达!'}`)
            console.error(
              `  出口(${game.level.exit.x},${game.level.exit.y}) ${reach.has(game.level.exit.y * W + game.level.exit.x) ? '可达' : '不可达!'}`,
            )
            // 通用现场信息（不写死坐标，任何层/种子都可读）
            console.error(`  出生点=(${game.level.spawn.x},${game.level.spawn.y}) 可达域=${reach.size} 格`)
            console.error('  全部门:', JSON.stringify(game.level.gates))
            console.error('  全部压力板:', JSON.stringify(game.level.plates))
            console.error(
              '  敌人:',
              game.enemies
                .filter((e) => !e.dead)
                .map((e) => `${e.type}@(${e.x},${e.y})`)
                .join(' ') || '无',
            )
            console.error('  最近动作:', lastActs.join(' → '))
            const GL = {
              0: '#',
              1: '.',
              2: '~',
              3: '-',
              4: 'L',
              5: 'W',
              6: 'r',
              7: 'G',
              8: 'X',
              9: 'O',
              10: 'V',
              11: '>',
              12: 'P',
              13: 'F',
            }
            for (let y = 0; y < game.level.h; y++) {
              let row = ''
              for (let x = 0; x < game.level.w; x++) {
                let ch = GL[game.tileAt(x, y)] || '?'
                if (game.enemyAt(x, y)) ch = 'e'
                if (game.chestAt(x, y)) ch = 'C'
                for (const s of game.level.shards) if (s.x === x && s.y === y && !s.got) ch = '*'
                if (game.level.exit.x === x && game.level.exit.y === y) ch = 'X'
                if (game.echo && game.echo.alive && game.echo.spawned && game.echo.x === x && game.echo.y === y)
                  ch = 'E'
                if (game.player.x === x && game.player.y === y) ch = '@'
                row += ch
              }
              console.error(row)
            }
            throw new Error(`F${game.floor} 寻路失败(连续等待${failStreak}次)`)
          }
          game.handleAction({ action: 'wait', shift: false })
        } else failStreak = 0
        continue
      }
      failStreak = 0
      const floorBefore = game.floor
      lastActs.push(`${act}@(${game.player.x},${game.player.y})`)
      if (lastActs.length > 24) lastActs.shift()
      game.handleAction({ action: act, shift: false })
      if (act === 'wait') continue
      if (game.floor !== floorBefore) break // 已进入下一层，回到外层重新初始化
    }
    log.push(`F${game.floor}: 回合${totalTurns} 天赋${drafts.length}`)
    if (game.over) throw new Error('模拟中死亡')
  }
  return { game, totalTurns, drafts, log, lastActs }
}
function landing2Goal(x, y, shard) {
  return x === shard.x && y === shard.y
}

/* ---------------- 推动语义可达集合 + 完成顺序校验（防单向阀自困） ----------------
 * 与 gen.js realBFS/poiSolvable 同语义，但跑在真实 game 对象上（landing 已是
 * doMove 的精确镜像）。用于每回合的"安全碎片"决策。 */
function reachSet(g, sx, sy) {
  const W = g.level.w
  const seen = new Set([sy * W + sx]) // 所有「本回合会经过」的格（含途经格）
  const expanded = new Set([sy * W + sx]) // 只从最终落点继续扩展（下回合站这里）
  let q = [[sx, sy]]
  while (q.length) {
    const nq = []
    for (const [x, y] of q)
      for (const d of Object.values(DIRS)) {
        const cells = landingCells(g, x, y, d)
        if (!cells.length) continue
        for (const [ax, ay] of cells) seen.add(ay * W + ax)
        const l = cells[cells.length - 1]
        const k = l[1] * W + l[0]
        if (expanded.has(k)) continue
        expanded.add(k)
        nq.push(l)
      }
    q = nq
  }
  return seen
}
/* 从 (sx,sy) 出发，是否存在收集顺序走完 pend 全部碎片后抵达出口 */
function orderExists(g, sx, sy, pend) {
  const exit = g.level.exit,
    W = g.level.w
  const nodes = [{ x: sx, y: sy }, ...pend, { x: exit.x, y: exit.y }]
  const sets = nodes.map((n) => reachSet(g, n.x, n.y))
  const R = (i, j) => sets[i].has(nodes[j].y * W + nodes[j].x)
  const M = pend.length,
    EXIT = M + 1,
    FULL = (1 << M) - 1
  const memo = new Map()
  const dfs = (cur, mask) => {
    if (mask === FULL) return R(cur, EXIT)
    const key = cur * (FULL + 1) + mask
    if (memo.has(key)) return memo.get(key)
    let ok = false
    for (let b = 0; b < M && !ok; b++) {
      if (mask & (1 << b)) continue
      if (R(cur, 1 + b)) ok = dfs(1 + b, mask | (1 << b))
    }
    memo.set(key, ok)
    return ok
  }
  return dfs(0, 0)
}
/* 挑一枚"安全"碎片：当前可达，且收完它之后仍有合法完成顺序 */
function pickSafeShard(g, pend) {
  const W = g.level.w
  const from = reachSet(g, g.player.x, g.player.y)
  for (const s of pend) {
    if (!from.has(s.y * W + s.x)) continue
    const rest = pend.filter((p) => p !== s)
    if (orderExists(g, s.x, s.y, rest)) return s
  }
  return null
}

/* ---------------- 运行多种子 ---------------- */
let failed = 0
const ONLY = process.env.ECHO_SIM_SEED ? Number(process.env.ECHO_SIM_SEED) : null
for (const seed of ONLY ? [ONLY] : [12345, 777, 20250101]) {
  try {
    const t0 = Date.now()
    const r = simulate(seed, 100) // 一路爬到 F100，含全部 10 个 BOSS 战
    if (!r.game.victory) {
      console.error(`✗ seed=${seed} 未通关：停在 F${r.game.floor}（${r.totalTurns} 回合）`)
      console.error(
        '存活敌人:',
        r.game.enemies
          .filter((e) => !e.dead)
          .map((e) => `${e.type}@(${e.x},${e.y})hp${e.hp}`)
          .join(' ') || '无',
      )
      console.error(
        '碎片:',
        r.game.level.shards.map((s) => `(${s.x},${s.y})${s.got ? '✓' : '✗'}`).join(' '),
        '出口锁:',
        !!r.game.level.exitLock,
        '玩家@',
        `(${r.game.player.x},${r.game.player.y})`,
      )
      console.error('最近动作:', r.lastActs.join(' → '))
      failed++
      continue
    }
    console.log(
      `✓ seed=${seed} 通关：${r.totalTurns} 回合登至 F${r.game.floor} · 获得 ${r.drafts.length} 次天赋 · ${Date.now() - t0}ms`,
    )
  } catch (e) {
    failed++
    console.error(`✗ seed=${seed} 失败：${e.message}`)
    console.error(e.stack.split('\n').slice(0, 4).join('\n'))
  }
}
if (failed) process.exit(1)
console.log('✓ 端到端模拟全部通过')
