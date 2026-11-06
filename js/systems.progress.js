/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.progress.js
 * 楼层流程 / 成长 / 商店 / AI 表现钩子 / 存档与总结（Game.prototype mixin，由 systems.js 拆分而来）
 * 加载顺序：必须在 systems.js 之前；方法体与原文件逐行一致。
 * ========================================================================= */
;(function () {
  'use strict'
  const D = window.EchoData,
    G = window.EchoGen,
    C = window.EchoCore,
    E = window.EchoEnt

  ;(window.EchoSystemsParts || (window.EchoSystemsParts = [])).push(
    class SystemsProgress {
      /* ================= 楼层流程 ================= */
      buildLevel() {
        /* 优先用预生成层：首层来自 create({level})，换层来自 EchoPrefetch 预取缓存。
         * sim.test 不加载 prefetch 模块，window.EchoPrefetch 为 undefined → 直接同步生成，
         * 因此端到端模拟的确定性不受 Worker 影响。 */
        let level = null
        if (this.prefetchedLevel && this.prefetchedLevel.floor === this.floor) {
          level = this.prefetchedLevel
          this.prefetchedLevel = null
        }
        if (!level && window.EchoPrefetch) level = window.EchoPrefetch.take(this.seed, this.floor)
        if (!level) level = G.generateFloor(this.seed, this.floor, {})
        this.level = level
        this.nextUid = 1 // 实例级 uid：每层从 1 起，避免跨局/跨层污染（uid%2 决定敌人冷却）
        this.enemies = []
        for (const spec of this.level.enemies) {
          if (spec.type === 'boss:gemini') {
            // 双子守卫：成对生成并互链
            const a = E.makeEnemy(this, spec.type, Math.max(1, spec.x - 1), spec.y)
            const b = E.makeEnemy(this, spec.type, Math.min(this.level.w - 2, spec.x + 1), spec.y)
            a.st.partner = b
            b.st.partner = a
            this.enemies.push(a, b)
            continue
          }
          this.enemies.push(E.makeEnemy(this, spec.type, spec.x, spec.y, { disguise: !!spec.disguise }))
        }
        this.pickups = []
        for (const k of this.level.keys || []) this.pickups.push({ x: k.x, y: k.y, kind: 'key', amount: 1 })
        this.projectiles = []
        this.pendingSlams = []
        this.tempLava = []
        this.beams = []
        this.exitLockCleared = false
        this.computePlayerField()
        if (this.player) {
          this.player.x = this.level.spawn.x
          this.player.y = this.level.spawn.y
          this.player.px = this.player.x
          this.player.py = this.player.y
        }
      }

      tryExit() {
        const left = this.level.shards.filter((s) => !s.got).length
        if (left > 0) {
          this.fx.toast(`还有 ${left} 枚回响碎片未收集`)
          return
        }
        if (this.level.exitLock) {
          this.fx.toast('出口被封印——先击败守护者！')
          return
        }
        this.fx.sfx('portal')
        this.nextFloor()
      }

      nextFloor() {
        const prevRec = this.recording.slice()
        if (this.has('belt')) this.healPlayer(1)
        // 稳健奖励：每通关一层固定给 dustPerFloor 回尘（不依赖击碎回声）
        this.dust += D.BAL.dustPerFloor
        this.runStats.dustEarned += D.BAL.dustPerFloor
        this.floor++
        this.buildLevel()
        this.perFloorReset()
        this.recording = []
        this.lastRecording = prevRec
        this.echo = prevRec.length ? E.makeEcho(prevRec) : null
        this.fx.onMusicBiome(this.level.biome)
        this.fx.onFloorStart(this.level)
        // 免费三选一（每 5 层）
        if (this.floor > 1 && (this.floor - 1) % D.BAL.freeDraftEvery === 0) {
          this.queueDraft('每 5 层的天塔馈赠')
        }
        // 商店层
        if (D.BAL.shopFloors(this.floor)) {
          this.fx.openShop(this.genShopStock())
        }
        if (this.level.isBoss) {
          const b = D.bossOf(this.floor)
          this.fx.toast(`⚠ 第 ${this.floor} 层 · ${b.name} — ${b.hint}`)
          this.fx.sfx('bossRoar')
          this.fx.onMusicIntensity(2)
        } else this.fx.onMusicIntensity(1)
        this.autosave()
      }

      /* 调试跳层：仅供 ?debug=1 调用。与 nextFloor 的区别是不发放回尘、不触发
       * 天赋/商店/BOSS 提示，只重建目标层；并把运行时随机流重置为该层规范种子，
       * 保证「同一 seed + 同一层号 → 同一布局与敌人」，便于复现问题。 */
      debugJumpFloor(delta) {
        const target = Math.max(1, Math.min(100, this.floor + delta))
        if (target === this.floor) return false
        this.floor = target
        this.rng = C.mulberry32((this.seed ^ (this.floor * 2654435761)) >>> 0)
        this.recording = []
        this.lastRecording = []
        this.echo = null
        this.bossEchoes = []
        this.over = false
        this.victory = false
        this.buildLevel()
        this.perFloorReset()
        this.fx.onMusicBiome(this.level.biome)
        this.fx.onMusicIntensity(this.level.isBoss ? 2 : 1)
        this.fx.onFloorStart(this.level)
        this.autosave()
        return true
      }

      /* ================= 成长 ================= */
      gainXP(n) {
        if (n <= 0) return
        this.xp += n
        let need = D.BAL.xpNeed(this.plv)
        while (this.xp >= need) {
          this.xp -= need
          this.plv++
          this.healPlayer(2)
          this.fx.sfx('levelup')
          this.fx.toast(`⭐ 升到 Lv.${this.plv}！`)
          this.queueDraft('升级奖励')
          need = D.BAL.xpNeed(this.plv)
        }
        this.fx.updateHUD()
      }

      queueDraft(reason) {
        const pool = D.TALENTS.filter((t) => {
          if (t.need === 'dash' && !this.stats.unlockDash) return false
          return true
        })
        const picks = []
        const bag = pool.slice()
        while (picks.length < 3 && bag.length) {
          let total = 0
          for (const t of bag) total += t.weight || 1
          let roll = this.rng() * total
          let chosen = bag[0]
          for (const t of bag) {
            roll -= t.weight || 1
            if (roll <= 0) {
              chosen = t
              break
            }
          }
          picks.push(chosen)
          bag.splice(bag.indexOf(chosen), 1)
        }
        this.fx.openDraft(picks, reason || '三选一')
      }

      applyTalent(t) {
        this.talentIds.push(t.id)
        this.recalcStats()
        if (t.apply && t.apply.heal) this.healPlayer(t.apply.heal)
        if (t.apply && t.apply.gold) {
          this.gold += t.apply.gold
          this.fx.sfx('gold')
        }
        if (t.apply && t.apply.bombs) this.bombs += t.apply.bombs
        if (t.apply && t.apply.keys) this.keys += t.apply.keys
        this.fx.updateHUD()
      }

      addRelic(id) {
        if (this.relicIds.includes(id)) return
        this.relicIds.push(id)
        this.recalcStats()
        const r = D.RELICS.find((x) => x.id === id)
        this.fx.toast(`✦ 获得遗物「${r.name}」：${r.desc}`)
        this.fx.sfx('levelup')
        this.fx.updateHUD()
      }

      genShopStock() {
        const disc = this.stats.shopDisc / 100
        const bag = D.SHOP_POOL.slice()
        const stock = []
        while (stock.length < 4 && bag.length) {
          const i = Math.floor(this.rng() * bag.length)
          const it = bag.splice(i, 1)[0]
          stock.push({ ...it, price: Math.max(10, Math.round(it.base * (1 + this.floor * 0.03) * (1 - disc))) })
        }
        return stock
      }
      buyItem(item) {
        if (this.gold < item.price) {
          this.fx.toast('金币不足')
          return false
        }
        this.gold -= item.price
        switch (item.id) {
          case 'shop_heal':
            this.healPlayer(4)
            break
          case 'shop_maxhp':
            this.bonus.maxHp += 2
            this.recalcStats()
            break
          case 'shop_atk':
            this.bonus.atk += 1
            this.recalcStats()
            break
          case 'shop_key':
            this.keys++
            break
          case 'shop_bomb':
            this.bombs += 2
            break
          case 'shop_relic': {
            const un = D.RELICS.filter((r) => !this.relicIds.includes(r.id))
            if (un.length) this.addRelic(un[Math.floor(this.rng() * un.length)].id)
            break
          }
          case 'shop_draft':
            this.queueDraft('命运重铸')
            break
          case 'shop_purify':
            if (this.echo && this.echo.alive) {
              this.shatterEcho(this.echo, 'purify')
              this.echo = null
            } else ((this.gold += item.price), this.fx.toast('当前没有回声可净化'))
            break
        }
        this.fx.sfx('buy')
        this.fx.updateHUD()
        return true
      }

      /* ================= AI 表现钩子 ================= */
      moveEnemy(e, nx, ny, ghost) {
        e.facing = Math.sign(nx - e.x) || e.facing
        e.x = nx
        e.y = ny
        if (!ghost) {
          /* 普通移动 */
        }
      }
      onTelegraph(e) {
        this.fx.floatText(e.x, e.y - 0.7, '!', '#ff6b4a', true)
      }
      onWake(e) {
        this.fx.floatText(e.x, e.y - 0.7, '醒了!', '#b8a58c')
        this.fx.sfx('bump')
      }
      onReveal(e) {
        this.fx.toast('是宝箱怪！')
        this.fx.sfx('hit')
        this.fx.burst(e.x, e.y, '#d8a03c', 12)
      }
      blinkFx(e) {
        this.fx.burst(e.x, e.y, '#c084fc', 12)
      }
      burstAt(x, y, c, n) {
        this.fx.burst(x, y, c, n)
      }
      toast(m) {
        this.fx.toast(m)
      }
      shake(m) {
        this.fx.shake(m)
      }
      sfx(n) {
        this.fx.sfx(n)
      }

      /* ================= 存档与总结 ================= */
      runSummary() {
        return {
          floor: this.floor,
          level: this.plv,
          kills: this.runStats.kills,
          gold: this.gold,
          dust: this.dust,
          steps: this.runStats.stepsTotal,
          shards: this.runStats.shardsTotal,
          time: Math.round((Date.now() - this.runStats.startTime) / 1000),
          classId: this.classId,
          seed: this.seed,
          victory: this.victory,
        }
      }
      snapshot() {
        return {
          v: 1,
          seed: this.seed,
          floor: this.floor,
          endless: this.endless,
          classId: this.classId,
          charms: this.charms,
          relicIds: this.relicIds,
          gold: this.gold,
          dust: this.dust,
          bombs: this.bombs,
          keys: this.keys,
          xp: this.xp,
          lv: this.plv,
          hp: this.player.hp,
          bonus: this.bonus,
          lastRecording: this.echo && this.echo.alive && this.echo.spawned ? [] : this.recording.slice(),
          runStats: this.runStats,
          reviveUsed: this.reviveUsed,
        }
      }
      autosave() {
        try {
          localStorage.setItem('echoTower.run', JSON.stringify(this.snapshot()))
        } catch (e) {
          /* ignore */
        }
      }
    },
  )
})()
