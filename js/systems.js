/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/systems.js
 * 游戏逻辑中枢：回合结算 / 移动语义 / 战斗 / 回声重演 / 成长 / 楼层流程
 * 浏览器挂 window.EchoGame.create(opts)
 * ========================================================================= */
(function () {
  'use strict';
  const D = window.EchoData, G = window.EchoGen, C = window.EchoCore, E = window.EchoEnt;
  const T = G.T;

  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.seed = opts.seed || ((Math.random() * 1e9) | 0);
      this.floor = opts.floor || 1;
      this.endless = !!opts.endless;
      this.classId = opts.classId || 'knight';
      this.charms = (opts.charms || []).slice();
      this.relicIds = (opts.relicIds || []).slice();
      this.talentIds = (opts.talentIds || []).slice();
      this.lastRecording = opts.lastRecording || [];
      // 货币与资源
      this.gold = 20; this.dust = 0; this.bombs = 0; this.keys = 0;
      if (this.hasCharm('charm_gold')) this.gold += 60;
      if (this.hasCharm('charm_bomb')) this.bombs += 2;
      this.xp = 0; this.plv = 1;
      this.bonus = { maxHp: 0, atk: 0 }; // 商店等直接加成
      this.runStats = { kills: 0, goldEarned: 0, dustEarned: 0, stepsTotal: 0, shardsTotal: 0, startTime: Date.now() };
      this.reviveUsed = { phoenix: false, charm: false };
      // 回合状态
      this.turnCount = 0; this.stepsThisFloor = 0;
      this.recording = [];           // 本层指令录像
      this.pendingSlams = [];        // 预警落点
      this.tempLava = [];            // 临时熔岩
      this.beams = [];               // 激光表现
      this.projectiles = [];
      this.pickups = [];
      this.bossEchoes = [];
      this.invulnTurns = 0;
      this.over = false; this.victory = false;
      this.rng = C.mulberry32((this.seed ^ (this.floor * 2654435761)) >>> 0);
      // 表现钩子（由 main 注入）
      this.fx = Object.assign({
        toast() {}, shake() {}, burst() {}, floatText() {}, sfx() {},
        hitstop() {}, openDraft() {}, openShop() {}, onFloorStart() {},
        onGameOver() {}, onVictory() {}, updateHUD() {}, onMusicBiome() {},
        onMusicIntensity() {}, flashTile() {},
      }, opts.fx || {});
      this.buildLevel();
      this.initPlayer();
    }

    /* ---------------- 玩家初始化 ---------------- */
    initPlayer() {
      const cls = D.CLASSES.find((c) => c.id === this.classId) || D.CLASSES[0];
      this.cls = cls;
      this.player = {
        x: this.level.spawn.x, y: this.level.spawn.y, px: this.level.spawn.x, py: this.level.spawn.y,
        hp: 6, facing: [1, 0], animT: 0,
        history: [], lastHitsThisFloor: new Set(),
        sparkCharge: 0,
      };
      if (cls.startRelic && !this.relicIds.includes(cls.startRelic)) this.relicIds.push(cls.startRelic);
      if (this.hasCharm('charm_lantern') && !this.relicIds.includes('lantern')) this.relicIds.push('lantern');
      this.recalcStats();
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
      this.computePlayerField();
      // 回声（第 1 层无；续爬层用上一次录像）
      if (this.lastRecording.length) {
        this.echo = E.makeEcho(this.lastRecording);
      } else this.echo = null;
      this.perFloorReset();
      this.fx.onFloorStart(this.level);
      this.fx.onMusicBiome(this.level.biome);
    }

    perFloorReset() {
      this.usedSwap = 0; this.usedPulse = 0; this.usedFreeze = false;
      this.pendulumUsed = false; this.shadowUsed = false; this.firstStruck = new Set();
      this.stepsThisFloor = 0;
      this.gateHintShown = false; // 每层重置栅栏门教学提示
      if (this.player) this.player.lastHitsThisFloor.clear();
    }

    /* ---------------- 属性聚合 ---------------- */
    recalcStats() {
      const s = {
        maxHp: D.BAL.baseHP, atk: D.BAL.baseATK, crit: 0, armor: 0, vision: 0,
        xpMul: 0, goldMul: 0, dustMul: 0, shopDisc: 0,
        thornsDmg: 0, bombDmg: 0, killGold: 0, echoDust: 0, regenN: 0,
        dashCd: 4, plateMul: 1, firstStrike: 0,
        unlockDash: false, unlockFreeze: false, unlockSwap: false, unlockPulse: false,
        laserHalf: false, iceClaw: false, echoSafe: false,
      };
      const cls = D.CLASSES.find((c) => c.id === this.classId);
      if (cls && cls.mods) for (const k in cls.mods) if (k in s) s[k] += cls.mods[k];
      for (const id of this.talentIds) {
        const t = D.TALENTS.find((x) => x.id === id);
        if (!t || !t.apply) continue;
        const a = t.apply;
        for (const k in a) {
          if (k === 'unlockDash') s.unlockDash = true;
          else if (k === 'unlockFreeze') s.unlockFreeze = true;
          else if (k === 'unlockSwap') s.unlockSwap = true;
          else if (k === 'unlockPulse') s.unlockPulse = true;
          else if (k === 'laserHalf') s.laserHalf = true;
          else if (k === 'iceClaw') s.iceClaw = true;
          else if (k in s) s[k] += a[k];
        }
      }
      for (const id of this.relicIds) {
        switch (id) {
          case 'thorns': s.thornsDmg += 1; break;
          case 'greed': s.goldMul += 50; s.maxHp -= 2; break;
          case 'scholar': s.xpMul += 30; break;
          case 'glasscannon': s.atk += 3; s.maxHp -= 2; break;
          case 'coil': break; // 冲撞时读取
          case 'echoheart': s.echoSafe = true; break;
          default: break;
        }
      }
      if (this.hasCharm('charm_atk1')) s.atk += 1;
      if (this.hasCharm('charm_hp2')) s.maxHp += 2;
      if (this.hasCharm('charm_lens')) s.dustMul += 20;
      s.maxHp += this.bonus.maxHp; s.atk += this.bonus.atk;
      s.maxHp = Math.max(4, s.maxHp);
      this.stats = s;
      if (!this.player) return;
      const p = this.player;
      const oldMax = p.maxHp || s.maxHp;
      p.maxHp = s.maxHp; p.atk = s.atk;
      p.hp = Math.max(1, Math.min(p.hp + Math.max(0, s.maxHp - oldMax), s.maxHp));
    }
    has(id) { return this.relicIds.includes(id); }
    hasCharm(id) { return this.charms.includes(id); }
    hasTalent(id) { return this.talentIds.includes(id); }

    /* ---------------- 网格工具 ---------------- */
    idx(x, y) { return y * this.level.w + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.level.w && y < this.level.h; }
    tileAt(x, y) { return this.inBounds(x, y) ? this.level.grid[this.idx(x, y)] : T.WALL; }
    metaAt(x, y) { return this.level.meta[this.idx(x, y)] || null; }
    phaseOpen(x, y) {
      const m = this.metaAt(x, y);
      if (!m) return false;
      return ((this.turnCount + m.phase) % m.period) < 3;
    }
    gateAt(x, y) { return this.level.gates.find((g) => g.x === x && g.y === y); }
    tilePassable(x, y) {
      const t = this.tileAt(x, y);
      if (t === T.WALL) return false;
      if (t === T.PHASE) return this.phaseOpen(x, y);
      if (t === T.GATE) { const g = this.gateAt(x, y); return !!(g && g.open); }
      return true;
    }
    chestAt(x, y) { return this.level.chests.find((c) => c.x === x && c.y === y && !c.opened); }
    enemyAt(x, y) { return this.enemies.find((e) => !e.dead && e.x === x && e.y === y); }
    entityBlockAt(x, y) {
      return !!this.enemyAt(x, y) || (!!this.chestAt(x, y) && !(this.mimicDisguisedAt(x, y)));
    }
    mimicDisguisedAt(x, y) {
      const e = this.enemyAt(x, y);
      return e && e.type === 'mimic' && e.disguise;
    }
    enemyCanEnter(e, nx, ny) {
      if (!this.inBounds(nx, ny)) return false;
      const t = this.tileAt(nx, ny);
      if (t === T.WALL || t === T.PHASE || t === T.EXIT) return false;
      if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) return false;
      const p = this.player;
      if (p.x === nx && p.y === ny) return false;
      if (this.enemyAt(nx, ny)) return false;
      if (this.chestAt(nx, ny)) return false;
      return true;
    }

    /* 敌人视野下的玩家距离场（BFS，敌人语义） */
    computePlayerField() {
      if (!this.player) return;
      const { w, h } = this.level;
      const f = new Float64Array(w * h).fill(Infinity);
      const q = [[this.player.x, this.player.y]];
      f[this.idx(this.player.x, this.player.y)] = 0;
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (q.length) {
        const [x, y] = q.shift();
        const d = f[this.idx(x, y)];
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const i = this.idx(nx, ny);
          if (f[i] !== Infinity) continue;
          const t = this.tileAt(nx, ny);
          if (t === T.WALL || t === T.PHASE) continue;
          if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) continue;
          f[i] = d + 1;
          q.push([nx, ny]);
        }
      }
      this.playerField = f;
    }
    get playerField() {
      if (!this.__field || this.__fieldTurn !== this.turnCount) {
        this.computePlayerField();
        this.__fieldTurn = this.turnCount;
      }
      return this.__field;
    }
    set playerField(v) { this.__field = v; }

    /* ================= 玩家行动入口 ================= */
    handleAction(act) {
      if (this.over) return false;
      const p = this.player;
      if (act.action === 'pause' || act.action === 'map' || act.action === 'confirm') return false;
      if (act.action === 'wait') {
        // QoL：站在已开启的出口上按等待 = 踏入传送门
        if (this.tileAt(this.player.x, this.player.y) === T.EXIT &&
          this.level.shards.every((s) => s.got) && !this.level.exitLock) {
          this.tryExit();
          return true;
        }
        this.lastPlayerDelta = null; this.endTurn('w'); return true;
      }
      const dir = DIRV[act.action];
      if (!dir) return false;
      const [dx, dy] = dir;
      p.facing = [dx, dy];
      if (act.shift && this.stats.unlockDash && (this.dashCooldown || 0) <= 0) {
        this.doDash(dx, dy);
        return true;
      }
      this.doMove(dx, dy);
      return true;
    }

    /* 单步移动：撞攻击 / 撞箱 / 滑行链 / 机关结算 */
    doMove(dx, dy) {
      const p = this.player;
      this.lastPlayerDelta = [dx, dy];
      let nx = p.x + dx, ny = p.y + dy;
      if (!this.inBounds(nx, ny)) return;
      const t = this.tileAt(nx, ny);
      const gate = this.gateAt(nx, ny);
      const solidPhase = t === T.PHASE && !this.phaseOpen(nx, ny);
      if (t === T.WALL || solidPhase || (t === T.GATE && !(gate && gate.open))) {
        // 撞上关闭的栅栏门 → 一次性教学提示
        if (t === T.GATE && gate) {
          if (!this.gateHintShown) {
            this.gateHintShown = true;
            this.fx.toast('⚙ 这是充能栅栏门——找到同色「压力板」踩上去充能！');
            this.fx.toast(`👣 踩满 ${gate.need} 次永久开启；你的回声也能帮你踩`);
          }
        }
        this.fx.sfx('bump');
        return; // 不消耗回合
      }
      const enemy = this.enemyAt(nx, ny);
      if (enemy) {
        if (enemy.type === 'mimic' && enemy.disguise) { enemy.disguise = false; this.onReveal(enemy); }
        this.attackEnemy(enemy);
        if (!enemy.dead) this.damagePlayer(enemy.dmg, 'contact', enemy);
        this.endTurn('m', dx, dy);
        return;
      }
      const chest = this.chestAt(nx, ny);
      if (chest) { this.bumpChest(chest); this.endTurn('m', dx, dy); return; }
      // 主动踩上回声：同样触发碰撞
      {
        const eco = this.echo;
        if (eco && eco.alive && eco.spawned && eco.x === nx && eco.y === ny) {
          if (!this.stats.echoSafe) this.damagePlayer(1, 'echo', null);
          else this.fx.toast('回声与你擦肩而过');
          this.shatterEcho(eco);
          this.endTurn('m', dx, dy);
          return;
        }
      }
      // —— 走入 + 冰面滑行链 ——
      const visited = [];
      let cx = nx, cy = ny, guard = 0;
      while (guard++ < 40) {
        visited.push([cx, cy]);
        p.x = cx; p.y = cy;
        if (this.tileAt(cx, cy) !== T.ICE) break;
        if (this.stats.iceClaw || this.has('spring')) break;
        const tx = cx + dx, ty = cy + dy;
        if (!this.inBounds(tx, ty)) break;
        const tt = this.tileAt(tx, ty);
        const g2 = this.gateAt(tx, ty);
        if (tt === T.WALL || tt === T.PHASE || tt === T.EXIT || (tt === T.GATE && !(g2 && g2.open))) break;
        if (this.enemyAt(tx, ty) || this.chestAt(tx, ty)) break;
        cx = tx; cy = ty;
      }
      // 传送门
      const pair = (this.metaAt(p.x, p.y) || {}).pair;
      if (pair && this.tileAt(p.x, p.y) === T.PORTAL) {
        this.fx.burst(p.x, p.y, '#c084fc', 14);
        p.x = pair[0]; p.y = pair[1];
        visited.push([p.x, p.y]);
        this.fx.sfx('portal');
      }
      // 箭头地砖推动（最多 3 连；口袋安全）
      for (let i = 0; i < 3; i++) {
        const m = this.metaAt(p.x, p.y);
        if (!m || this.tileAt(p.x, p.y) !== T.ARROW) break;
        const ax = p.x + m.dir[0], ay = p.y + m.dir[1];
        if (!this.enemyCanEnter(null, ax, ay) || !this.arrowPushSafe(ax, ay)) break;
        p.x = ax; p.y = ay; visited.push([ax, ay]);
      }
      // 逐格结算
      for (const [vx, vy] of visited) {
        this.enterCellEffects(vx, vy, 'player');
      }
      this.pressPlate(p.x, p.y, 'player');
      // 出口
      if (this.tileAt(p.x, p.y) === T.EXIT) { this.tryExit(); return; }
      this.endTurn('m', dx, dy);
    }

    /* 进入格子时的效果（玩家/回声共用部分） */
    enterCellEffects(x, y, who) {
      const t = this.tileAt(x, y);
      const isPlayer = who === 'player';
      if (isPlayer) {
        this.collectAt(x, y);
        this.collectShardAt(x, y);
      }
      if (t === T.THIN) {
        const m = this.metaAt(x, y) || {};
        if (isPlayer && this.has('frostward')) return;
        m.cracks = (m.cracks || 0) + 1;
        this.level.meta[this.idx(x, y)] = m;
        if (m.cracks >= 2) {
          this.level.grid[this.idx(x, y)] = T.WATER;
          this.fx.burst(x, y, '#7fd8ff', 10);
          this.fx.sfx('spike');
        }
      }
      if (isPlayer && (t === T.WATER)) {
        this.damagePlayer(1, 'water', null, true);
        this.fx.burst(x, y, '#7fd8ff', 8);
      }
      if ((t === T.LAVA) && isPlayer) {
        this.damagePlayer(1, 'lava', null, true);
        this.fx.burst(x, y, '#ff7847', 8);
      }
      if ((t === T.FLOOR || t === T.RUBBLE) && this.spikeActiveAt(x, y)) {
        if (isPlayer) this.damagePlayer(1, 'spike', null, true);
        else if (who && who.alive !== undefined) this.shatterEcho(who); // 回声踩刺
      }
    }

    /* 箭头推动的落点必须自身有 ≥2 个可站立出口，防止被推进死胡同口袋 */
    arrowPushSafe(x, y) {
      let free = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.enemyCanEnter(null, x + dx, y + dy)) free++;
      }
      return free >= 2;
    }

    spikeActiveAt(x, y) {
      const hz = this.level.hazards.find((h) => h.x === x && h.y === y);
      if (!hz) return false;
      return ((this.turnCount + hz.phase) % hz.period) < 2;
    }

    pressPlate(x, y, who) {
      const pl = this.level.plates.find((p) => p.x === x && p.y === y);
      if (!pl) return;
      let add = 1;
      if (who === 'player') add = this.stats.plateMul;
      pl.charge = (pl.charge || 0) + add;
      this.fx.sfx('plate');
      this.fx.burst(x, y, '#ffd27d', 6);
      for (const g of this.level.gates) {
        if (g.group !== pl.group || g.open) continue;
        this.fx.floatText(x, y - 0.6, `⚡ ${pl.charge}/${g.need}`, '#ffd27d');
        if (pl.charge >= g.need) {
          g.open = true;
          this.fx.sfx('gate');
          this.fx.toast('⚙ 机关栅栏开启了！');
          this.fx.burst(g.x, g.y, '#ffd27d', 16);
        }
      }
    }

    /* ================= 主动攻击（J/F）：朝面向方向挥击，不移动 =================
     * 与"撞击攻击"的区别：主动攻击不吃反伤——站位得当就能无伤输出。
     * 也可劈开宝箱、击碎回声。
     */
    actionAttack() {
      const p = this.player;
      const [dx, dy] = p.facing;
      this.lastPlayerDelta = null;
      const tx = p.x + dx, ty = p.y + dy;
      this.fx.burst(tx, ty, '#ffffff', 5, { speed: 50 });
      if (!this.inBounds(tx, ty)) { this.endTurn('w'); return true; }
      const enemy = this.enemyAt(tx, ty);
      if (enemy) {
        if (enemy.type === 'mimic' && enemy.disguise) { enemy.disguise = false; this.onReveal(enemy); }
        this.attackEnemy(enemy);
        this.endTurn('w');
        return true;
      }
      const eco = this.echo;
      if (eco && eco.alive && eco.spawned && eco.x === tx && eco.y === ty) {
        this.shatterEcho(eco);
        this.endTurn('w');
        return true;
      }
      const chest = this.chestAt(tx, ty);
      if (chest) { this.bumpChest(chest); this.endTurn('w'); return true; }
      // 挥空也消耗回合
      this.fx.sfx('step');
      this.endTurn('w');
      return true;
    }

    /* ================= 冲撞 ================= */
    doDash(dx, dy) {
      const p = this.player;
      this.lastPlayerDelta = [dx, dy];
      this.dashCooldown = Math.max(1, this.stats.dashCd);
      let steps = 0;
      for (let i = 0; i < 4; i++) {
        const nx = p.x + dx, ny = p.y + dy;
        const enemy = this.enemyAt(nx, ny);
        if (enemy) {
          let dmg = this.stats.atk + 1 + (this.has('coil') ? 2 : 0);
          this.attackEnemy(enemy, dmg);
          if (this.has('coil') && !enemy.dead) { // 击退
            const kx = nx + dx, ky = ny + dy;
            if (this.enemyCanEnter(enemy, kx, ky)) { enemy.x = kx; enemy.y = ky; }
          }
          break;
        }
        const t = this.tileAt(nx, ny);
        const gate = this.gateAt(nx, ny);
        if (!this.inBounds(nx, ny) || t === T.WALL || t === T.PHASE || t === T.EXIT || (t === T.GATE && !(gate && gate.open))) break;
        if (this.chestAt(nx, ny)) { this.bumpChest(this.chestAt(nx, ny)); break; }
        p.x = nx; p.y = ny; steps++;
        this.enterCellEffects(p.x, p.y, 'player');
        if (this.tileAt(p.x, p.y) === T.EXIT) { this.tryExit(); return; }
      }
      this.fx.sfx('dash');
      this.fx.burst(p.x, p.y, '#bdeaff', 10, { speed: 120 });
      if (steps > 0) {
        this.pressPlate(p.x, p.y, 'player');
        this.recording.push({ t: 'm', dx, dy });
        // 录像按单步展开，回声可复现
        for (let i = 1; i < steps; i++) this.recording.push({ t: 'w' });
        this.endTurn(null); // 已手动录像
      } else {
        this.endTurn('w');
      }
    }

    /* ================= 炸弹 ================= */
    useBomb() {
      if (this.bombs <= 0) { this.fx.toast('没有炸弹了！'); return false; }
      this.bombs--;
      const r = 1 + (this.has('bombbag') ? 1 : 0);
      this.explode(this.player.x, this.player.y, r, 6 + this.stats.bombDmg, null, true);
      this.endTurn('w');
      return true;
    }

    /* ================= 回合结束管线 ================= */
    endTurn(cmdType, dx, dy) {
      const p = this.player;
      if (cmdType === 'm') this.recording.push({ t: 'm', dx, dy });
      else if (cmdType === 'w') this.recording.push({ t: 'w' });
      if (cmdType === 'm') { this.stepsThisFloor++; this.runStats.stepsTotal++; }
      p.history.push({ x: p.x, y: p.y });
      if (p.history.length > 12) p.history.shift();
      if (this.dashCooldown > 0) this.dashCooldown--;
      if (this.invulnTurns > 0) this.invulnTurns--;
      p.sparkCharge = Math.min(3, p.sparkCharge + 1);
      this.turnCount++;
      this.computePlayerField();

      // 敌人行动
      const sprinter = this.has('sprinter') && this.stepsThisFloor <= 10;
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        if (sprinter) break;
        if (e.st.frozen) { e.st.frozen--; continue; }
        if (this.has('slowaura') && this.rng() < 0.2) continue;
        e.st.cd = e.st.cd == null ? ((e.uid % 2) + 1) : e.st.cd - 1;
        if (e.st.cd > 0) continue;
        e.st.cd = e.boss ? 1 : (e.def.every || 1);
        try { E.aiStep(this, e); } catch (err) { console.error('AI错误', e.type, err); }
        // 熔岩上的敌人不受影响；尖刺只影响玩家与回声
      }
      // 预警落点结算
      for (const s of this.pendingSlams.filter((s) => s.at <= this.turnCount)) {
        if (p.x === s.x && p.y === s.y) this.damagePlayer(s.dmg, 'slam', null);
        this.fx.burst(s.x, s.y, s.color || '#ff7847', 16);
      }
      this.pendingSlams = this.pendingSlams.filter((s) => s.at > this.turnCount);
      // 临时熔岩到期
      this.tempLava = this.tempLava.filter((l) => l.until > this.turnCount);
      // 激光表现衰减
      this.beams = this.beams.filter((b) => --b.life > 0);
      // 投射物
      this.projStepAll();
      // 站立伤害：尖刺 / 熔岩
      if (this.spikeActiveAt(p.x, p.y)) this.damagePlayer(1, 'spike', null, true);
      if (this.tileAt(p.x, p.y) === T.LAVA) this.damagePlayer(1, 'lava', null, true);
      if (this.tempLava.some((l) => l.x === p.x && l.y === p.y)) this.damagePlayer(1, 'lava', null, true);
      // 蒸汽喷口推移
      this.applyVents();
      // 守护符灼磨
      if (this.has('guardian')) {
        for (const e of this.enemies) {
          if (!e.dead && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1) {
            this.hurtEnemy(e, 1, '#8fe388');
          }
        }
      }
      // 吐纳回气
      if (this.stats.regenN && this.turnCount % this.stats.regenN === 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        this.fx.floatText(p.x, p.y - 0.5, '+1', '#8fe388');
      }
      // 回声行动
      if (this.echo) this.actEcho(this.echo);
      for (const be of this.bossEchoes) if (!be.dead) this.actEcho(be);
      // 升级队列在 gainXP 中处理
      this.fx.updateHUD();
      this.autosave();
    }

    applyVents() {
      const ents = [this.player, ...this.enemies.filter((e) => !e.dead)];
      for (const ent of ents) {
        const m = this.metaAt(ent.x, ent.y);
        if (!m || !m.dir || this.tileAt(ent.x, ent.y) !== T.VENT) continue;
        const active = ((this.turnCount + m.phase) % m.period) === 0;
        if (!active) continue;
        let cx = ent.x, cy = ent.y;
        for (let i = 0; i < 2; i++) {
          const nx = cx + m.dir[0], ny = cy + m.dir[1];
          if (!this.enemyCanEnter(null, nx, ny)) break;
          cx = nx; cy = ny;
        }
        if (cx !== ent.x || cy !== ent.y) {
          ent.x = cx; ent.y = cy;
          this.fx.sfx('dash');
          if (ent === this.player) { this.enterCellEffects(cx, cy, 'player'); this.pressPlate(cx, cy, 'player'); }
        }
      }
    }

    /* ================= 技能 ================= */
    useSkill(slot) {
      const s = this.stats, p = this.player;
      if (slot === 'spark') { // 游侠星火弹
        if (p.sparkCharge < 3) { this.fx.toast(`星火充能中 ${p.sparkCharge}/3`); return false; }
        p.sparkCharge = 0;
        const [dx, dy] = p.facing;
        this.spawnProj(p.x, p.y, dx, dy, this.stats.atk + 1, 'spark', 'player');
        this.fx.sfx('bolt');
        this.endTurn('w');
        return true;
      }
      if (slot === 'freeze') {
        if (!s.unlockFreeze) return false;
        if (this.usedFreeze) { this.fx.toast('时停本层已用过'); return false; }
        this.usedFreeze = true;
        for (const e of this.enemies) if (!e.dead) e.st.frozen = 3;
        this.fx.sfx('freeze'); this.fx.toast('⏱ 时停！敌人冻结 3 回合');
        this.endTurn('w');
        return true;
      }
      if (slot === 'swap') {
        if (!s.unlockSwap) return false;
        if (this.usedSwap >= 2) { this.fx.toast('置换次数用尽(2/2)'); return false; }
        if (!this.echo || !this.echo.alive || !this.echo.spawned) { this.fx.toast('没有可置换的回声'); return false; }
        this.usedSwap++;
        const ex = this.echo.x, ey = this.echo.y;
        this.echo.x = p.x; this.echo.y = p.y;
        p.x = ex; p.y = ey;
        this.fx.sfx('swap');
        this.fx.burst(ex, ey, '#e4ccff', 14); this.fx.burst(p.x, p.y, '#e4ccff', 14);
        this.endTurn('w');
        return true;
      }
      if (slot === 'pulse') {
        if (!s.unlockPulse) return false;
        if (this.usedPulse >= 2) { this.fx.toast('脉冲次数用尽(2/2)'); return false; }
        this.usedPulse++;
        this.fx.sfx('pulse'); this.fx.shake(4);
        for (const e of this.enemies) {
          if (!e.dead && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 2) this.hurtEnemy(e, 3, '#9adfff');
        }
        this.endTurn('w');
        return true;
      }
      return false;
    }

    /* ================= 战斗结算 ================= */
    attackEnemy(enemy, forceDmg) {
      let dmg = forceDmg != null ? forceDmg : this.stats.atk;
      if (forceDmg == null && !this.firstStruck.has(enemy.uid)) {
        this.firstStruck.add(enemy.uid);
        dmg += this.stats.firstStrike;
      }
      if (this.rng() * 100 < this.stats.crit) { dmg = Math.ceil(dmg * 1.5); this.fx.floatText(enemy.x, enemy.y - 0.6, '暴击!', '#ffd700'); }
      this.hurtEnemy(enemy, dmg, '#fff');
      this.fx.hitstop(0.06);
    }

    hurtEnemy(e, dmg, color) {
      if (e.dead) return;
      if (e.st.invuln) { this.fx.floatText(e.x, e.y - 0.6, '免疫', '#aaa'); return; }
      e.hp -= dmg;
      e.flashT = 0.18;
      this.fx.sfx('hit');
      this.fx.floatText(e.x, e.y - 0.4, String(dmg), color || '#fff');
      this.fx.burst(e.x, e.y, color || e.def?.color || '#fff', 8);
      if (e.hp <= 0) this.killEnemy(e);
    }

    bumpAttack(attacker, target) { // 敌人撞玩家
      this.damagePlayer(attacker.dmg, 'contact', attacker);
      this.fx.sfx('hit');
    }

    killEnemy(e, silent) {
      if (e.dead) return;
      e.dead = true;
      this.fx.burst(e.x, e.y, e.def?.color || '#fff', e.boss ? 60 : 18);
      if (!silent) this.fx.sfx('kill');
      this.runStats.kills++;
      // 经验与金币
      const xpMul = 1 + this.stats.xpMul / 100;
      this.gainXP(Math.round(e.xp * xpMul));
      let goldAmt = e.gold + this.stats.killGold + (this.has('midas') ? 3 : 0);
      goldAmt = Math.round(goldAmt * (1 + this.stats.goldMul / 100));
      this.dropPickup(e.x, e.y, 'gold', goldAmt);
      if (this.has('lifesteal')) { this.healPlayer(1); }
      // 分裂泥
      if (e.def && e.def.splitInto && !e.def.noSplit) {
        for (const [dx, dy] of [[1, 0], [-1, 0]]) {
          if (this.enemyCanEnter(null, e.x + dx, e.y + dy)) {
            const child = E.makeEnemy(this, e.def.splitInto, e.x + dx, e.y + dy);
            this.enemies.push(child);
          }
        }
        this.fx.toast('分裂泥裂成了两半！');
      }
      // 双子判定
      if (e.bossId === 'gemini' && e.st.partner && !e.st.partner.dead) {
        this.fx.toast('守门双子倒下一尊——快解决另一尊！');
      }
      // BOSS 结算（双子需双杀才算通关）
      if (e.boss) {
        if (e.bossId === 'gemini' && e.st.partner && !e.st.partner.dead) {
          this.fx.toast('一尊倒下了——在它复活前解决另一尊！');
        } else this.onBossDead(e);
      }
      // 自爆虫临死爆炸
      if (e.type === 'bomber') this.explode(e.x, e.y, 1, e.dmg, e);
    }

    onBossDead(e) {
      this.exitLockCleared = true;
      if (this.level.exitLock) { this.level.exitLock = null; this.fx.toast('出口传送门开启了！'); this.fx.sfx('exitOpen'); }
      this.fx.sfx('bossRoar'); this.fx.shake(10); this.fx.hitstop(0.25);
      this.dropPickup(e.x, e.y, 'heart', 1);
      this.dropPickup(e.x + 1, e.y, 'dust', 10 + Math.floor(e.bossId ? e.bossId.length * 2 : 5));
      this.gainXP(e.xp);
      if (this.floor >= 100 && !this.endless) {
        this.victory = true;
        this.fx.onVictory(this.runSummary());
      } else {
        this.fx.toast(`🏆 ${e.name} 已被击败！`);
      }
    }

    /* ================= 伤害管线（玩家） ================= */
    damagePlayer(n, kind, src, quietFx) {
      const p = this.player;
      if (this.over || n <= 0) return;
      if (kind !== 'echo' && kind !== 'water' && this.invulnTurns > 0) return;
      // 蛇之狡诈闪避
      if (this.has('cunning') && this.rng() < 0.10) { this.fx.floatText(p.x, p.y - 0.6, '闪避!', '#59c9a5'); return; }
      // 影行者 / 影分结：每层首击免伤
      const firstFree = this.classId === 'shadow' || this.has('shadowstep');
      if (firstFree && !this.shadowUsed) { this.shadowUsed = true; this.fx.floatText(p.x, p.y - 0.6, '影遁!', '#c084fc'); return; }
      // 护甲
      if (this.stats.armor > 0 && n > 1) n -= this.stats.armor;
      // 防爆盾：爆炸/激光减半
      if (this.has('shieldgen') && (kind === 'explosion' || kind === 'laser')) n = Math.ceil(n / 2);
      // 偏振镜片天赋
      if (this.stats.laserHalf && kind === 'laser') n = Math.ceil(n / 2);
      // 反伤
      if (src && this.stats.thornsDmg > 0 && kind === 'contact') this.hurtEnemy(src, this.stats.thornsDmg, '#8fe388');
      // 不倒钟摆
      if (p.hp - n <= 0 && this.has('pendulum') && !this.pendulumUsed) {
        this.pendulumUsed = true; n = p.hp - 1;
        this.fx.toast('⏳ 不倒钟摆救了你一命！');
      }
      p.hp -= n;
      this.invulnTurns = Math.max(this.invulnTurns, 1);
      this.fx.sfx('hurt'); this.fx.shake(kind === 'explosion' ? 7 : 4);
      this.fx.floatText(p.x, p.y - 0.5, '-' + n, '#ff6b6b', true);
      this.fx.burst(p.x, p.y, '#ff6b6b', 12);
      this.recalcStats();
      if (p.hp <= 0) {
        // 复活检查：凤羽烬 → 不灭烛护符
        if (this.has('phoenix') && !this.reviveUsed.phoenix) {
          this.reviveUsed.phoenix = true; p.hp = 3;
          this.fx.toast('🔥 凤羽烬燃烧，你复活了！'); this.fx.sfx('heal');
        } else if (this.hasCharm('charm_revive') && !this.reviveUsed.charm) {
          this.reviveUsed.charm = true; p.hp = 3;
          this.fx.toast('🕯 不灭烛护符发光，你复活了！'); this.fx.sfx('heal');
        } else {
          this.over = true;
          this.fx.sfx('die');
          this.fx.onGameOver(this.runSummary());
        }
      }
    }
    healPlayer(n) {
      const p = this.player;
      p.hp = Math.min(p.maxHp, p.hp + n);
      this.fx.floatText(p.x, p.y - 0.5, '+' + n, '#8fe388');
      this.fx.sfx('heal');
    }

    /* ================= 投射物 ================= */
    spawnProj(x, y, dx, dy, dmg, kind, from) {
      this.projectiles.push({ x, y, px: x, py: y, dx, dy, dmg, kind: kind || 'orb', from: from || 'enemy' });
      if (!from) this.fx.sfx('bolt');
    }

    projStepAll() {
      for (const pr of this.projectiles) {
        if (pr.dead) continue;
        pr.px = pr.x; pr.py = pr.y;
        pr.x += pr.dx; pr.y += pr.dy;
        const cx = Math.round(pr.x), cy = Math.round(pr.y);
        if (!this.inBounds(cx, cy)) { pr.dead = true; continue; }
        const t = this.tileAt(cx, cy);
        if (t === T.WALL || t === T.PHASE) { pr.dead = true; this.fx.burst(cx - pr.dx * 0.5, cy - pr.dy * 0.5, '#aaa', 5); continue; }
        if (t === T.GATE && !(this.gateAt(cx, cy) || {}).open) { pr.dead = true; continue; }
        // 命中判定
        if (pr.from !== 'player') {
          if (this.player.x === cx && this.player.y === cy) {
            this.damagePlayer(pr.dmg, 'ranged', null); pr.dead = true; continue;
          }
          if (this.echo && this.echo.alive && this.echo.spawned && this.echo.x === cx && this.echo.y === cy) {
            this.shatterEcho(this.echo); pr.dead = true; continue;
          }
          for (const be of this.bossEchoes) {
            if (!be.dead && be.spawned && be.x === cx && be.y === cy) { this.shatterEcho(be); pr.dead = true; }
          }
        } else {
          const e = this.enemyAt(cx, cy);
          if (e && !(e.type === 'mimic' && e.disguise)) { this.hurtEnemy(e, pr.dmg, '#ffd27d'); pr.dead = true; }
          else if (e && e.disguise) { e.disguise = false; this.onReveal(e); this.hurtEnemy(e, pr.dmg, '#ffd27d'); pr.dead = true; }
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }

    fireLaser(e, dx, dy) {
      let x = e.x + dx, y = e.y + dy, len = 1;
      const start = [e.x, e.y];
      while (len < 14) {
        if (!this.inBounds(x, y)) break;
        const t = this.tileAt(x, y);
        if (t === T.WALL || t === T.PHASE) break;
        if (t === T.GATE && !(this.gateAt(x, y) || {}).open) break;
        const p = this.player;
        if (p.x === x && p.y === y) { this.damagePlayer(e.dmg, 'laser', e); }
        else if (this.echo && this.echo.alive && this.echo.x === x && this.echo.y === y) this.shatterEcho(this.echo);
        x += dx; y += dy; len++;
      }
      this.beams.push({ x0: start[0], y0: start[1], x1: x - dx, y1: y - dy, color: '#ff6b4a', life: 1 });
      this.fx.sfx('laser');
    }

    explode(x, y, radius, dmg, src, isPlayerBomb) {
      this.fx.sfx('explode'); this.fx.shake(8); this.fx.hitstop(0.08);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx, ty = y + dy;
          if (!this.inBounds(tx, ty)) continue;
          this.fx.burst(tx, ty, '#ff7847', 6);
          const t = this.tileAt(tx, ty);
          if ((t === T.WALL || t === T.PHASE) && isPlayerBomb && Math.abs(dx) + Math.abs(dy) <= 1 && tx > 0 && ty > 0 && tx < this.level.w - 1 && ty < this.level.h - 1) {
            this.level.grid[this.idx(tx, ty)] = T.RUBBLE; // 炸墙开路
          }
        }
      }
      for (const e of this.enemies) {
        if (!e.dead && Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= radius) {
          this.hurtEnemy(e, isPlayerBomb ? dmg : Math.ceil(dmg / 2), '#ff7847');
        }
      }
      const p = this.player;
      const distP = Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
      if (!isPlayerBomb && distP <= radius) this.damagePlayer(Math.ceil(dmg / 2), 'explosion', src);
      if (this.echo && this.echo.alive && this.echo.spawned && Math.max(Math.abs(this.echo.x - x), Math.abs(this.echo.y - y)) <= radius) {
        this.shatterEcho(this.echo);
      }
    }

    /* ================= 回声重演 ================= */
    actEcho(eco) {
      if (!eco || eco.dead) return;
      if (!eco.alive) return;
      const sp = this.level.spawn;
      if (!eco.spawned) {
        eco.spawned = true;
        eco.x = sp.x; eco.y = sp.y; eco.px = sp.x; eco.py = sp.y;
        eco.trail = [];
        this.fx.burst(sp.x, sp.y, '#e4ccff', 16);
        this.fx.toast('⟲ 你的回声出现了（重演上一层行动）');
        return;
      }
      const cmd = eco.rec[eco.i++];
      if (!cmd) {
        eco.alive = false;
        this.fx.burst(eco.x, eco.y, '#e4ccff', 12);
        this.fx.toast('回声演完了它的录像，消散了');
        return;
      }
      if (cmd.t === 'w') { eco.trail.push({ x: eco.x, y: eco.y }); return; }
      const [dx, dy] = [cmd.dx, cmd.dy];
      let nx = eco.x + dx, ny = eco.y + dy;
      const p = this.player;
      // 与玩家相撞
      if (nx === p.x && ny === p.y) {
        if (this.stats.echoSafe) {
          // 推开玩家
          const kx = p.x + dx, ky = p.y + dy;
          if (this.enemyCanEnter(null, kx, ky)) { p.x = kx; p.y = ky; this.enterCellEffects(kx, ky, 'player'); }
          this.shatterEcho(eco);
        } else {
          this.damagePlayer(1, 'echo', null);
          this.shatterEcho(eco);
        }
        return;
      }
      // 阻挡检查
      let blocked = false;
      {
        const t = this.tileAt(nx, ny);
        if (!this.inBounds(nx, ny)) blocked = true;
        else if (t === T.WALL) blocked = true;
        else if (t === T.EXIT) blocked = false;
        else if (t === T.GATE && !(this.gateAt(nx, ny) || {}).open) blocked = true;
        else if (this.enemyAt(nx, ny)) blocked = true;
        else if (this.chestAt(nx, ny)) blocked = true;
      }
      if (!blocked) {
        eco.x = nx; eco.y = ny;
        // 冰面滑行
        let guard = 0;
        while (guard++ < 30 && this.tileAt(eco.x, eco.y) === T.ICE) {
          const tx = eco.x + dx, ty = eco.y + dy;
          if (!this.enemyCanEnter(null, tx, ty)) break;
          eco.x = tx; eco.y = ty;
        }
        const pair = (this.metaAt(eco.x, eco.y) || {}).pair;
        if (pair && this.tileAt(eco.x, eco.y) === T.PORTAL) { eco.x = pair[0]; eco.y = pair[1]; }
        for (let i = 0; i < 3; i++) {
          const m = this.metaAt(eco.x, eco.y);
          if (!m || this.tileAt(eco.x, eco.y) !== T.ARROW) break;
          const ax = eco.x + m.dir[0], ay = eco.y + m.dir[1];
          if (!this.enemyCanEnter(null, ax, ay) || !this.arrowPushSafe(ax, ay)) break;
          eco.x = ax; eco.y = ay;
        }
        this.pressPlate(eco.x, eco.y, 'echo');
        this.enterCellEffects(eco.x, eco.y, eco); // 踩刺会碎
        if (this.tileAt(eco.x, eco.y) === T.WATER) { /* 回声免疫水 */ }
      }
      eco.trail.push({ x: eco.x, y: eco.y });
      if (eco.trail.length > 14) eco.trail.shift();
    }

    shatterEcho(eco) {
      if (!eco || !eco.alive) return;
      eco.alive = false;
      this.fx.sfx('echoDie');
      this.fx.burst(eco.x, eco.y, '#e4ccff', 24);
      const base = 4 + Math.floor(this.rng() * 5) + this.stats.echoDust + (this.hasTalent('t_echoxp') ? 6 : 0);
      const amt = Math.max(1, Math.round(base * (1 + (this.stats.dustMul + (this.classId === 'shadow' ? 25 : 0)) / 100)));
      this.dropPickup(eco.x, eco.y, 'dust', amt);
      this.fx.floatText(eco.x, eco.y - 0.5, `+${amt}回尘`, '#e4ccff');
    }

    /* ================= 拾取 / 宝箱 / 碎片 ================= */
    dropPickup(x, y, kind, amount) {
      // 找空位堆叠
      const exist = this.pickups.find((p) => p.x === x && p.y === y && p.kind === kind);
      if (exist) { exist.amount += amount; return; }
      this.pickups.push({ x, y, kind, amount });
    }
    collectAt(x, y) {
      for (const pk of this.pickups.filter((p) => p.x === x && p.y === y)) {
        if (pk.kind === 'gold') {
          const amt = Math.round(pk.amount * (1 + this.stats.goldMul / 100));
          this.gold += amt; this.runStats.goldEarned += amt;
          this.fx.sfx('gold'); this.fx.floatText(x, y - 0.4, '+' + amt + '金', '#ffd700');
        } else if (pk.kind === 'heart') {
          this.healPlayer(2); this.fx.floatText(x, y - 0.4, '♥', '#ff6b8a');
        } else if (pk.kind === 'key') {
          this.keys++; this.fx.sfx('gold'); this.fx.floatText(x, y - 0.4, '钥匙!', '#ffd27d');
        } else if (pk.kind === 'dust') {
          this.dust += pk.amount; this.runStats.dustEarned += pk.amount;
          this.fx.sfx('shard'); this.fx.floatText(x, y - 0.4, '+' + pk.amount + '回尘', '#e4ccff');
        }
        pk.done = true;
      }
      this.pickups = this.pickups.filter((p) => !p.done);
    }
    collectShardAt(x, y) {
      const s = this.level.shards.find((s) => !s.got && s.x === x && s.y === y);
      if (!s) return;
      s.got = true; this.runStats.shardsTotal++;
      this.fx.sfx('shard');
      this.fx.burst(x, y, '#8fe388', 20);
      const left = this.level.shards.filter((s) => !s.got).length;
      if (left === 0) {
        this.fx.toast('✦ 所有回响碎片已收集，出口开启了！');
        this.fx.sfx('exitOpen');
      } else this.fx.floatText(x, y - 0.6, `碎片 ${left} 剩`, '#8fe388');
    }
    bumpChest(chest) {
      const mimic = this.enemyAt(chest.x, chest.y);
      if (mimic && mimic.disguise) { mimic.disguise = false; this.onReveal(mimic); return; }
      if (chest.locked) {
        if (this.keys > 0) { this.keys--; chest.locked = false; this.fx.toast('用钥匙打开了上锁宝箱！'); }
        else { this.fx.toast('🔒 需要钥匙（商店有售）'); this.fx.sfx('bump'); return; }
      }
      chest.opened = true;
      const g = 15 + Math.floor(this.rng() * 16) + Math.floor(this.floor * 1.5);
      this.dropPickup(chest.x, chest.y, 'gold', g);
      if (this.rng() < 0.25) this.dropPickup(chest.x, chest.y, 'heart', 1);
      this.fx.sfx('buy');
      this.fx.burst(chest.x, chest.y, '#d8a03c', 14);
      // 小概率直接出遗物
      if (this.rng() < 0.12 && this.relicIds.length < D.RELICS.length) {
        const unowned = D.RELICS.filter((r) => !this.relicIds.includes(r.id));
        if (unowned.length) {
          const r = unowned[Math.floor(this.rng() * unowned.length)];
          this.addRelic(r.id);
        }
      }
    }

    /* ================= 楼层流程 ================= */
    buildLevel() {
      this.level = G.generateFloor(this.seed, this.floor, {});
      this.enemies = [];
      for (const spec of this.level.enemies) {
        if (spec.type === 'boss:gemini') {
          // 双子守卫：成对生成并互链
          const a = E.makeEnemy(this, spec.type, Math.max(1, spec.x - 1), spec.y);
          const b = E.makeEnemy(this, spec.type, Math.min(this.level.w - 2, spec.x + 1), spec.y);
          a.st.partner = b; b.st.partner = a;
          this.enemies.push(a, b);
          continue;
        }
        this.enemies.push(E.makeEnemy(this, spec.type, spec.x, spec.y, { disguise: !!spec.disguise }));
      }
      this.pickups = [];
      for (const k of this.level.keys || []) this.pickups.push({ x: k.x, y: k.y, kind: 'key', amount: 1 });
      this.projectiles = []; this.pendingSlams = []; this.tempLava = []; this.beams = [];
      this.exitLockCleared = false;
      this.computePlayerField();
      if (this.player) {
        this.player.x = this.level.spawn.x; this.player.y = this.level.spawn.y;
        this.player.px = this.player.x; this.player.py = this.player.y;
      }
    }

    tryExit() {
      const left = this.level.shards.filter((s) => !s.got).length;
      if (left > 0) { this.fx.toast(`还有 ${left} 枚回响碎片未收集`); return; }
      if (this.level.exitLock) { this.fx.toast('出口被封印——先击败守护者！'); return; }
      this.fx.sfx('portal');
      this.nextFloor();
    }

    nextFloor() {
      const prevRec = this.recording.slice();
      if (this.has('belt')) this.healPlayer(1);
      this.floor++;
      this.buildLevel();
      this.perFloorReset();
      this.recording = [];
      this.lastRecording = prevRec;
      this.echo = prevRec.length ? E.makeEcho(prevRec) : null;
      this.fx.onMusicBiome(this.level.biome);
      this.fx.onFloorStart(this.level);
      // 免费三选一（每 5 层）
      if (this.floor > 1 && (this.floor - 1) % D.BAL.freeDraftEvery === 0) {
        this.queueDraft('每 5 层的天塔馈赠');
      }
      // 商店层
      if (D.BAL.shopFloors(this.floor)) {
        this.fx.openShop(this.genShopStock());
      }
      if (this.level.isBoss) {
        const b = D.bossOf(this.floor);
        this.fx.toast(`⚠ 第 ${this.floor} 层 · ${b.name} — ${b.hint}`);
        this.fx.sfx('bossRoar');
        this.fx.onMusicIntensity(2);
      } else this.fx.onMusicIntensity(1);
      this.autosave();
    }

    /* ================= 成长 ================= */
    gainXP(n) {
      if (n <= 0) return;
      this.xp += n;
      let need = D.BAL.xpNeed(this.plv);
      while (this.xp >= need) {
        this.xp -= need;
        this.plv++;
        this.healPlayer(2);
        this.fx.sfx('levelup');
        this.fx.toast(`⭐ 升到 Lv.${this.plv}！`);
        this.queueDraft('升级奖励');
        need = D.BAL.xpNeed(this.plv);
      }
      this.fx.updateHUD();
    }

    queueDraft(reason) {
      const pool = D.TALENTS.filter((t) => {
        if (t.need === 'dash' && !this.stats.unlockDash) return false;
        return true;
      });
      const picks = [];
      const bag = pool.slice();
      while (picks.length < 3 && bag.length) {
        let total = 0;
        for (const t of bag) total += (t.weight || 1);
        let roll = this.rng() * total;
        let chosen = bag[0];
        for (const t of bag) { roll -= (t.weight || 1); if (roll <= 0) { chosen = t; break; } }
        picks.push(chosen);
        bag.splice(bag.indexOf(chosen), 1);
      }
      this.fx.openDraft(picks, reason || '三选一');
    }

    applyTalent(t) {
      this.talentIds.push(t.id);
      this.recalcStats();
      if (t.apply && t.apply.heal) this.healPlayer(t.apply.heal);
      if (t.apply && t.apply.gold) { this.gold += t.apply.gold; this.fx.sfx('gold'); }
      if (t.apply && t.apply.bombs) this.bombs += t.apply.bombs;
      if (t.apply && t.apply.keys) this.keys += t.apply.keys;
      this.fx.updateHUD();
    }

    addRelic(id) {
      if (this.relicIds.includes(id)) return;
      this.relicIds.push(id);
      this.recalcStats();
      const r = D.RELICS.find((x) => x.id === id);
      this.fx.toast(`✦ 获得遗物「${r.name}」：${r.desc}`);
      this.fx.sfx('levelup');
      this.fx.updateHUD();
    }

    genShopStock() {
      const disc = this.stats.shopDisc / 100;
      const bag = D.SHOP_POOL.slice();
      const stock = [];
      while (stock.length < 4 && bag.length) {
        const i = Math.floor(this.rng() * bag.length);
        const it = bag.splice(i, 1)[0];
        stock.push({ ...it, price: Math.max(10, Math.round(it.base * (1 + this.floor * 0.03) * (1 - disc))) });
      }
      return stock;
    }
    buyItem(item) {
      if (this.gold < item.price) { this.fx.toast('金币不足'); return false; }
      this.gold -= item.price;
      switch (item.id) {
        case 'shop_heal': this.healPlayer(4); break;
        case 'shop_maxhp': this.bonus.maxHp += 2; this.recalcStats(); break;
        case 'shop_atk': this.bonus.atk += 1; this.recalcStats(); break;
        case 'shop_key': this.keys++; break;
        case 'shop_bomb': this.bombs += 2; break;
        case 'shop_relic': {
          const un = D.RELICS.filter((r) => !this.relicIds.includes(r.id));
          if (un.length) this.addRelic(un[Math.floor(this.rng() * un.length)].id);
          break;
        }
        case 'shop_draft': this.queueDraft('命运重铸'); break;
        case 'shop_purify':
          if (this.echo && this.echo.alive) { this.shatterEcho(this.echo); this.echo = null; }
          else this.gold += item.price, this.fx.toast('当前没有回声可净化');
          break;
      }
      this.fx.sfx('buy');
      this.fx.updateHUD();
      return true;
    }

    /* ================= BOSS 支援效果 ================= */
    rewindPlayer(steps, dmg) {
      const p = this.player;
      const h = p.history;
      const target = h[Math.max(0, h.length - steps)] || { x: p.x, y: p.y };
      this.fx.burst(p.x, p.y, '#ffd27d', 20);
      p.x = target.x; p.y = target.y; p.px = p.x; p.py = p.y;
      this.damagePlayer(dmg, 'rewind', null);
      this.fx.toast('⏳ 时之沙漏把你拉回了过去！');
      this.fx.sfx('swap');
    }
    ringSlam(cx, cy, r, dmg, color) {
      for (let a = 0; a < 32; a++) {
        const px = cx + Math.round(Math.cos(a / 5) * r), py = cy + Math.round(Math.sin(a / 5) * r);
        if (this.inBounds(px, py)) this.fx.burst(px, py, color, 3);
      }
      const p = this.player;
      const d = Math.round(Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
      if (Math.abs(d - r) <= 0) this.damagePlayer(dmg, 'slam', null);
      this.fx.shake(3);
    }
    telegraphSlam(x, y, dmg, color) {
      this.pendingSlams.push({ x, y, dmg, at: this.turnCount + 1, color });
      this.fx.flashTile(x, y, color);
    }
    addTempLava(x, y, turns) {
      this.tempLava.push({ x, y, until: this.turnCount + turns });
    }
    beamSweep(e, angle, dmg) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let x = e.x, y = e.y;
      for (let i = 0; i < 12; i++) {
        x += dx; y += dy;
        const cx = Math.round(x), cy = Math.round(y);
        if (!this.inBounds(cx, cy)) break;
        const t = this.tileAt(cx, cy);
        if (t === T.WALL || t === T.PHASE) break;
        const p = this.player;
        if (p.x === cx && p.y === cy) { this.damagePlayer(dmg, 'laser', e); }
        if (this.echo && this.echo.alive && this.echo.x === cx && this.echo.y === cy) this.shatterEcho(this.echo);
      }
      this.beams.push({ x0: e.x, y0: e.y, x1: x, y1: y, color: '#ff5edb', life: 1 });
    }
    arrowStorm(bx, by, radius) {
      let placed = 0;
      for (let t = 0; t < 30 && placed < radius * 3; t++) {
        const x = bx + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
        const y = by + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
        if (!this.inBounds(x, y) || this.tileAt(x, y) !== T.FLOOR) continue;
        this.level.grid[this.idx(x, y)] = T.ARROW;
        this.level.meta[this.idx(x, y)] = { dir: [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(this.rng() * 4)] };
        placed++;
      }
      this.fx.toast('🌀 发条暴君扭转了地砖！');
    }
    spawnBossEcho() {
      if (!this.recording.length && !this.lastRecording.length) return;
      const eco = E.makeEcho(this.recording.length ? this.recording : this.lastRecording);
      eco.spawned = false;
      this.bossEchoes.push(eco);
      this.fx.toast('回声克隆体出现了！');
    }

    /* ================= AI 表现钩子 ================= */
    moveEnemy(e, nx, ny, ghost) {
      e.facing = Math.sign(nx - e.x) || e.facing;
      e.x = nx; e.y = ny;
      if (!ghost) { /* 普通移动 */ }
    }
    onTelegraph(e) { this.fx.floatText(e.x, e.y - 0.7, '!', '#ff6b4a', true); }
    onWake(e) { this.fx.floatText(e.x, e.y - 0.7, '醒了!', '#b8a58c'); this.fx.sfx('bump'); }
    onReveal(e) { this.fx.toast('是宝箱怪！'); this.fx.sfx('hit'); this.fx.burst(e.x, e.y, '#d8a03c', 12); }
    blinkFx(e) { this.fx.burst(e.x, e.y, '#c084fc', 12); }
    burstAt(x, y, c, n) { this.fx.burst(x, y, c, n); }
    toast(m) { this.fx.toast(m); }
    shake(m) { this.fx.shake(m); }
    sfx(n) { this.fx.sfx(n); }

    /* ================= 存档与总结 ================= */
    runSummary() {
      return {
        floor: this.floor, level: this.plv, kills: this.runStats.kills,
        gold: this.gold, dust: this.dust, steps: this.runStats.stepsTotal,
        shards: this.runStats.shardsTotal, time: Math.round((Date.now() - this.runStats.startTime) / 1000),
        classId: this.classId, seed: this.seed, victory: this.victory,
      };
    }
    snapshot() {
      return {
        v: 1, seed: this.seed, floor: this.floor, endless: this.endless,
        classId: this.classId, charms: this.charms,
        relicIds: this.relicIds,
        gold: this.gold, dust: this.dust, bombs: this.bombs, keys: this.keys,
        xp: this.xp, lv: this.plv, hp: this.player.hp, bonus: this.bonus,
        lastRecording: (this.echo && this.echo.alive && this.echo.spawned) ? [] : this.recording.slice(),
        runStats: this.runStats, reviveUsed: this.reviveUsed,
      };
    }
    autosave() {
      try { localStorage.setItem('echoTower.run', JSON.stringify(this.snapshot())); } catch (e) { /* ignore */ }
    }
  }

  /* 从快照恢复运行（重建该层） */
  Game.prototype.restoreFrom = function (s) {
    this.seed = s.seed; this.floor = s.floor; this.endless = s.endless;
    this.classId = s.classId; this.charms = s.charms || [];
    this.relicIds = s.relicIds || [];
    this.gold = s.gold; this.dust = s.dust; this.bombs = s.bombs; this.keys = s.keys;
    this.xp = s.xp; this.plv = s.lv || 1;
    this.bonus = s.bonus || { maxHp: 0, atk: 0 };
    Object.assign(this.runStats, s.runStats || {});
    this.reviveUsed = s.reviveUsed || { phoenix: false, charm: false };
    this.lastRecording = s.lastRecording || [];
    this.buildLevel();
    this.initPlayer();
    this.player.hp = Math.max(1, Math.min(s.hp || 6, this.player.maxHp));
  };

  window.EchoGame = { create: (opts) => new Game(opts), DIRV };
})();
