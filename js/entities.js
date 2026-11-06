/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/entities.js
 * 运行时实体：敌人工厂、12 种常规 AI、10 种 BOSS AI、回声实体、投射物。
 * 所有 AI 接收 game 上下文（由 systems.js 提供），确定性执行。
 * 浏览器挂 window.EchoEnt。
 * ========================================================================= */
;(function () {
  'use strict'
  const D = window.EchoData,
    C = window.EchoCore

  /* uid 计数器改为 game 实例级（systems.js buildLevel 每层重置 this.nextUid = 1）。
   * 原先是模块级 let UID —— 同进程多局会互相偏移，而 systems.js 用 uid%2 决定
   * 敌人初始冷却，导致"同 seed 单独跑与连跑结果不同"的非确定性。
   * 这里保留兜底，兼容未初始化 nextUid 的调用方（如测试桩）。 */
  function nextUid(game) {
    if (game.nextUid == null) game.nextUid = 1
    return game.nextUid++
  }

  /* ---------------- 数值成长 ---------------- */
  function scaledDef(type, depth) {
    const base = D.ENEMIES[type]
    const mul = (1 + Math.max(0, depth) * D.BAL.hpPerDepth) * D.BAL.threatMul(depth)
    return {
      ...base,
      hp: Math.max(1, Math.round(base.hp * mul)),
      maxHp: Math.max(1, Math.round(base.hp * mul)),
      dmg: base.dmg + Math.floor(Math.max(0, depth) / D.BAL.dmgStep),
    }
  }

  /* ---------------- 敌人工厂 ---------------- */
  function makeEnemy(game, type, x, y, extra) {
    extra = extra || {}
    if (type.startsWith('boss:')) {
      const bid = type.slice(5)
      const bdef = D.BOSSES.find((b) => b.id === bid)
      const emul = game.floor > 100 ? D.BAL.endlessMul(game.floor) : 1
      return {
        uid: nextUid(game),
        type,
        bossId: bid,
        def: bdef,
        name: bdef.name,
        x,
        y,
        px: x,
        py: y,
        hp: Math.round(bdef.hp * emul),
        maxHp: Math.round(bdef.hp * emul),
        dmg: bdef.dmg + Math.floor(game.floor / D.BAL.dmgStep),
        xp: 30 + bdef.floor,
        gold: 40 + bdef.floor * 2,
        ai: bdef.ai,
        st: {},
        flashT: 0,
        dead: false,
        boss: true,
        facing: 1,
      }
    }
    const def = scaledDef(type, game.floor)
    return {
      uid: nextUid(game),
      type,
      def,
      name: def.name,
      x,
      y,
      px: x,
      py: y,
      hp: def.hp,
      maxHp: def.hp,
      dmg: def.dmg,
      xp: def.xp,
      gold: def.gold,
      ai: def.ai,
      st: {},
      flashT: 0,
      dead: false,
      facing: 1,
      disguise: !!extra.disguise,
    }
  }

  /* ---------------- 通用寻路工具 ---------------- */
  /* 敌人向玩家移动：沿玩家距离场下坡 */
  function stepDownhill(game, e, field) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    let best = null,
      bestV = field[e.y * game.level.w + e.x]
    if (!isFinite(bestV)) bestV = Infinity
    // 轻微洗牌避免同分扎堆
    const order = dirs.slice().sort(() => game.rng() - 0.5)
    for (const [dx, dy] of order) {
      const nx = e.x + dx,
        ny = e.y + dy
      const v = field[ny * game.level.w + nx]
      if (v === undefined || !isFinite(v)) continue
      if (v < bestV && game.enemyCanEnter(e, nx, ny)) {
        bestV = v
        best = [nx, ny]
      }
    }
    return best
  }
  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by)
  }
  function chebyshev(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
  }
  /* 视线是否通畅（不含端点障碍检查目标格） */
  function lineClear(game, x0, y0, x1, y1) {
    const dx = Math.sign(x1 - x0),
      dy = Math.sign(y1 - y0)
    let x = x0 + dx,
      y = y0 + dy
    while (x !== x1 || y !== y1) {
      if (!game.tilePassable(x, y)) return false
      x += dx
      y += dy
    }
    return true
  }

  /* ================================================================
   * 常规敌人 AI —— 每次被调用执行"一次行动"
   * 返回 true 表示发生了攻击（供音效/表现）
   * ================================================================ */
  const AI = {
    slug(game, e) {
      const f = game.playerField
      if (manhattan(e.x, e.y, game.player.x, game.player.y) === 1) return false // 贴身等待玩家撞
      const mv = stepDownhill(game, e, f)
      if (mv) game.moveEnemy(e, mv[0], mv[1])
      return false
    },
    bat(game, e) {
      if (game.rng() < 0.45) {
        const d = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ][Math.floor(game.rng() * 4)]
        const nx = e.x + d[0],
          ny = e.y + d[1]
        if (game.enemyCanEnter(e, nx, ny)) {
          game.moveEnemy(e, nx, ny)
          return false
        }
      }
      return AI.slug(game, e)
    },
    sentry(game, e) {
      const p = game.player
      const aligned = (e.x === p.x || e.y === p.y) && chebyshev(e.x, e.y, p.x, p.y) <= (e.def.range || 7)
      if (aligned && lineClear(game, e.x, e.y, p.x, p.y)) {
        if (!e.st.charge) {
          e.st.charge = { dx: Math.sign(p.x - e.x), dy: Math.sign(p.y - e.y) }
          game.onTelegraph(e)
        } else {
          game.fireLaser(e, e.st.charge.dx, e.st.charge.dy)
          e.st.charge = null
        }
      } else e.st.charge = null
      return false
    },
    ghost(game, e) {
      const p = game.player
      const dx = Math.sign(p.x - e.x),
        dy = Math.sign(p.y - e.y)
      let mv = null
      if (Math.abs(p.x - e.x) >= Math.abs(p.y - e.y)) mv = [e.x + dx, e.y + dy]
      else mv = [e.x, e.y + dy]
      const tryMoves = [mv, [e.x + dx, e.y], [e.x, e.y + dy]]
      for (const [nx, ny] of tryMoves) {
        if (nx === e.x && ny === e.y) continue
        if (game.inBounds(nx, ny) && !game.entityBlockAt(nx, ny) && !(nx === p.x && ny === p.y)) {
          game.moveEnemy(e, nx, ny, true)
          return false
        }
      }
      return false
    },
    gargoyle(game, e) {
      const p = game.player
      if (e.st.asleep === undefined) e.st.asleep = true
      if (e.st.asleep) {
        if (chebyshev(e.x, e.y, p.x, p.y) <= (e.def.sense || 5)) {
          e.st.asleep = false
          game.onWake(e)
        }
        return false
      }
      if (game.turnCount % 3 !== 0) return false
      // 直线冲锋（朝玩家轴向，最多3格）
      const dx = Math.sign(p.x - e.x),
        dy = Math.sign(p.y - e.y)
      let sx = 0,
        sy = 0
      if (Math.abs(p.x - e.x) >= Math.abs(p.y - e.y) && dx) sx = dx
      else if (dy) sy = dy
      for (let i = 0; i < 3; i++) {
        const nx = e.x + sx,
          ny = e.y + sy
        if (sx === 0 && sy === 0) break
        if (nx === p.x && ny === p.y) {
          game.bumpAttack(e, p)
          return true
        }
        if (!game.enemyCanEnter(e, nx, ny)) break
        game.moveEnemy(e, nx, ny)
      }
      return false
    },
    mimic(game, e) {
      if (e.disguise) {
        if (manhattan(e.x, e.y, game.player.x, game.player.y) <= 1) {
          e.disguise = false
          game.onReveal(e)
        }
        return false
      }
      return AI.slug(game, e)
    },
    archer(game, e) {
      const p = game.player
      const dist = manhattan(e.x, e.y, p.x, p.y)
      if (e.st.charge) {
        game.spawnProj(e.x, e.y, e.st.charge.dx, e.st.charge.dy, e.dmg, 'bolt')
        e.st.charge = null
        return false
      }
      if (dist <= (e.def.range || 5) && lineClear(game, e.x, e.y, p.x, p.y) && (e.x === p.x || e.y === p.y)) {
        e.st.charge = { dx: Math.sign(p.x - e.x), dy: Math.sign(p.y - e.y) }
        game.onTelegraph(e)
        return false
      }
      if (dist <= 2) {
        // 拉开距离
        const f = game.playerField
        let best = null,
          bestV = -1
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = e.x + dx,
            ny = e.y + dy
          const v = f[ny * game.level.w + nx]
          if (isFinite(v) && v > bestV && game.enemyCanEnter(e, nx, ny)) {
            bestV = v
            best = [nx, ny]
          }
        }
        if (best) game.moveEnemy(e, best[0], best[1])
      } else return AI.slug(game, e)
      return false
    },
    voidmage(game, e) {
      const p = game.player
      e.st.tp = (e.st.tp || 0) + 1
      if (e.st.tp >= (e.def.tpEvery || 6)) {
        e.st.tp = 0
        // 瞬移到距玩家 4~7 的随机地板
        for (let t = 0; t < 24; t++) {
          const nx = 1 + Math.floor(game.rng() * (game.level.w - 2))
          const ny = 1 + Math.floor(game.rng() * (game.level.h - 2))
          const dd = manhattan(nx, ny, p.x, p.y)
          if (dd >= 4 && dd <= 7 && game.enemyCanEnter(e, nx, ny)) {
            game.blinkFx(e)
            e.x = nx
            e.y = ny
            e.px = nx
            e.py = ny
            break
          }
        }
        // 扇形三连弹
        const dx = Math.sign(p.x - e.x),
          dy = Math.sign(p.y - e.y)
        game.spawnProj(e.x, e.y, dx, dy, e.dmg, 'orb')
        if (dx === 0) {
          game.spawnProj(e.x, e.y, 1, dy, e.dmg, 'orb')
          game.spawnProj(e.x, e.y, -1, dy, e.dmg, 'orb')
        } else if (dy === 0) {
          game.spawnProj(e.x, e.y, dx, 1, e.dmg, 'orb')
          game.spawnProj(e.x, e.y, dx, -1, e.dmg, 'orb')
        }
        return false
      }
      return AI.slug(game, e)
    },
    bomber(game, e) {
      const p = game.player
      // 两阶段：第一阶段进入"冒烟蓄力"（st.fuse 回合倒计时），第二阶段真正爆炸
      if (e.st.fuse > 0) {
        e.st.fuse--
        if (e.st.fuse <= 0) {
          e.st.fuseFired = true
          e.st.fuseWarn = false
          game.explode(e.x, e.y, 1, 3, e)
          game.killEnemy(e, true)
          return true
        }
        // 冒烟中不移动，只闪
        e.st.fuseWarn = true
        e.flashT = 0.3
        return false
      }
      e.st.fuseWarn = false
      const dist = manhattan(e.x, e.y, p.x, p.y)
      // 进入 1 格范围内且尚未蓄力 → 开始蓄力（1 回合预警），不立即爆炸
      if (dist <= 1) {
        e.st.fuse = 1
        game.onTelegraph(e)
        return false
      }
      const f = game.playerField
      const mv = stepDownhill(game, e, f)
      if (mv) game.moveEnemy(e, mv[0], mv[1])
      return false
    },
    mirror(game, e) {
      const last = game.lastPlayerDelta
      if (!last) return false
      const dx = -last[0],
        dy = last[1] // 镜像水平方向
      const nx = e.x + dx,
        ny = e.y + dy
      const p = game.player
      if (nx === p.x && ny === p.y) {
        game.bumpAttack(e, p)
        return true
      }
      if (game.enemyCanEnter(e, nx, ny)) game.moveEnemy(e, nx, ny)
      return false
    },
    phase(game, e) {
      e.st.ph = !e.st.ph
      const p = game.player
      if (e.st.ph) {
        // 相位态：无视地形直线逼近
        const dx = Math.sign(p.x - e.x),
          dy = Math.sign(p.y - e.y)
        const nx = e.x + dx,
          ny = e.y + dy
        if (!(nx === p.x && ny === p.y) && game.inBounds(nx, ny) && !game.entityBlockAt(nx, ny)) {
          game.moveEnemy(e, nx, ny, true)
          return false
        }
      }
      return AI.slug(game, e)
    },
  }

  /* ================================================================
   * BOSS AI
   * ================================================================ */
  const BOSS = {
    gemini(game, e) {
      // 双子：复活逻辑已移至 endTurn 全局驱动（systems.js），此处仅做普通追击
      return AI.slug(game, e)
    },
    clock(game, e) {
      e.st.t = (e.st.t || 0) + 1
      if (e.st.t % 3 === 0) {
        // 环形弹幕
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          game.spawnProj(e.x, e.y, dx, dy, e.dmg, 'orb')
        }
        game.sfx('bolt')
      }
      if (e.st.t % 6 === 0) {
        // 地砖箭头化
        game.arrowStorm(e.x, e.y, 3)
      }
      if (e.st.t % 4 === 0) return AI.slug(game, e)
      return false
    },
    frost(game, e) {
      e.st.t = (e.st.t || 0) + 1
      const p = game.player
      if (e.st.t % 4 === 0) {
        // 冰环扩散：先预警 1 回合再造成伤害
        const r = 2 + (Math.floor(e.st.t / 4) % 3)
        game.ringSlam(e.x, e.y, r, e.dmg, '#7fd8ff', 1)
      }
      if (e.st.t % 7 === 0) {
        // 冰锥雨：预警玩家周围3格
        for (let i = 0; i < 3; i++) {
          const nx = p.x + Math.floor(game.rng() * 5) - 2
          const ny = p.y + Math.floor(game.rng() * 5) - 2
          game.telegraphSlam(nx, ny, e.dmg, '#bdeaff')
        }
      }
      return false
    },
    molten(game, e) {
      const p = game.player
      if (e.st.stun) {
        e.st.stun--
        return false
      }
      if (e.st.charging) {
        const { dx, dy } = e.st.charging
        let moved = false
        for (let i = 0; i < 4; i++) {
          const nx = e.x + dx,
            ny = e.y + dy
          if (nx === p.x && ny === p.y) {
            game.bumpAttack(e, p)
            moved = true
            break
          }
          if (!game.enemyCanEnter(e, nx, ny)) {
            e.st.stun = 2
            game.sfx('bump')
            game.shake(6)
            break
          }
          game.moveEnemy(e, nx, ny)
          game.addTempLava(e.x, e.y, 6)
          moved = true
        }
        e.st.charging = null
        return moved
      }
      e.st.cool = (e.st.cool || 0) + 1
      if (e.st.cool >= 2) {
        e.st.cool = 0
        const dx = Math.sign(p.x - e.x),
          dy = Math.sign(p.y - e.y)
        e.st.charging = Math.abs(p.x - e.x) >= Math.abs(p.y - e.y) ? { dx, dy: 0 } : { dx: 0, dy }
        game.onTelegraph(e)
        return false
      }
      return AI.slug(game, e)
    },
    hourglass(game, e) {
      e.st.t = (e.st.t || 0) + 1
      if (e.st.t % 8 === 0) {
        game.rewindPlayer(4, e.dmg)
        return false
      }
      if (e.st.t % 2 === 0) return AI.slug(game, e)
      return false
    },
    eye(game, e) {
      e.st.t = (e.st.t || 0) + 1
      const cyc = e.st.t % 6
      e.st.open = cyc < 3 // 睁眼回合可受击
      e.st.invuln = !e.st.open
      if (cyc === 0 || cyc === 3) {
        e.st.angle = (e.st.angle || 0) + 0.5
        for (let k = 0; k < 6; k++) {
          const a = e.st.angle + (k * Math.PI) / 3
          game.spawnProj(e.x, e.y, Math.cos(a), Math.sin(a), e.dmg, 'orb')
        }
        game.sfx('bolt')
      }
      return false
    },
    choir(game, e) {
      // 指挥家：三个回声存活时无敌；全灭后追击
      const echoes = (game.bossEchoes || []).filter((x) => !x.dead)
      e.st.invuln = echoes.length > 0
      if (e.st.invuln) return false
      return AI.slug(game, e)
    },
    janus(game, e) {
      e.st.t = (e.st.t || 0) + 1
      const lightForm = Math.floor(e.st.t / 5) % 2 === 0
      e.st.light = lightForm
      e.st.invuln = !lightForm // 暗形态不可受击
      if (lightForm) return AI.slug(game, e)
      // 暗形态：十字弹
      if (e.st.t % 5 === 0) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          game.spawnProj(e.x, e.y, dx, dy, e.dmg, 'orb')
      }
      return false
    },
    weaver(game, e) {
      e.st.t = (e.st.t || 0) + 1
      e.st.angle = (e.st.angle || 0) + Math.PI / 12
      // 四条旋转激光臂：每 2 回合沿臂发射
      if (e.st.t % 2 === 0) {
        for (let k = 0; k < 4; k++) {
          const a = e.st.angle + (k * Math.PI) / 2
          game.beamSweep(e, a, e.dmg)
        }
      }
      if (e.st.t % 9 === 0) {
        // 召唤小怪
        const types = ['bat', 'slime']
        for (let i = 0; i < 2; i++) {
          const t = types[Math.floor(game.rng() * types.length)]
          const nx = e.x + Math.floor(game.rng() * 7) - 3,
            ny = e.y + Math.floor(game.rng() * 7) - 3
          if (game.enemyCanEnter(null, nx, ny)) game.enemies.push(makeEnemy(game, t, nx, ny))
        }
      }
      return false
    },
    firstecho(game, e) {
      const p = game.player
      const pct = e.hp / e.maxHp
      e.phase = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3
      e.st.t = (e.st.t || 0) + 1
      if (e.phase === 1) {
        // 镜像你的步伐
        const last = game.lastPlayerDelta
        if (last && game.rng() < 0.8) {
          const nx = e.x + last[0],
            ny = e.y + last[1]
          if (nx === p.x && ny === p.y) {
            game.bumpAttack(e, p)
            return true
          }
          if (game.enemyCanEnter(e, nx, ny)) game.moveEnemy(e, nx, ny)
        } else return AI.slug(game, e)
      } else if (e.phase === 2) {
        if (e.st.t % 3 === 0) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            game.spawnProj(e.x, e.y, dx, dy, e.dmg, 'orb')
        }
        if (e.st.t % 5 === 0 && (game.bossEchoes || []).length < 2) game.spawnBossEcho()
        return AI.slug(game, e)
      } else {
        // 狂暴：每回合行动 + 环弹
        if (e.st.t % 2 === 0) {
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4 + e.st.t * 0.3
            game.spawnProj(e.x, e.y, Math.cos(a), Math.sin(a), e.dmg, 'orb')
          }
        }
        const f = game.playerField
        const mv = stepDownhill(game, e, f)
        if (mv) game.moveEnemy(e, mv[0], mv[1])
        const mv2 = stepDownhill(game, e, f)
        if (mv2) game.moveEnemy(e, mv2[0], mv2[1])
      }
      return false
    },
  }

  function aiStep(game, e) {
    if (e.dead) return
    if (e.boss) {
      const fn = BOSS[e.ai] || AI.slug
      fn(game, e)
    } else {
      const fn = AI[e.ai] || AI.slug
      fn(game, e)
    }
  }

  /* ---------------- 回声实体 ---------------- */
  function makeEcho(recording) {
    return {
      x: -1,
      y: -1,
      px: -1,
      py: -1,
      rec: recording.slice(),
      i: 0,
      alive: recording.length > 0,
      spawned: false,
      trail: [],
      flashT: 0,
    }
  }

  window.EchoEnt = { makeEnemy, scaledDef, aiStep, makeEcho, stepDownhill, manhattan, chebyshev, lineClear, AI, BOSS }
})()
