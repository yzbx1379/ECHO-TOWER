/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.hazards.js
 * 投射物 / 激光 / 爆炸 与 BOSS 支援效果（Game.prototype mixin，由 systems.js 拆分而来）
 * 加载顺序：必须在 systems.js 之前；方法体与原文件逐行一致。
 * ========================================================================= */
;(function () {
  'use strict'
  const G = window.EchoGen,
    E = window.EchoEnt
  const T = G.T

  ;(window.EchoSystemsParts || (window.EchoSystemsParts = [])).push(
    class SystemsHazards {
      /* ================= 投射物 ================= */
      spawnProj(x, y, dx, dy, dmg, kind, from) {
        this.projectiles.push({ x, y, px: x, py: y, dx, dy, dmg, kind: kind || 'orb', from: from || 'enemy' })
        if (!from) this.fx.sfx('bolt')
      }

      projStepAll() {
        for (const pr of this.projectiles) {
          if (pr.dead) continue
          pr.px = pr.x
          pr.py = pr.y
          pr.x += pr.dx
          pr.y += pr.dy
          const cx = Math.round(pr.x),
            cy = Math.round(pr.y)
          if (!this.inBounds(cx, cy)) {
            pr.dead = true
            continue
          }
          const t = this.tileAt(cx, cy)
          if (t === T.WALL || t === T.PHASE) {
            pr.dead = true
            this.fx.burst(cx - pr.dx * 0.5, cy - pr.dy * 0.5, '#aaa', 5)
            continue
          }
          if (t === T.GATE && !(this.gateAt(cx, cy) || {}).open) {
            pr.dead = true
            continue
          }
          // 命中判定
          if (pr.from !== 'player') {
            if (this.player.x === cx && this.player.y === cy) {
              this.damagePlayer(pr.dmg, 'ranged', null)
              pr.dead = true
              continue
            }
            if (this.echo && this.echo.alive && this.echo.spawned && this.echo.x === cx && this.echo.y === cy) {
              this.shatterEcho(this.echo, 'proj')
              pr.dead = true
              continue
            }
            for (const be of this.bossEchoes) {
              if (!be.dead && be.spawned && be.x === cx && be.y === cy) {
                this.shatterEcho(be, 'proj')
                pr.dead = true
              }
            }
          } else {
            const e = this.enemyAt(cx, cy)
            if (e && !(e.type === 'mimic' && e.disguise)) {
              this.hurtEnemy(e, pr.dmg, '#ffd27d')
              pr.dead = true
            } else if (e && e.disguise) {
              e.disguise = false
              this.onReveal(e)
              this.hurtEnemy(e, pr.dmg, '#ffd27d')
              pr.dead = true
            }
          }
        }
        this.projectiles = this.projectiles.filter((p) => !p.dead)
      }

      fireLaser(e, dx, dy) {
        let x = e.x + dx,
          y = e.y + dy,
          len = 1
        const start = [e.x, e.y]
        while (len < 14) {
          if (!this.inBounds(x, y)) break
          const t = this.tileAt(x, y)
          if (t === T.WALL || t === T.PHASE) break
          if (t === T.GATE && !(this.gateAt(x, y) || {}).open) break
          const p = this.player
          if (p.x === x && p.y === y) {
            this.damagePlayer(e.dmg, 'laser', e)
          } else if (this.echo && this.echo.alive && this.echo.x === x && this.echo.y === y)
            this.shatterEcho(this.echo, 'laser')
          x += dx
          y += dy
          len++
        }
        this.beams.push({ x0: start[0], y0: start[1], x1: x - dx, y1: y - dy, color: '#ff6b4a', life: 1 })
        this.fx.sfx('laser')
      }

      explode(x, y, radius, dmg, src, isPlayerBomb) {
        this.fx.sfx('explode')
        this.fx.shake(8)
        this.fx.hitstop(0.08)
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const tx = x + dx,
              ty = y + dy
            if (!this.inBounds(tx, ty)) continue
            this.fx.burst(tx, ty, '#ff7847', 6)
            const t = this.tileAt(tx, ty)
            if (
              (t === T.WALL || t === T.PHASE) &&
              isPlayerBomb &&
              Math.abs(dx) + Math.abs(dy) <= 1 &&
              tx > 0 &&
              ty > 0 &&
              tx < this.level.w - 1 &&
              ty < this.level.h - 1
            ) {
              this.level.grid[this.idx(tx, ty)] = T.RUBBLE
              this.dirtyCells.add(this.idx(tx, ty)) // 炸墙开路
            }
          }
        }
        for (const e of this.enemies) {
          if (!e.dead && Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= radius) {
            this.hurtEnemy(e, isPlayerBomb ? dmg : Math.ceil(dmg / 2), '#ff7847')
          }
        }
        const p = this.player
        const distP = Math.max(Math.abs(p.x - x), Math.abs(p.y - y))
        if (!isPlayerBomb && distP <= radius) this.damagePlayer(Math.ceil(dmg / 2), 'explosion', src)
        if (
          this.echo &&
          this.echo.alive &&
          this.echo.spawned &&
          Math.max(Math.abs(this.echo.x - x), Math.abs(this.echo.y - y)) <= radius
        ) {
          this.shatterEcho(this.echo, isPlayerBomb ? 'bomb' : 'explode')
        }
      }

      /* ================= BOSS 支援效果 ================= */
      rewindPlayer(steps, dmg) {
        const p = this.player
        const h = p.history
        const target = h[Math.max(0, h.length - steps)] || { x: p.x, y: p.y }
        this.fx.burst(p.x, p.y, '#ffd27d', 20)
        p.x = target.x
        p.y = target.y
        p.px = p.x
        p.py = p.y
        this.damagePlayer(dmg, 'rewind', null)
        this.fx.toast('⏳ 时之沙漏把你拉回了过去！')
        this.fx.sfx('swap')
      }
      ringSlam(cx, cy, r, dmg, color, delay) {
        // 视觉环（立即画出，不造成伤害）
        for (let a = 0; a < 32; a++) {
          const px = cx + Math.round(Math.cos(a / 5) * r),
            py = cy + Math.round(Math.sin(a / 5) * r)
          if (this.inBounds(px, py)) this.fx.flashTile(px, py, color || '#ff7847')
        }
        this.fx.shake(3)
        // 预警：把环上每个在界内的格子加入 pendingSlams（delay 回合后结算伤害），避免"突然掉血"
        const at = this.turnCount + (delay == null ? 1 : delay)
        for (let a = 0; a < 32; a++) {
          const px = cx + Math.round(Math.cos(a / 5) * r),
            py = cy + Math.round(Math.sin(a / 5) * r)
          if (!this.inBounds(px, py)) continue
          this.pendingSlams.push({ x: px, y: py, dmg, at, color: color || '#ff7847' })
        }
      }
      telegraphSlam(x, y, dmg, color) {
        this.pendingSlams.push({ x, y, dmg, at: this.turnCount + 1, color })
        this.fx.flashTile(x, y, color)
      }
      addTempLava(x, y, turns) {
        this.tempLava.push({ x, y, until: this.turnCount + turns })
      }
      beamSweep(e, angle, dmg) {
        const dx = Math.cos(angle),
          dy = Math.sin(angle)
        let x = e.x,
          y = e.y
        for (let i = 0; i < 12; i++) {
          x += dx
          y += dy
          const cx = Math.round(x),
            cy = Math.round(y)
          if (!this.inBounds(cx, cy)) break
          const t = this.tileAt(cx, cy)
          if (t === T.WALL || t === T.PHASE) break
          const p = this.player
          if (p.x === cx && p.y === cy) {
            this.damagePlayer(dmg, 'laser', e)
          }
          if (this.echo && this.echo.alive && this.echo.x === cx && this.echo.y === cy) this.shatterEcho(this.echo)
        }
        this.beams.push({ x0: e.x, y0: e.y, x1: x, y1: y, color: '#ff5edb', life: 1 })
      }
      arrowStorm(bx, by, radius) {
        // 全场统一方向（每次施放重掷）。原先每格随机方向会形成「自环吸引子」：
        // 玩家踩进箭头场后四个方向的推链都把自己送回原格，可达域塌缩为 1 格，
        // 碎片收齐也走不到出口 → 永久卡死（seed 20250101 F20 实测）。
        // 单向流场里沿箭头方向必能离开该格，且更可预判（符合「敌方完全确定」的设计）。
        const dir = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ][Math.floor(this.rng() * 4)]
        for (let i = 0; i < this.level.grid.length; i++) {
          if (this.level.grid[i] !== T.ARROW) continue
          const m = this.level.meta[i]
          if (m) m.dir = dir
          else this.level.meta[i] = { dir }
          this.dirtyCells.add(i)
        }
        let placed = 0
        for (let t = 0; t < 30 && placed < radius * 3; t++) {
          const x = bx + Math.floor(this.rng() * (radius * 2 + 1)) - radius
          const y = by + Math.floor(this.rng() * (radius * 2 + 1)) - radius
          if (!this.inBounds(x, y) || this.tileAt(x, y) !== T.FLOOR) continue
          this.level.grid[this.idx(x, y)] = T.ARROW
          this.dirtyCells.add(this.idx(x, y))
          this.level.meta[this.idx(x, y)] = { dir }
          placed++
        }
        this.fx.toast('🌀 发条暴君扭转了地砖！')
      }
      spawnBossEcho() {
        if (!this.recording.length && !this.lastRecording.length) return
        const eco = E.makeEcho(this.recording.length ? this.recording : this.lastRecording)
        eco.spawned = false
        this.bossEchoes.push(eco)
        this.fx.toast('回声克隆体出现了！')
      }
    },
  )
})()
