/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.combat.js
 * 攻击 / 冲撞 / 炸弹 / 回合管线 / 技能 / 战斗与伤害结算（Game.prototype mixin，由 systems.js 拆分而来）
 * 加载顺序：必须在 systems.js 之前；方法体与原文件逐行一致。
 * ========================================================================= */
;(function () {
  'use strict'
  const G = window.EchoGen,
    E = window.EchoEnt
  const T = G.T

  ;(window.EchoSystemsParts || (window.EchoSystemsParts = [])).push(
    class SystemsCombat {
      /* ================= 主动攻击（J/F）：朝面向方向挥击，不移动 =================
       * 与"撞击攻击"的区别：主动攻击不吃反伤——站位得当就能无伤输出。
       * 也可劈开宝箱、击碎回声。
       */
      actionAttack() {
        const p = this.player
        const [dx, dy] = p.facing
        this.lastPlayerDelta = null
        const tx = p.x + dx,
          ty = p.y + dy
        this.fx.burst(tx, ty, '#ffffff', 5, { speed: 50 })
        if (!this.inBounds(tx, ty)) {
          this.endTurn('w')
          return true
        }
        const enemy = this.enemyAt(tx, ty)
        if (enemy) {
          if (enemy.type === 'mimic' && enemy.disguise) {
            enemy.disguise = false
            this.onReveal(enemy)
          }
          this.attackEnemy(enemy)
          this.endTurn('w')
          return true
        }
        const eco = this.echo
        if (eco && eco.alive && eco.spawned && eco.x === tx && eco.y === ty) {
          this.shatterEcho(eco, 'playerAttack')
          this.endTurn('w')
          return true
        }
        const chest = this.chestAt(tx, ty)
        if (chest) {
          this.bumpChest(chest)
          this.endTurn('w')
          return true
        }
        // 挥空也消耗回合
        this.fx.sfx('step')
        this.endTurn('w')
        return true
      }

      /* ================= 冲撞 ================= */
      doDash(dx, dy) {
        const p = this.player
        this.lastPlayerDelta = [dx, dy]
        this.dashCooldown = Math.max(1, this.stats.dashCd)
        let steps = 0
        for (let i = 0; i < 4; i++) {
          const nx = p.x + dx,
            ny = p.y + dy
          const enemy = this.enemyAt(nx, ny)
          if (enemy) {
            let dmg = this.stats.atk + 1 + (this.has('coil') ? 2 : 0)
            this.attackEnemy(enemy, dmg)
            if (this.has('coil') && !enemy.dead) {
              // 击退
              const kx = nx + dx,
                ky = ny + dy
              if (this.enemyCanEnter(enemy, kx, ky)) {
                enemy.x = kx
                enemy.y = ky
              }
            }
            break
          }
          const t = this.tileAt(nx, ny)
          const gate = this.gateAt(nx, ny)
          if (
            !this.inBounds(nx, ny) ||
            t === T.WALL ||
            t === T.PHASE ||
            t === T.EXIT ||
            (t === T.GATE && !(gate && gate.open))
          )
            break
          if (this.chestAt(nx, ny)) {
            this.bumpChest(this.chestAt(nx, ny))
            break
          }
          p.x = nx
          p.y = ny
          steps++
          this.enterCellEffects(p.x, p.y, 'player')
          if (this.tileAt(p.x, p.y) === T.EXIT) {
            this.tryExit()
            return
          }
        }
        this.fx.sfx('dash')
        this.fx.burst(p.x, p.y, '#bdeaff', 10, { speed: 120 })
        if (steps > 0) {
          this.pressPlate(p.x, p.y, 'player')
          this.recording.push({ t: 'm', dx, dy })
          // 录像按单步展开，回声可复现
          for (let i = 1; i < steps; i++) this.recording.push({ t: 'w' })
          this.endTurn(null) // 已手动录像
        } else {
          this.endTurn('w')
        }
      }

      /* ================= 炸弹 ================= */
      useBomb() {
        if (this.bombs <= 0) {
          this.fx.toast('没有炸弹了！')
          return false
        }
        this.bombs--
        const r = 1 + (this.has('bombbag') ? 1 : 0)
        this.explode(this.player.x, this.player.y, r, 6 + this.stats.bombDmg, null, true)
        this.endTurn('w')
        return true
      }

      /* ================= 回合结束管线 ================= */
      endTurn(cmdType, dx, dy) {
        const p = this.player
        if (cmdType === 'm') this.recording.push({ t: 'm', dx, dy })
        else if (cmdType === 'w') this.recording.push({ t: 'w' })
        if (cmdType === 'm') {
          this.stepsThisFloor++
          this.runStats.stepsTotal++
        }
        p.history.push({ x: p.x, y: p.y })
        if (p.history.length > 12) p.history.shift()
        if (this.dashCooldown > 0) this.dashCooldown--
        if (this.invulnTurns > 0) this.invulnTurns--
        p.sparkCharge = Math.min(3, p.sparkCharge + 1)
        this.turnCount++
        this.computePlayerField()

        // 敌人行动
        const sprinter = this.has('sprinter') && this.stepsThisFloor <= 10
        for (const e of this.enemies.slice()) {
          if (e.dead) continue
          if (sprinter) break
          if (e.st.frozen) {
            e.st.frozen--
            continue
          }
          if (this.has('slowaura') && this.rng() < 0.2) continue
          e.st.cd = e.st.cd == null ? (e.uid % 2) + 1 : e.st.cd - 1
          if (e.st.cd > 0) continue
          e.st.cd = e.boss ? 1 : e.def.every || 1
          try {
            E.aiStep(this, e)
          } catch (err) {
            console.error('AI错误', e.type, err)
          }
          // 熔岩上的敌人不受影响；尖刺只影响玩家与回声
        }
        // 预警落点结算
        for (const s of this.pendingSlams.filter((s) => s.at <= this.turnCount)) {
          if (p.x === s.x && p.y === s.y) this.damagePlayer(s.dmg, 'slam', null)
          this.fx.burst(s.x, s.y, s.color || '#ff7847', 16)
        }
        this.pendingSlams = this.pendingSlams.filter((s) => s.at > this.turnCount)
        // 临时熔岩到期
        this.tempLava = this.tempLava.filter((l) => l.until > this.turnCount)
        // 激光表现衰减
        this.beams = this.beams.filter((b) => --b.life > 0)
        // 投射物
        this.projStepAll()
        // 站立伤害：尖刺 / 熔岩
        if (this.spikeActiveAt(p.x, p.y)) this.damagePlayer(1, 'spike', null, true)
        if (this.tileAt(p.x, p.y) === T.LAVA) this.damagePlayer(1, 'lava', null, true)
        if (this.tempLava.some((l) => l.x === p.x && l.y === p.y)) this.damagePlayer(1, 'lava', null, true)
        // 蒸汽喷口推移
        this.applyVents()
        // 守护符灼磨
        if (this.has('guardian')) {
          for (const e of this.enemies) {
            if (!e.dead && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1) {
              this.hurtEnemy(e, 1, '#8fe388')
            }
          }
        }
        // 双子复活驱动（全局，不依赖个体 AI 循环）
        for (const e of this.enemies) {
          if (e.dead || !e.boss || e.bossId !== 'gemini') continue
          const p2 = e.st.partner
          if (!p2 || !p2.dead) continue
          if (p2.st.revivesLeft == null) p2.st.revivesLeft = 1
          if (p2.st.reviveQueued == null && p2.st.revivesLeft > 0) p2.st.reviveQueued = 3
          if (p2.st.reviveQueued != null) {
            p2.st.reviveQueued--
            if (p2.st.reviveQueued <= 0) {
              if (p2.st.revivesLeft > 0) {
                p2.st.revivesLeft -= 1
                p2.dead = false
                p2.hp = Math.ceil(p2.maxHp / 2)
                const spots = [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ]
                for (const [dx, dy] of spots) {
                  if (this.enemyCanEnter(p2, e.x + dx, e.y + dy)) {
                    p2.x = e.x + dx
                    p2.y = e.y + dy
                    break
                  }
                }
                p2.px = p2.x
                p2.py = p2.y
                this.fx.burst(p2.x, p2.y, '#8fe388', 20)
                this.fx.toast('双子重新站起（半血）——它只剩一次机会了！')
              }
              p2.st.reviveQueued = null
            }
          }
        }
        // 吐纳回气
        if (this.stats.regenN && this.turnCount % this.stats.regenN === 0 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1)
          this.fx.floatText(p.x, p.y - 0.5, '+1', '#8fe388')
        }
        // 回声行动
        if (this.echo) this.actEcho(this.echo)
        for (const be of this.bossEchoes) if (!be.dead) this.actEcho(be)
        // 升级队列在 gainXP 中处理
        this.fx.updateHUD()
        this.autosave()
      }

      applyVents() {
        const ents = [this.player, ...this.enemies.filter((e) => !e.dead)]
        for (const ent of ents) {
          const m = this.metaAt(ent.x, ent.y)
          if (!m || !m.dir || this.tileAt(ent.x, ent.y) !== T.VENT) continue
          const active = (this.turnCount + m.phase) % m.period === 0
          if (!active) continue
          let cx = ent.x,
            cy = ent.y
          for (let i = 0; i < 2; i++) {
            const nx = cx + m.dir[0],
              ny = cy + m.dir[1]
            if (!this.enemyCanEnter(null, nx, ny)) break
            cx = nx
            cy = ny
          }
          if (cx !== ent.x || cy !== ent.y) {
            ent.x = cx
            ent.y = cy
            this.fx.sfx('dash')
            if (ent === this.player) {
              this.enterCellEffects(cx, cy, 'player')
              this.pressPlate(cx, cy, 'player')
            }
          }
        }
      }

      /* ================= 技能 ================= */
      useSkill(slot) {
        const s = this.stats,
          p = this.player
        if (slot === 'spark') {
          // 游侠星火弹
          if (p.sparkCharge < 3) {
            this.fx.toast(`星火充能中 ${p.sparkCharge}/3`)
            return false
          }
          p.sparkCharge = 0
          const [dx, dy] = p.facing
          this.spawnProj(p.x, p.y, dx, dy, this.stats.atk + 1, 'spark', 'player')
          this.fx.sfx('bolt')
          this.endTurn('w')
          return true
        }
        if (slot === 'freeze') {
          if (!s.unlockFreeze) return false
          if (this.usedFreeze) {
            this.fx.toast('时停本层已用过')
            return false
          }
          this.usedFreeze = true
          for (const e of this.enemies) if (!e.dead) e.st.frozen = 3
          this.fx.sfx('freeze')
          this.fx.toast('⏱ 时停！敌人冻结 3 回合')
          this.endTurn('w')
          return true
        }
        if (slot === 'swap') {
          if (!s.unlockSwap) return false
          if (this.usedSwap >= 2) {
            this.fx.toast('置换次数用尽(2/2)')
            return false
          }
          if (!this.echo || !this.echo.alive || !this.echo.spawned) {
            this.fx.toast('没有可置换的回声')
            return false
          }
          this.usedSwap++
          const ex = this.echo.x,
            ey = this.echo.y
          this.echo.x = p.x
          this.echo.y = p.y
          p.x = ex
          p.y = ey
          this.fx.sfx('swap')
          this.fx.burst(ex, ey, '#e4ccff', 14)
          this.fx.burst(p.x, p.y, '#e4ccff', 14)
          this.endTurn('w')
          return true
        }
        if (slot === 'pulse') {
          if (!s.unlockPulse) return false
          if (this.usedPulse >= 2) {
            this.fx.toast('脉冲次数用尽(2/2)')
            return false
          }
          this.usedPulse++
          this.fx.sfx('pulse')
          this.fx.shake(4)
          for (const e of this.enemies) {
            if (!e.dead && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 2) this.hurtEnemy(e, 3, '#9adfff')
          }
          // 脉冲也能击碎周围的回声（主动猎手）
          if (
            this.echo &&
            this.echo.alive &&
            this.echo.spawned &&
            Math.max(Math.abs(this.echo.x - p.x), Math.abs(this.echo.y - p.y)) <= 2
          ) {
            this.shatterEcho(this.echo, 'pulse')
          }
          for (const be of this.bossEchoes) {
            if (!be.dead && be.spawned && Math.max(Math.abs(be.x - p.x), Math.abs(be.y - p.y)) <= 2)
              this.shatterEcho(be, 'pulse')
          }
          this.endTurn('w')
          return true
        }
        return false
      }

      /* ================= 战斗结算 ================= */
      attackEnemy(enemy, forceDmg) {
        let dmg = forceDmg != null ? forceDmg : this.stats.atk
        if (forceDmg == null && !this.firstStruck.has(enemy.uid)) {
          this.firstStruck.add(enemy.uid)
          dmg += this.stats.firstStrike
        }
        if (this.rng() * 100 < this.stats.crit) {
          dmg = Math.ceil(dmg * 1.5)
          this.fx.floatText(enemy.x, enemy.y - 0.6, '暴击!', '#ffd700')
        }
        this.hurtEnemy(enemy, dmg, '#fff')
        this.fx.hitstop(0.06)
      }

      hurtEnemy(e, dmg, color) {
        if (e.dead) return
        if (e.st.invuln) {
          this.fx.floatText(e.x, e.y - 0.6, '免疫', '#aaa')
          return
        }
        e.hp -= dmg
        e.flashT = 0.18
        this.fx.sfx('hit')
        this.fx.floatText(e.x, e.y - 0.4, String(dmg), color || '#fff')
        this.fx.burst(e.x, e.y, color || e.def?.color || '#fff', 8)
        if (e.hp <= 0) this.killEnemy(e)
      }

      bumpAttack(attacker, target) {
        // 敌人撞玩家
        this.damagePlayer(attacker.dmg, 'contact', attacker)
        this.fx.sfx('hit')
      }

      killEnemy(e, silent) {
        if (e.dead) return
        e.dead = true
        this.fx.burst(e.x, e.y, e.def?.color || '#fff', e.boss ? 60 : 18)
        if (!silent) this.fx.sfx('kill')
        this.runStats.kills++
        // 经验与金币
        const xpMul = 1 + this.stats.xpMul / 100
        this.gainXP(Math.round(e.xp * xpMul))
        let goldAmt = e.gold + this.stats.killGold + (this.has('midas') ? 3 : 0)
        goldAmt = Math.round(goldAmt * (1 + this.stats.goldMul / 100))
        this.dropPickup(e.x, e.y, 'gold', goldAmt)
        if (this.has('lifesteal')) {
          this.healPlayer(1)
        }
        // 分裂泥
        if (e.def && e.def.splitInto && !e.def.noSplit) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
          ]) {
            if (this.enemyCanEnter(null, e.x + dx, e.y + dy)) {
              const child = E.makeEnemy(this, e.def.splitInto, e.x + dx, e.y + dy)
              this.enemies.push(child)
            }
          }
          this.fx.toast('分裂泥裂成了两半！')
        }
        // 双子判定
        if (e.bossId === 'gemini' && e.st.partner && !e.st.partner.dead) {
          this.fx.toast('守门双子倒下一尊——快解决另一尊！')
        }
        // BOSS 结算（双子需双杀才算通关）
        if (e.boss) {
          if (e.bossId === 'gemini' && e.st.partner && !e.st.partner.dead) {
            this.fx.toast('一尊倒下了——在它复活前解决另一尊！')
          } else this.onBossDead(e)
        }
        // 自爆虫临死爆炸（若已引爆过则跳过，避免双爆）
        if (e.type === 'bomber' && !e.st.fuseFired) this.explode(e.x, e.y, 1, e.dmg, e)
      }

      onBossDead(e) {
        this.exitLockCleared = true
        if (this.level.exitLock) {
          this.level.exitLock = null
          this.fx.toast('出口传送门开启了！')
          this.fx.sfx('exitOpen')
        }
        this.fx.sfx('bossRoar')
        this.fx.shake(10)
        this.fx.hitstop(0.25)
        this.dropPickup(e.x, e.y, 'heart', 1)
        this.dropPickup(e.x + 1, e.y, 'dust', 10 + Math.floor(e.bossId ? e.bossId.length * 2 : 5))
        this.gainXP(e.xp)
        if (this.floor >= 100 && !this.endless) {
          this.victory = true
          this.fx.onVictory(this.runSummary())
        } else {
          this.fx.toast(`🏆 ${e.name} 已被击败！`)
        }
      }

      /* ================= 伤害管线（玩家） ================= */
      damagePlayer(n, kind, src, quietFx) {
        const p = this.player
        if (this.over || n <= 0) return
        // 调试无敌：仅 ?debug=1 时由 main.js 置位；正式玩法恒为 undefined，此判定恒不命中
        if (this.debugInvuln) return
        if (kind !== 'echo' && kind !== 'water' && this.invulnTurns > 0) return
        // 蛇之狡诈闪避
        if (this.has('cunning') && this.rng() < 0.1) {
          this.fx.floatText(p.x, p.y - 0.6, '闪避!', '#59c9a5')
          return
        }
        // 影行者 / 影分结：每层首击免伤
        const firstFree = this.classId === 'shadow' || this.has('shadowstep')
        if (firstFree && !this.shadowUsed) {
          this.shadowUsed = true
          this.fx.floatText(p.x, p.y - 0.6, '影遁!', '#c084fc')
          return
        }
        // 护甲
        if (this.stats.armor > 0 && n > 1) n -= this.stats.armor
        // 防爆盾：爆炸/激光减半
        if (this.has('shieldgen') && (kind === 'explosion' || kind === 'laser')) n = Math.ceil(n / 2)
        // 偏振镜片天赋
        if (this.stats.laserHalf && kind === 'laser') n = Math.ceil(n / 2)
        // 反伤
        if (src && this.stats.thornsDmg > 0 && kind === 'contact') this.hurtEnemy(src, this.stats.thornsDmg, '#8fe388')
        // 不倒钟摆
        if (p.hp - n <= 0 && this.has('pendulum') && !this.pendulumUsed) {
          this.pendulumUsed = true
          n = p.hp - 1
          this.fx.toast('⏳ 不倒钟摆救了你一命！')
        }
        p.hp -= n
        // recalcStats() 会把 HP 夹到 Math.max(1, ...)（防止负数显示），
        // 所以致死判定必须用扣血后的原始结果；否则玩家永远死不了，
        // 凤羽烬 / 不灭烛 / 失败结算全部不会触发（combat.test.cjs 实测发现）。
        const lethal = p.hp <= 0
        this.invulnTurns = Math.max(this.invulnTurns, 1)
        this.fx.sfx('hurt')
        this.fx.shake(kind === 'explosion' ? 7 : 4)
        this.fx.floatText(p.x, p.y - 0.5, '-' + n, '#ff6b6b', true)
        this.fx.burst(p.x, p.y, '#ff6b6b', 12)
        this.recalcStats()
        if (lethal) {
          p.hp = 0 // 抵消上面的夹紧：复活分支会改成 3 HP，死亡时 HUD/结算显示 0
          // 复活检查：凤羽烬 → 不灭烛护符
          if (this.has('phoenix') && !this.reviveUsed.phoenix) {
            this.reviveUsed.phoenix = true
            p.hp = 3
            this.fx.toast('🔥 凤羽烬燃烧，你复活了！')
            this.fx.sfx('heal')
          } else if (this.hasCharm('charm_revive') && !this.reviveUsed.charm) {
            this.reviveUsed.charm = true
            p.hp = 3
            this.fx.toast('🕯 不灭烛护符发光，你复活了！')
            this.fx.sfx('heal')
          } else {
            this.over = true
            this.fx.sfx('die')
            this.fx.onGameOver(this.runSummary())
          }
        }
      }
      healPlayer(n) {
        const p = this.player
        p.hp = Math.min(p.maxHp, p.hp + n)
        this.fx.floatText(p.x, p.y - 0.5, '+' + n, '#8fe388')
        this.fx.sfx('heal')
      }
    },
  )
})()
