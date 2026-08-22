/* 《回声之塔》端到端逻辑模拟测试
 * 用最优路线机器人在真实游戏逻辑里爬塔：
 *   走图 → 收集碎片 → 出口 → 下一层 …… 直到通过 BOSS 层(第10层)
 * 验证：移动语义(滑冰/传送/箭头)、机关门、回声重演、战斗、楼层流转全链路。
 * 运行： node test/sim.test.cjs
 */
'use strict';
const path = require('path');

// ---- 浏览器环境垫片 ----
global.window = global;
global.self = global;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

window.EchoData = require(path.join('..', 'js', 'data.js'));
window.EchoGen = require(path.join('..', 'js', 'gen.js'));
require(path.join(__dirname, '..', 'js', 'core.js'));
require(path.join(__dirname, '..', 'js', 'audio.js'));
require(path.join(__dirname, '..', 'js', 'entities.js'));
require(path.join(__dirname, '..', 'js', 'systems.js'));

const G = window.EchoGen, D = window.EchoData, T = G.T;

/* ---------------- 模拟玩家 ---------------- */
function blocked(g, x, y) {
  const t = g.tileAt(x, y);
  const gt = g.gateAt(x, y);
  // 注意：不把敌人算作阻挡 —— 走向敌人格 = 撞击攻击（doMove 自动处理）
  return !g.inBounds(x, y) || t === T.WALL || t === T.PHASE ||
    (t === T.GATE && !(gt && gt.open)) || (!!g.chestAt(x, y));
}
/* 与 doMove 完全一致的落点模型：滑冰→传送→箭头 */
function landing(g, cx, cy, d) {
  const [dx, dy] = d;
  const nx = cx + dx, ny = cy + dy;
  if (blocked(g, nx, ny)) return null;
  let x = nx, y = ny, guard = 0;
  while (guard++ < 40) {
    if (g.tileAt(x, y) !== T.ICE) break;
    const tx = x + dx, ty = y + dy;
    if (blocked(g, tx, ty) || g.tileAt(tx, ty) === T.EXIT) break;
    x = tx; y = ty;
  }
  const meta = g.metaAt(x, y);
  if (meta && meta.pair && g.tileAt(x, y) === T.PORTAL) { x = meta.pair[0]; y = meta.pair[1]; }
  for (let i = 0; i < 3; i++) {
    const m = g.metaAt(x, y);
    if (!m || g.tileAt(x, y) !== T.ARROW) break;
    const ax = x + m.dir[0], ay = y + m.dir[1];
    if (blocked(g, ax, ay)) break;
    x = ax; y = ay;
  }
  return [x, y];
}
const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

/* BFS：返回从 (sx,sy) 到目标的首个动作名，找不到返回 null */
function firstActionToward(g, sx, sy, isGoal) {
  if (isGoal(sx, sy)) return null;
  const W = g.level.w;
  const seen = new Set([sy * W + sx]);
  let q = [[sx, sy, null]];
  while (q.length) {
    const nq = [];
    for (const [x, y, act0] of q) {
      for (const [name, d] of Object.entries(DIRS)) {
        const l = landing(g, x, y, d);
        if (!l) continue;
        const [lx, ly] = l;
        const key = ly * W + lx;
        if (seen.has(key)) continue;
        seen.add(key);
        const act = act0 || name;
        if (isGoal(lx, ly)) return act;
        nq.push([lx, ly, act]);
      }
    }
    q = nq;
  }
  return null;
}

/* ---------------- 主模拟 ---------------- */
function simulate(seed, maxFloor) {
  const drafts = [];
  const game = window.EchoGame.create({
    seed, floor: 1, classId: 'knight',
    charms: [], fx: {
      toast() {}, shake() {}, burst() {}, floatText() {}, sfx() {}, hitstop() {},
      flashTile() {}, updateHUD() {}, onMusicBiome() {}, onMusicIntensity() {}, onFloorStart() {},
      openDraft: (choices, reason) => { drafts.push(reason); game.applyTalent(choices[0]); },
      openShop: () => {},
      onGameOver: (s) => { throw new Error('模拟中死亡于第 ' + s.floor + ' 层'); },
      onVictory: () => {},
    },
  });
  // 测试作弊：巨大生命值（专注验证逻辑链路而非平衡）
  game.player.maxHp = 9999; game.player.hp = 9999;
  let totalTurns = 0;
  const log = [];
  const lastActs = [];

  while (game.floor <= maxFloor && totalTurns < 20000) {
    const L = game.level;
    // 不再强制开门：机器人必须真实地踩压力板充能（验证防软锁设计）

    // 目标序列：关着的门→找板充能 → 未收集碎片 → （BOSS层）击杀 BOSS → 出口
    let guard = 0;
    let failStreak = 0;
    while (guard++ < 8000) {
      totalTurns++;
      if (totalTurns % 500 === 0) log.push(`F${game.floor}@${totalTurns}`);
      const pendingShard = L.shards.find((s) => !s.got);
      let act = null;
      const px0 = game.player.x, py0 = game.player.y;
      // ① 关门充能：只挑"压力板当前可达"的门（板可能要穿过另一扇门时先放一放）
      for (const cg of L.gates.filter((g) => !g.open)) {
        const plates = L.plates.filter((p) => p.group === cg.group);
        if (!plates.length) continue;
        const onPlate = plates.some((p) => p.x === px0 && p.y === py0);
        if (onPlate) {
          act = ['up', 'down', 'left', 'right'].find((n) => {
            const l = landing(game, px0, py0, DIRS[n]);
            return l && !plates.some((p) => p.x === l[0] && p.y === l[1]);
          }) || 'wait';
          break;
        }
        const near = plates.reduce((a, b) =>
          (Math.abs(a.x - px0) + Math.abs(a.y - py0)) <= (Math.abs(b.x - px0) + Math.abs(b.y - py0)) ? a : b);
        const a = firstActionToward(game, px0, py0, (x, y) => x === near.x && y === near.y);
        if (a != null) { act = a; break; }
      }
      // ② 碎片
      if (act == null && pendingShard) {
        act = firstActionToward(game, game.player.x, game.player.y,
          (x, y) => landing2Goal(x, y, pendingShard));
      }
      // ③ BOSS（出口锁定时）
      if (act == null && L.exitLock) {
        const bosses = game.enemies.filter((e) => e.boss && !e.dead);
        const target = bosses.find((b) => Math.abs(b.x - game.player.x) + Math.abs(b.y - game.player.y) === 1);
        if (target) {
          // 正交贴身 → 出拳！
          act = ['right', 'left', 'down', 'up'].find((n) => {
            const [dx, dy] = DIRS[n];
            return game.player.x + dx === target.x && game.player.y + dy === target.y;
          });
        } else if (bosses.length) {
          const boss = bosses[0];
          act = firstActionToward(game, game.player.x, game.player.y,
            (x, y) => Math.max(Math.abs(x - boss.x), Math.abs(y - boss.y)) <= 1 && !(x === game.player.x && y === game.player.y));
        }
      }
      // ④ 出口
      if (act == null && !L.exitLock) {
        const px = game.player.x, py = game.player.y;
        act = firstActionToward(game, px, py,
          (x, y) => game.tileAt(x, y) === T.EXIT && !(x === px && y === py));
        if (act == null && game.tileAt(px, py) === T.EXIT) {
          // 已站在出口上（解锁后）：先走开一步，下回合再踏入
          act = ['up', 'down', 'left', 'right'].find((n) => {
            const l = landing(game, px, py, DIRS[n]);
            return l && !(l[0] === px && l[1] === py);
          }) || 'wait';
        }
      }
      if (act == null) {
        // 无路可走：若有正交相邻敌人（含BOSS/幽灵）→ 出拳清路；否则等待
        const adj = game.enemies.find((e) => !e.dead &&
          Math.abs(e.x - game.player.x) + Math.abs(e.y - game.player.y) === 1);
        if (adj && failStreak > 1) {
          act = ['right', 'left', 'down', 'up'].find((n) => {
            const [dx, dy] = DIRS[n];
            return game.player.x + dx === adj.x && game.player.y + dy === adj.y;
          });
        }
        if (act == null) {
          failStreak++;
          if (failStreak > 60) {
            console.error(`\n=== 失败现场 F${game.floor} 玩家@(${game.player.x},${game.player.y}) ===`);
            const pend = game.level.shards.filter(s => !s.got);
            console.error('未收集碎片:', pend.map(s => `(${s.x},${s.y})`).join(' ') || '无',
              '| 出口锁定:', !!game.level.exitLock);
            // 可达域
            const W = game.level.w;
            const reach = new Set([game.player.y * W + game.player.x]);
            let q = [[game.player.x, game.player.y]];
            while (q.length) {
              const nq = [];
              for (const [x, y] of q) for (const d of Object.values(DIRS)) {
                const l = landing(game, x, y, d);
                if (!l) continue;
                const k = l[1] * W + l[0];
                if (!reach.has(k)) { reach.add(k); nq.push(l); }
              }
              q = nq;
            }
            for (const s of pend) console.error(`  碎片(${s.x},${s.y}) ${reach.has(s.y * W + s.x) ? '可达' : '不可达!'}`);
            console.error(`  出口(${game.level.exit.x},${game.level.exit.y}) ${reach.has(game.level.exit.y * W + game.level.exit.x) ? '可达' : '不可达!'}`);
            // 最小探针
            console.error('探针 tileAt(19,2)=', game.tileAt(19, 2), ' enemyAt=', !!game.enemyAt(19, 2),
              ' chestAt=', !!game.chestAt(19, 2), ' gateAt=', JSON.stringify(game.gateAt(19, 2)),
              ' landing(20,2,left)=', JSON.stringify(landing(game, 20, 2, DIRS.left)),
              ' landing(20,2,down)=', JSON.stringify(landing(game, 20, 2, DIRS.down)),
              ' reachSize=', reach.size);
            console.error('全部门:', JSON.stringify(game.level.gates));
            console.error('gateAt(18,2)=', JSON.stringify(game.gateAt(18, 2)),
              ' tileAt(18,2)=', game.tileAt(18, 2),
              ' blocked(18,2)=', blocked(game, 18, 2),
              ' landing(19,2,left)=', JSON.stringify(landing(game, 19, 2, DIRS.left)));
            console.error('敌人:', game.enemies.filter(e => !e.dead).map(e => `${e.type}@(${e.x},${e.y})`).join(' '));
            const W2 = game.level.w;
            const GL = { 0: '#', 1: '.', 2: '~', 3: '-', 4: 'L', 5: 'W', 6: 'r', 7: 'G', 8: 'X', 9: 'O', 10: 'V', 11: '>', 12: 'P', 13: 'F' };
            for (let y = 0; y < game.level.h; y++) {
              let row = '';
              for (let x = 0; x < game.level.w; x++) {
                let ch = GL[game.tileAt(x, y)] || '?';
                if (game.enemyAt(x, y)) ch = 'e';
                if (game.chestAt(x, y)) ch = 'C';
                for (const s of game.level.shards) if (s.x === x && s.y === y && !s.got) ch = '*';
                if (game.level.exit.x === x && game.level.exit.y === y) ch = 'X';
                if (game.echo && game.echo.alive && game.echo.spawned && game.echo.x === x && game.echo.y === y) ch = 'E';
                if (game.player.x === x && game.player.y === y) ch = '@';
                row += ch;
              }
              console.error(row);
            }
            throw new Error(`F${game.floor} 寻路失败(连续等待${failStreak}次)`);
          }
          game.handleAction({ action: 'wait', shift: false });
        } else failStreak = 0;
        continue;
      }
      failStreak = 0;
      const floorBefore = game.floor;
      lastActs.push(`${act}@(${game.player.x},${game.player.y})`);
      if (lastActs.length > 24) lastActs.shift();
      game.handleAction({ action: act, shift: false });
      if (act === 'wait') continue;
      if (game.floor !== floorBefore) break; // 已进入下一层，回到外层重新初始化
    }
    log.push(`F${game.floor}: 回合${totalTurns} 天赋${drafts.length}`);
    if (game.over) throw new Error('模拟中死亡');
  }
  return { game, totalTurns, drafts, log, lastActs };
}
function landing2Goal(x, y, shard) { return x === shard.x && y === shard.y; }

/* ---------------- 运行多种子 ---------------- */
let failed = 0;
const ONLY = process.env.ECHO_SIM_SEED ? Number(process.env.ECHO_SIM_SEED) : null;
for (const seed of (ONLY ? [ONLY] : [12345, 777, 20250101])) {
  try {
    const t0 = Date.now();
    const r = simulate(seed, 11); // 爬到第 11 层（含第 10 层双子 BOSS 战）
    if (r.game.floor <= 11) {
      console.error(`✗ seed=${seed} 未通过第10层：停在 F${r.game.floor}`);
      console.error('敌人:', r.game.enemies.filter(e => !e.dead).map(e => `${e.type}@(${e.x},${e.y})hp${e.hp}`).join(' '));
      console.error('碎片:', r.game.level.shards.map(s => `(${s.x},${s.y})${s.got ? '✓' : '✗'}`).join(' '),
        '出口锁:', !!r.game.level.exitLock, '玩家@', `(${r.game.player.x},${r.game.player.y})`);
      console.error('最近动作:', r.lastActs.join(' → '));
      failed++;
      continue;
    }
    console.log(`✓ seed=${seed} 通过：${r.totalTurns} 回合登至 F${r.game.floor} · 获得 ${r.drafts.length} 次天赋 · ${Date.now() - t0}ms`);
  } catch (e) {
    failed++;
    console.error(`✗ seed=${seed} 失败：${e.message}`);
    console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  }
}
if (failed) process.exit(1);
console.log('✓ 端到端模拟全部通过');
