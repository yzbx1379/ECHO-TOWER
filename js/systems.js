/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.js
 * 游戏逻辑核心：Game 构造 / 状态聚合 / 格子与实体查询。
 * 其余方法按域拆到 systems.move/combat/hazards/echo/progress.js（mixin），
 * 这些文件必须在本文件之前加载；本文件末尾把它们的原型方法合并进 Game.prototype。
 * 浏览器挂 window.EchoGame.create(opts)
 * ========================================================================= */
;(function () {
  'use strict'
  const D = window.EchoData,
    G = window.EchoGen,
    C = window.EchoCore,
    E = window.EchoEnt
  const T = G.T
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

  class Game {
    constructor(opts) {
      opts = opts || {}
      this.seed = opts.seed || (Math.random() * 1e9) | 0
      this.floor = opts.floor || 1
      this.endless = !!opts.endless
      this.classId = opts.classId || 'knight'
      this.charms = (opts.charms || []).slice()
      this.relicIds = (opts.relicIds || []).slice()
      this.talentIds = (opts.talentIds || []).slice()
      this.lastRecording = opts.lastRecording || []
      // 货币与资源
      this.gold = 20
      this.dust = 0
      this.bombs = 0
      this.keys = 0
      if (this.hasCharm('charm_gold')) this.gold += 60
      if (this.hasCharm('charm_bomb')) this.bombs += 2
      this.xp = 0
      this.plv = 1
      this.bonus = { maxHp: 0, atk: 0 } // 商店等直接加成
      this.runStats = { kills: 0, goldEarned: 0, dustEarned: 0, stepsTotal: 0, shardsTotal: 0, startTime: Date.now() }
      this.reviveUsed = { phoenix: false, charm: false }
      // 回合状态
      this.turnCount = 0
      this.stepsThisFloor = 0
      this.recording = [] // 本层指令录像
      this.pendingSlams = [] // 预警落点
      this.dirtyCells = new Set() // 运行中 grid 变化标记（render 离屏缓存脏标记）
      this.tempLava = [] // 临时熔岩
      this.beams = [] // 激光表现
      this.projectiles = []
      this.pickups = []
      this.bossEchoes = []
      this.invulnTurns = 0
      this.over = false
      this.victory = false
      this.rng = C.mulberry32((this.seed ^ (this.floor * 2654435761)) >>> 0)
      // 表现钩子（由 main 注入）
      this.fx = Object.assign(
        {
          toast() {},
          shake() {},
          burst() {},
          floatText() {},
          sfx() {},
          hitstop() {},
          openDraft() {},
          openShop() {},
          onFloorStart() {},
          onGameOver() {},
          onVictory() {},
          updateHUD() {},
          onMusicBiome() {},
          onMusicIntensity() {},
          flashTile() {},
        },
        opts.fx || {},
      )
      // 首层可由 Worker 预生成后传入；buildLevel 只消费一次，后续换层走预取缓存或同步生成。
      // 不传时（含全部 Node 测试）为 null，行为与引入 Worker 之前完全一致。
      this.prefetchedLevel = opts.level || null
      this.buildLevel()
      this.initPlayer()
    }

    /* ---------------- 玩家初始化 ---------------- */
    initPlayer() {
      const cls = D.CLASSES.find((c) => c.id === this.classId) || D.CLASSES[0]
      this.cls = cls
      this.player = {
        x: this.level.spawn.x,
        y: this.level.spawn.y,
        px: this.level.spawn.x,
        py: this.level.spawn.y,
        hp: 6,
        facing: [1, 0],
        animT: 0,
        history: [],
        lastHitsThisFloor: new Set(),
        sparkCharge: 0,
      }
      if (cls.startRelic && !this.relicIds.includes(cls.startRelic)) this.relicIds.push(cls.startRelic)
      if (this.hasCharm('charm_lantern') && !this.relicIds.includes('lantern')) this.relicIds.push('lantern')
      this.recalcStats()
      this.player.hp = Math.min(this.player.hp, this.player.maxHp)
      this.computePlayerField()
      // 回声（第 1 层无；续爬层用上一次录像）
      if (this.lastRecording.length) {
        this.echo = E.makeEcho(this.lastRecording)
      } else this.echo = null
      this.perFloorReset()
      this.fx.onFloorStart(this.level)
      this.fx.onMusicBiome(this.level.biome)
    }

    perFloorReset() {
      this.usedSwap = 0
      this.usedPulse = 0
      this.usedFreeze = false
      this.pendulumUsed = false
      this.shadowUsed = false
      this.firstStruck = new Set()
      this.stepsThisFloor = 0
      this.gateHintShown = false // 每层重置栅栏门教学提示
      if (this.player) this.player.lastHitsThisFloor.clear()
    }

    /* ---------------- 属性聚合 ---------------- */
    recalcStats() {
      const s = {
        maxHp: D.BAL.baseHP,
        atk: D.BAL.baseATK,
        crit: 0,
        armor: 0,
        vision: 0,
        xpMul: 0,
        goldMul: 0,
        dustMul: 0,
        shopDisc: 0,
        thornsDmg: 0,
        bombDmg: 0,
        killGold: 0,
        echoDust: 0,
        regenN: 0,
        dashCd: 4,
        plateMul: 1,
        firstStrike: 0,
        unlockDash: false,
        unlockFreeze: false,
        unlockSwap: false,
        unlockPulse: false,
        laserHalf: false,
        iceClaw: false,
        echoSafe: false,
      }
      const cls = D.CLASSES.find((c) => c.id === this.classId)
      if (cls && cls.mods) for (const k in cls.mods) if (k in s) s[k] += cls.mods[k]
      for (const id of this.talentIds) {
        const t = D.TALENTS.find((x) => x.id === id)
        if (!t || !t.apply) continue
        const a = t.apply
        for (const k in a) {
          if (k === 'unlockDash') s.unlockDash = true
          else if (k === 'unlockFreeze') s.unlockFreeze = true
          else if (k === 'unlockSwap') s.unlockSwap = true
          else if (k === 'unlockPulse') s.unlockPulse = true
          else if (k === 'laserHalf') s.laserHalf = true
          else if (k === 'iceClaw') s.iceClaw = true
          else if (k in s) s[k] += a[k]
        }
      }
      for (const id of this.relicIds) {
        switch (id) {
          case 'thorns':
            s.thornsDmg += 1
            break
          case 'greed':
            s.goldMul += 50
            s.maxHp -= 2
            break
          case 'scholar':
            s.xpMul += 30
            break
          case 'glasscannon':
            s.atk += 3
            s.maxHp -= 2
            break
          case 'coil':
            break // 冲撞时读取
          case 'echoheart':
            s.echoSafe = true
            break
          default:
            break
        }
      }
      if (this.hasCharm('charm_atk1')) s.atk += 1
      if (this.hasCharm('charm_hp2')) s.maxHp += 2
      if (this.hasCharm('charm_lens')) s.dustMul += 20
      s.maxHp += this.bonus.maxHp
      s.atk += this.bonus.atk
      s.maxHp = Math.max(4, s.maxHp)
      this.stats = s
      if (!this.player) return
      const p = this.player
      const oldMax = p.maxHp || s.maxHp
      p.maxHp = s.maxHp
      p.atk = s.atk
      p.hp = Math.max(1, Math.min(p.hp + Math.max(0, s.maxHp - oldMax), s.maxHp))
    }
    has(id) {
      return this.relicIds.includes(id)
    }
    hasCharm(id) {
      return this.charms.includes(id)
    }
    hasTalent(id) {
      return this.talentIds.includes(id)
    }

    /* ---------------- 网格工具 ---------------- */
    idx(x, y) {
      return y * this.level.w + x
    }
    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.level.w && y < this.level.h
    }
    tileAt(x, y) {
      return this.inBounds(x, y) ? this.level.grid[this.idx(x, y)] : T.WALL
    }
    metaAt(x, y) {
      return this.level.meta[this.idx(x, y)] || null
    }
    phaseOpen(x, y) {
      const m = this.metaAt(x, y)
      if (!m) return false
      return (this.turnCount + m.phase) % m.period < 3
    }
    gateAt(x, y) {
      return this.level.gates.find((g) => g.x === x && g.y === y)
    }
    tilePassable(x, y) {
      const t = this.tileAt(x, y)
      if (t === T.WALL) return false
      if (t === T.PHASE) return this.phaseOpen(x, y)
      if (t === T.GATE) {
        const g = this.gateAt(x, y)
        return !!(g && g.open)
      }
      return true
    }
    chestAt(x, y) {
      return this.level.chests.find((c) => c.x === x && c.y === y && !c.opened)
    }
    enemyAt(x, y) {
      return this.enemies.find((e) => !e.dead && e.x === x && e.y === y)
    }
    entityBlockAt(x, y) {
      return !!this.enemyAt(x, y) || (!!this.chestAt(x, y) && !this.mimicDisguisedAt(x, y))
    }
    mimicDisguisedAt(x, y) {
      const e = this.enemyAt(x, y)
      return e && e.type === 'mimic' && e.disguise
    }
    enemyCanEnter(e, nx, ny) {
      if (!this.inBounds(nx, ny)) return false
      const t = this.tileAt(nx, ny)
      if (t === T.WALL || t === T.PHASE || t === T.EXIT) return false
      if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) return false
      const p = this.player
      if (p.x === nx && p.y === ny) return false
      if (this.enemyAt(nx, ny)) return false
      if (this.chestAt(nx, ny)) return false
      return true
    }

    /* 敌人视野下的玩家距离场（BFS，敌人语义） */
    computePlayerField() {
      if (!this.player) return
      const { w, h } = this.level
      const f = new Float64Array(w * h).fill(Infinity)
      const q = [[this.player.x, this.player.y]]
      f[this.idx(this.player.x, this.player.y)] = 0
      const DIRS = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      while (q.length) {
        const [x, y] = q.shift()
        const d = f[this.idx(x, y)]
        for (const [dx, dy] of DIRS) {
          const nx = x + dx,
            ny = y + dy
          if (!this.inBounds(nx, ny)) continue
          const i = this.idx(nx, ny)
          if (f[i] !== Infinity) continue
          const t = this.tileAt(nx, ny)
          if (t === T.WALL || t === T.PHASE) continue
          if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) continue
          f[i] = d + 1
          q.push([nx, ny])
        }
      }
      this.playerField = f
    }
    get playerField() {
      if (!this.__field || this.__fieldTurn !== this.turnCount) {
        this.computePlayerField()
        this.__fieldTurn = this.turnCount
      }
      return this.__field
    }
    set playerField(v) {
      this.__field = v
    }
  }

  /* 合并按域拆分的 mixin：用属性描述符复制，保留原有的可枚举/可写特性，
   * 且 mixin 内部方法之间仍是普通 this.xxx() 调用，无需改任何调用点。 */
  for (const M of window.EchoSystemsParts || []) {
    for (const k of Object.getOwnPropertyNames(M.prototype)) {
      if (k === 'constructor') continue
      Object.defineProperty(Game.prototype, k, Object.getOwnPropertyDescriptor(M.prototype, k))
    }
  }

  /* 从快照恢复运行（重建该层） */
  Game.prototype.restoreFrom = function (s) {
    this.seed = s.seed
    this.floor = s.floor
    this.endless = s.endless
    this.classId = s.classId
    this.charms = s.charms || []
    this.relicIds = s.relicIds || []
    this.gold = s.gold
    this.dust = s.dust
    this.bombs = s.bombs
    this.keys = s.keys
    this.xp = s.xp
    this.plv = s.lv || 1
    this.bonus = s.bonus || { maxHp: 0, atk: 0 }
    Object.assign(this.runStats, s.runStats || {})
    this.reviveUsed = s.reviveUsed || { phoenix: false, charm: false }
    this.lastRecording = s.lastRecording || []
    // v1 新增可选字段：有则恢复随机流，旧存档（undefined）保持原行为
    if (s.rng != null && typeof this.rng.setState === 'function') this.rng.setState(s.rng)
    this.buildLevel()
    this.initPlayer()
    this.player.hp = Math.max(1, Math.min(s.hp || 6, this.player.maxHp))
  }

  window.EchoGame = { create: (opts) => new Game(opts), DIRV }
})()
