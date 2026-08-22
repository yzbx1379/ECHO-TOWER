/* 《回声之塔》生成器自动化校验
 * 运行： node test/gen.test.cjs
 * 断言（多种子 × 全部100层）：
 *  1. 每层生成成功，出生点/出口合法
 *  2. 所有碎片从出生点可达；出口可达
 *  3. 【硬指标】普通层 Held-Karp 最优通关路线 ≥ 50 步（目标值 52~76）
 *     BOSS 层符文路线 ≥ 40 步（BOSS 战本身另计数十回合）
 *  4. 实体不落在墙里；门-板配对完整
 */
'use strict';
const path = require('path');
const Gen = require(path.join(__dirname, '..', 'js', 'gen.js'));
const Data = require(path.join(__dirname, '..', 'js', 'data.js'));

const SEEDS = [1, 42, 1337, 777, 20250101];
let fails = 0, checks = 0;
const fail = (msg) => { fails++; console.error('  ✗ ' + msg); };
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); };

const t0 = Date.now();
let maxMs = 0, sumMs = 0, n = 0;
let minOpt = Infinity, minOptFloor = null;

for (const seed of SEEDS) {
  for (let f = 1; f <= 100; f++) {
    const ts = Date.now();
    const L = Gen.generateFloor(seed, f, {});
    const ms = Date.now() - ts;
    maxMs = Math.max(maxMs, ms); sumMs += ms; n++;
    const tag = `seed${seed} F${f}`;
    if (!L) { fail(`${tag} 未生成`); continue; }
    const { w, h, grid } = L;
    const idx = (x, y) => y * w + x;

    ok(L.w >= 26 && L.h >= 16 && L.grid.length === w * h, `${tag} 尺寸异常 ${w}x${h}`);
    ok(grid[idx(L.spawn.x, L.spawn.y)] === Gen.T.FLOOR, `${tag} 出生点不是地板`);
    ok(grid[idx(L.exit.x, L.exit.y)] === Gen.T.EXIT, `${tag} 出口不是EXIT`);

    const K = L.isBoss ? 4 : Data.BAL.shardCount(f);
    ok(L.shards.length === K, `${tag} 碎片数 ${L.shards.length} ≠ ${K}`);

    const dS = Gen.stateBFS(L, L.spawn.x, L.spawn.y);
    for (const s of L.shards) {
      ok(isFinite(dS[idx(s.x, s.y)]), `${tag} 碎片(${s.x},${s.y})不可达`);
      ok(grid[idx(s.x, s.y)] !== Gen.T.WALL, `${tag} 碎片在墙里`);
    }
    ok(isFinite(dS[idx(L.exit.x, L.exit.y)]), `${tag} 出口不可达`);
    for (const e of L.enemies) {
      const t = grid[idx(e.x, e.y)];
      ok(Gen.PASSABLE.has(t), `${tag} 敌人${e.type}@(${e.x},${e.y})落在不可通行块 t=${t}`);
    }
    for (const g of L.gates) {
      ok(L.plates.some((p) => p.group === g.group), `${tag} 门无对应压力板 group=${g.group}`);
    }

    // —— 硬指标 ——
    if (L.isBoss) {
      ok(L.minSteps >= 40, `${tag} BOSS层符文路线仅 ${L.minSteps} (<40)`);
      if (L.minSteps < Data.BAL.stepTarget(f) - 10) console.warn(`  ⚠ ${tag} BOSS层 ${L.minSteps} 低于软目标`);
    } else {
      const target = Data.BAL.stepTarget(f);
      ok(L.minSteps >= 50, `${tag} 最优路线 ${L.minSteps} < 50（硬指标）`); // 绝不妥协
      if (L.minSteps < target) console.warn(`  ⚠ ${tag} 最优路线 ${L.minSteps} 低于缓冲目标 ${target}（仍满足≥50）`);
    }
    if (!L.isBoss && L.minSteps < minOpt) { minOpt = L.minSteps; minOptFloor = `${seed}/F${f}`; }
  }
}

console.log('—————————————————————————————');
console.log(`断言通过: ${checks - fails}/${checks}`);
console.log(`生成层数: ${n}  总耗时 ${(Date.now() - t0) / 1000 | 0}s  平均 ${(sumMs / n).toFixed(1)}ms/层  峰值 ${maxMs}ms`);
console.log(`全普通层最短最优路线: ${minOpt} 步 @ ${minOptFloor}`);
if (fails > 0) { console.error(`✗ ${fails} 项失败`); process.exit(1); }
console.log('✓ 全部通过');
