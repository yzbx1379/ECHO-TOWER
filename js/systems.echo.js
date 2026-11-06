/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.echo.js
 * 回声重演 / 拾取 / 宝箱 / 碎片（Game.prototype mixin，由 systems.js 拆分而来）
 * 加载顺序：必须在 systems.js 之前；方法体与原文件逐行一致。
 * ========================================================================= */
;(function () {
  'use strict'
  const D = window.EchoData,
    G = window.EchoGen
  const T = G.T

  ;(window.EchoSystemsParts || (window.EchoSystemsParts = [])).push(
    class SystemsEcho {
      /* ================= 回声重演 ================= */
      actEcho(eco) {
        if (!eco || eco.dead) return
        if (!eco.alive) return
        const sp = this.level.spawn
        if (!eco.spawned) {
          eco.spawned = true
          eco.x = sp.x
          eco.y = sp.y
          eco.px = sp.x
          eco.py = sp.y
          eco.trail = []
          this.fx.burst(sp.x, sp.y, '#e4ccff', 16)
          this.fx.toast('⟲ 你的回声出现了（重演上一层行动）')
          return
        }
        const cmd = eco.rec[eco.i++]
        if (!cmd) {
          eco.alive = false
          this.fx.burst(eco.x, eco.y, '#e4ccff', 12)
          this.fx.toast('回声演完了它的录像，消散了')
          return
        }
        if (cmd.t === 'w') {
          eco.trail.push({ x: eco.x, y: eco.y })
          return
        }
        const [dx, dy] = [cmd.dx, cmd.dy]
        let nx = eco.x + dx,
          ny = eco.y + dy
        const p = this.player
        // 与玩家相撞
        if (nx === p.x && ny === p.y) {
          if (this.stats.echoSafe) {
            // 推开玩家
            const kx = p.x + dx,
              ky = p.y + dy
            if (this.enemyCanEnter(null, kx, ky)) {
              p.x = kx
              p.y = ky
              this.enterCellEffects(kx, ky, 'player')
            }
            this.shatterEcho(eco, 'echoWalk')
          } else {
            this.damagePlayer(1, 'echo', null)
            this.shatterEcho(eco, 'echoWalk')
          }
          return
        }
        // 阻挡检查
        let blocked = false
        {
          const t = this.tileAt(nx, ny)
          if (!this.inBounds(nx, ny)) blocked = true
          else if (t === T.WALL) blocked = true
          else if (t === T.EXIT) blocked = false
          else if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) blocked = true
          else if (this.enemyAt(nx, ny)) blocked = true
          else if (this.chestAt(nx, ny)) blocked = true
        }
        if (!blocked) {
          eco.x = nx
          eco.y = ny
          // 冰面滑行
          let guard = 0
          while (guard++ < 30 && this.tileAt(eco.x, eco.y) === T.ICE) {
            const tx = eco.x + dx,
              ty = eco.y + dy
            if (!this.enemyCanEnter(null, tx, ty)) break
            eco.x = tx
            eco.y = ty
          }
          const pair = (this.metaAt(eco.x, eco.y) || {}).pair
          if (pair && this.tileAt(eco.x, eco.y) === T.PORTAL) {
            eco.x = pair[0]
            eco.y = pair[1]
          }
          for (let i = 0; i < 3; i++) {
            const m = this.metaAt(eco.x, eco.y)
            if (!m || this.tileAt(eco.x, eco.y) !== T.ARROW) break
            const ax = eco.x + m.dir[0],
              ay = eco.y + m.dir[1]
            if (!this.enemyCanEnter(null, ax, ay) || !this.arrowPushSafe(ax, ay)) break
            eco.x = ax
            eco.y = ay
          }
          this.pressPlate(eco.x, eco.y, 'echo')
          this.enterCellEffects(eco.x, eco.y, eco) // 踩刺会碎
          if (this.tileAt(eco.x, eco.y) === T.WATER) {
            /* 回声免疫水 */
          }
        }
        eco.trail.push({ x: eco.x, y: eco.y })
        if (eco.trail.length > 14) eco.trail.shift()
      }

      shatterEcho(eco, cause) {
        // cause: 'playerWalk' (玩家主动走进回声格) / 'playerAttack' (玩家挥击/炸/脉冲) /
        //        'echoWalk' (回声撞上玩家) / 'spike' (回声自己踩刺) / 'proj' (被投射物击碎) /
        //        'bomb' / 'explode' / 'swap' / undefined (正常消散)
        // 主动猎手：玩家主动用动作（挥击/炸弹/时停/脉冲）击碎 → 奖励加倍
        const activeCauses = ['playerAttack', 'bomb', 'pulse']
        if (!eco || !eco.alive) return
        eco.alive = false
        this.fx.sfx('echoDie')
        this.fx.burst(eco.x, eco.y, '#e4ccff', 24)
        let base = 4 + Math.floor(this.rng() * 5) + this.stats.echoDust + (this.hasTalent('t_echoxp') ? 6 : 0)
        const isPerfectHunter = activeCauses.includes(cause)
        if (isPerfectHunter) base = Math.round(base * 2)
        const amt = Math.max(
          1,
          Math.round(base * (1 + (this.stats.dustMul + (this.classId === 'shadow' ? 25 : 0)) / 100)),
        )
        this.dropPickup(eco.x, eco.y, 'dust', amt)
        if (isPerfectHunter) {
          this.fx.floatText(eco.x, eco.y - 0.5, `完美猎手! +${amt}回尘`, '#ffd700')
          this.fx.shake(2)
          this.fx.toast('★ 完美回声猎手：主动击碎，回尘翻倍！')
        } else {
          this.fx.floatText(eco.x, eco.y - 0.5, `+${amt}回尘`, '#e4ccff')
        }
      }

      /* ================= 拾取 / 宝箱 / 碎片 ================= */
      dropPickup(x, y, kind, amount) {
        // 找空位堆叠
        const exist = this.pickups.find((p) => p.x === x && p.y === y && p.kind === kind)
        if (exist) {
          exist.amount += amount
          return
        }
        this.pickups.push({ x, y, kind, amount })
      }
      collectAt(x, y) {
        for (const pk of this.pickups.filter((p) => p.x === x && p.y === y)) {
          if (pk.kind === 'gold') {
            const amt = Math.round(pk.amount * (1 + this.stats.goldMul / 100))
            this.gold += amt
            this.runStats.goldEarned += amt
            this.fx.sfx('gold')
            this.fx.floatText(x, y - 0.4, '+' + amt + '金', '#ffd700')
          } else if (pk.kind === 'heart') {
            this.healPlayer(2)
            this.fx.floatText(x, y - 0.4, '♥', '#ff6b8a')
          } else if (pk.kind === 'key') {
            this.keys++
            this.fx.sfx('gold')
            this.fx.floatText(x, y - 0.4, '钥匙!', '#ffd27d')
          } else if (pk.kind === 'dust') {
            this.dust += pk.amount
            this.runStats.dustEarned += pk.amount
            this.fx.sfx('shard')
            this.fx.floatText(x, y - 0.4, '+' + pk.amount + '回尘', '#e4ccff')
          }
          pk.done = true
        }
        this.pickups = this.pickups.filter((p) => !p.done)
      }
      collectShardAt(x, y) {
        const s = this.level.shards.find((s) => !s.got && s.x === x && s.y === y)
        if (!s) return
        s.got = true
        this.runStats.shardsTotal++
        this.fx.sfx('shard')
        this.fx.burst(x, y, '#8fe388', 20)
        const left = this.level.shards.filter((s) => !s.got).length
        if (left === 0) {
          this.fx.toast('✦ 所有回响碎片已收集，出口开启了！')
          this.fx.sfx('exitOpen')
        } else this.fx.floatText(x, y - 0.6, `碎片 ${left} 剩`, '#8fe388')
      }
      bumpChest(chest) {
        const mimic = this.enemyAt(chest.x, chest.y)
        if (mimic && mimic.disguise) {
          mimic.disguise = false
          this.onReveal(mimic)
          return
        }
        if (chest.locked) {
          if (this.keys > 0) {
            this.keys--
            chest.locked = false
            this.fx.toast('用钥匙打开了上锁宝箱！')
          } else {
            this.fx.toast('🔒 需要钥匙（商店有售）')
            this.fx.sfx('bump')
            return
          }
        }
        chest.opened = true
        const g = 15 + Math.floor(this.rng() * 16) + Math.floor(this.floor * 1.5)
        this.dropPickup(chest.x, chest.y, 'gold', g)
        if (this.rng() < 0.25) this.dropPickup(chest.x, chest.y, 'heart', 1)
        this.fx.sfx('buy')
        this.fx.burst(chest.x, chest.y, '#d8a03c', 14)
        // 小概率直接出遗物
        if (this.rng() < 0.12 && this.relicIds.length < D.RELICS.length) {
          const unowned = D.RELICS.filter((r) => !this.relicIds.includes(r.id))
          if (unowned.length) {
            const r = unowned[Math.floor(this.rng() * unowned.length)]
            this.addRelic(r.id)
          }
        }
      }
    },
  )
})()
