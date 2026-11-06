/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.move.js
 * 玩家行动 / 移动语义 / 机关触发（Game.prototype mixin，由 systems.js 拆分而来）
 * 加载顺序：必须在 systems.js 之前；方法体与原文件逐行一致。
 * ========================================================================= */
;(function () {
  'use strict'
  const G = window.EchoGen
  const T = G.T
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

  ;(window.EchoSystemsParts || (window.EchoSystemsParts = [])).push(
    class SystemsMove {
      /* ================= 玩家行动入口 ================= */
      handleAction(act) {
        if (this.over) return false
        const p = this.player
        if (act.action === 'pause' || act.action === 'map' || act.action === 'confirm') return false
        if (act.action === 'wait') {
          // QoL：站在已开启的出口上按等待 = 踏入传送门
          if (
            this.tileAt(this.player.x, this.player.y) === T.EXIT &&
            this.level.shards.every((s) => s.got) &&
            !this.level.exitLock
          ) {
            this.tryExit()
            return true
          }
          this.lastPlayerDelta = null
          this.endTurn('w')
          return true
        }
        const dir = DIRV[act.action]
        if (!dir) return false
        const [dx, dy] = dir
        p.facing = [dx, dy]
        if (act.shift && this.stats.unlockDash && (this.dashCooldown || 0) <= 0) {
          this.doDash(dx, dy)
          return true
        }
        this.doMove(dx, dy)
        return true
      }

      /* 单步移动：撞攻击 / 撞箱 / 滑行链 / 机关结算 */
      doMove(dx, dy) {
        const p = this.player
        this.lastPlayerDelta = [dx, dy]
        let nx = p.x + dx,
          ny = p.y + dy
        if (!this.inBounds(nx, ny)) return
        const t = this.tileAt(nx, ny)
        const gate = this.gateAt(nx, ny)
        const solidPhase = t === T.PHASE && !this.phaseOpen(nx, ny)
        if (t === T.WALL || solidPhase || (t === T.GATE && !(gate && gate.open))) {
          // 撞上关闭的栅栏门 → 一次性教学提示
          if (t === T.GATE && gate) {
            if (!this.gateHintShown) {
              this.gateHintShown = true
              this.fx.toast('⚙ 这是充能栅栏门——找到同色「压力板」踩上去充能！')
              this.fx.toast(`👣 踩满 ${gate.need} 次永久开启；你的回声也能帮你踩`)
            }
          }
          this.fx.sfx('bump')
          return // 不消耗回合
        }
        const enemy = this.enemyAt(nx, ny)
        if (enemy) {
          if (enemy.type === 'mimic' && enemy.disguise) {
            enemy.disguise = false
            this.onReveal(enemy)
          }
          this.attackEnemy(enemy)
          if (!enemy.dead) this.damagePlayer(enemy.dmg, 'contact', enemy)
          this.endTurn('m', dx, dy)
          return
        }
        const chest = this.chestAt(nx, ny)
        if (chest) {
          this.bumpChest(chest)
          this.endTurn('m', dx, dy)
          return
        }
        // 主动踩上回声：同样触发碰撞
        {
          const eco = this.echo
          if (eco && eco.alive && eco.spawned && eco.x === nx && eco.y === ny) {
            if (!this.stats.echoSafe) this.damagePlayer(1, 'echo', null)
            else this.fx.toast('回声与你擦肩而过')
            this.shatterEcho(eco)
            this.endTurn('m', dx, dy)
            return
          }
        }
        // —— 走入 + 冰面滑行链 ——
        const visited = []
        let cx = nx,
          cy = ny,
          guard = 0
        while (guard++ < 40) {
          visited.push([cx, cy])
          p.x = cx
          p.y = cy
          if (this.tileAt(cx, cy) !== T.ICE) break
          if (this.stats.iceClaw || this.has('spring')) break
          const tx = cx + dx,
            ty = cy + dy
          if (!this.inBounds(tx, ty)) break
          const tt = this.tileAt(tx, ty)
          const g2 = this.gateAt(tx, ty)
          if (tt === T.WALL || tt === T.PHASE || tt === T.EXIT || (tt === T.GATE && !(g2 && g2.open))) break
          if (this.enemyAt(tx, ty) || this.chestAt(tx, ty)) break
          cx = tx
          cy = ty
        }
        // 传送门
        const pair = (this.metaAt(p.x, p.y) || {}).pair
        if (pair && this.tileAt(p.x, p.y) === T.PORTAL) {
          this.fx.burst(p.x, p.y, '#c084fc', 14)
          p.x = pair[0]
          p.y = pair[1]
          visited.push([p.x, p.y])
          this.fx.sfx('portal')
        }
        // 箭头地砖推动（最多 3 连；口袋安全）
        for (let i = 0; i < 3; i++) {
          const m = this.metaAt(p.x, p.y)
          if (!m || this.tileAt(p.x, p.y) !== T.ARROW) break
          const ax = p.x + m.dir[0],
            ay = p.y + m.dir[1]
          if (!this.enemyCanEnter(null, ax, ay) || !this.arrowPushSafe(ax, ay)) break
          p.x = ax
          p.y = ay
          visited.push([ax, ay])
        }
        // 逐格结算
        for (const [vx, vy] of visited) {
          this.enterCellEffects(vx, vy, 'player')
        }
        this.pressPlate(p.x, p.y, 'player')
        // 出口
        if (this.tileAt(p.x, p.y) === T.EXIT) {
          this.tryExit()
          return
        }
        this.endTurn('m', dx, dy)
      }

      /* 进入格子时的效果（玩家/回声共用部分） */
      enterCellEffects(x, y, who) {
        const t = this.tileAt(x, y)
        const isPlayer = who === 'player'
        if (isPlayer) {
          this.collectAt(x, y)
          this.collectShardAt(x, y)
        }
        if (t === T.THIN) {
          const m = this.metaAt(x, y) || {}
          if (isPlayer && this.has('frostward')) return
          m.cracks = (m.cracks || 0) + 1
          this.level.meta[this.idx(x, y)] = m
          if (m.cracks >= 2) {
            this.level.grid[this.idx(x, y)] = T.WATER
            this.dirtyCells.add(this.idx(x, y))
            this.fx.burst(x, y, '#7fd8ff', 10)
            this.fx.sfx('spike')
          }
        }
        if (isPlayer && t === T.WATER) {
          this.damagePlayer(1, 'water', null, true)
          this.fx.burst(x, y, '#7fd8ff', 8)
        }
        if (t === T.LAVA && isPlayer) {
          this.damagePlayer(1, 'lava', null, true)
          this.fx.burst(x, y, '#ff7847', 8)
        }
        if ((t === T.FLOOR || t === T.RUBBLE) && this.spikeActiveAt(x, y)) {
          if (isPlayer) this.damagePlayer(1, 'spike', null, true)
          else if (who && who.alive !== undefined) this.shatterEcho(who, 'spike') // 回声踩刺
        }
      }

      /* 箭头推动的落点必须自身有 ≥2 个可站立出口，防止被推进死胡同口袋 */
      arrowPushSafe(x, y) {
        let free = 0
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (this.enemyCanEnter(null, x + dx, y + dy)) free++
        }
        return free >= 2
      }

      spikeActiveAt(x, y) {
        const hz = this.level.hazards.find((h) => h.x === x && h.y === y)
        if (!hz) return false
        return (this.turnCount + hz.phase) % hz.period < 2
      }

      pressPlate(x, y, who) {
        const pl = this.level.plates.find((p) => p.x === x && p.y === y)
        if (!pl) return
        let add = 1
        if (who === 'player') add = this.stats.plateMul
        pl.charge = (pl.charge || 0) + add
        this.fx.sfx('plate')
        this.fx.burst(x, y, '#ffd27d', 6)
        for (const g of this.level.gates) {
          if (g.group !== pl.group || g.open) continue
          this.fx.floatText(x, y - 0.6, `⚡ ${pl.charge}/${g.need}`, '#ffd27d')
          if (pl.charge >= g.need) {
            g.open = true
            this.fx.sfx('gate')
            this.fx.toast('⚙ 机关栅栏开启了！')
            this.fx.burst(g.x, g.y, '#ffd27d', 16)
          }
        }
      }
    },
  )
})()
