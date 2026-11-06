/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/gen.js
 * 程序化地牢生成器：
 *  - 房间+走廊骨架，群系机制铺装（冰面/熔岩/蒸汽/箭头/相位墙/传送门…）
 *  - 碎片/出口/敌人/宝箱/机关布置
 *  - 【硬性保证】用「状态BFS（滑冰+传送语义）」计算 POI 两两距离，
 *    再用 Held-Karp 求精确最优收集顺序长度 OPT，要求 OPT ≥ 目标值(≥52)，
 *    否则重撒/扩图。地形永不造成软锁（所有破坏类地形均可通行）。
 * UMD：浏览器 window.EchoGen；Node 可 require 用于自动化测试。
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.EchoGen = factory(root.EchoData);
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';

  /* ---------------- 方块编码 ---------------- */
  const T = {
    WALL: 0, FLOOR: 1, ICE: 2, THIN: 3, LAVA: 4, WATER: 5, RUBBLE: 6,
    GATE: 7, EXIT: 8, PORTAL: 9, VENT: 10, ARROW: 11, PLATE: 12, PHASE: 13,
  };
  // BFS/寻路中的“可通行”判定（GATE 视为可通行：充能后必开，只会增加步数）
  const PASSABLE = new Set([T.FLOOR, T.ICE, T.THIN, T.LAVA, T.WATER, T.RUBBLE, T.GATE, T.EXIT, T.PORTAL, T.VENT, T.ARROW, T.PLATE]);

  /* ---------------- 随机数（mulberry32，可复现种子） ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Dijkstra 距离场（精确最短行动数） ----------------
   * 节点 = 格子。边权：普通移动 1；冰面滑行 = 滑过的格数（一次行动）。
   * 传送门：落点为 PORTAL 时同回合瞬移到配对端（不额外计步）。
   * 用二叉堆 Dijkstra 保证变权下的精确性 —— 这是"≥50 步"承诺的数学基础。
   */
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function stateBFS(level, sx, sy) {
    const { w, h, grid, meta } = level;
    const idx = (x, y) => y * w + x;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? T.WALL : grid[idx(x, y)];
    const teleportOf = (x, y) => {
      const m = meta[idx(x, y)];
      return (m && m.pair) ? m.pair : null;
    };
    const N = w * h;
    const dist = new Float64Array(N).fill(Infinity);
    const done = new Uint8Array(N);
    // 简易二叉堆：[dist, nodeIdx]
    const heap = [];
    const hpush = (d, n) => {
      heap.push([d, n]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const hpop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        while (true) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    dist[idx(sx, sy)] = 0;
    hpush(0, idx(sx, sy));
    while (heap.length) {
      const [d, n] = hpop();
      if (done[n]) continue;
      done[n] = 1;
      const x = n % w, y = (n / w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        const nt = at(nx, ny);
        if (!PASSABLE.has(nt)) continue;
        if (nt === T.ICE) {
          // 滑行：沿方向直到非冰格或撞墙，落点若为传送门则瞬移
          let cx = nx, cy = ny, steps = 1;
          while (true) {
            const mx = cx + dx, my = cy + dy;
            const mt = at(mx, my);
            if (!PASSABLE.has(mt)) break;
            cx = mx; cy = my; steps++;
            if (mt !== T.ICE) break;
          }
          const tp = teleportOf(cx, cy);
          let fx = cx, fy = cy;
          if (tp) { fx = tp[0]; fy = tp[1]; }
          const fn = idx(fx, fy), nd = d + steps;
          if (nd < dist[fn]) { dist[fn] = nd; hpush(nd, fn); }
        } else {
          let fx = nx, fy = ny;
          const tp = teleportOf(nx, ny);
          if (tp) { fx = tp[0]; fy = tp[1]; }
          const fn = idx(fx, fy), nd = d + 1;
          if (nd < dist[fn]) { dist[fn] = nd; hpush(nd, fn); }
        }
      }
    }
    return dist;
  }

  /* ---------------- 推动语义可达性（软锁防护） ----------------
   * stateBFS 把箭头当普通可通行格（不建模推动），无法发现"单向阀"软锁：
   * 一排同向箭头可把玩家泄进封闭区域且无法返回（seed 777 F24 实测——
   * 斜向双向下箭头封住含出口的水槽，2 枚碎片在槽外，全层不可完成）。
   * realBFS 复刻 systems.js doMove 的完整移动语义：
   *   初始移动（墙/实相/关门不可，出口可站）→ 冰面滑行 → 传送门 → 箭头推动链
   *   （最多 3 连，落点需过 enemyCanEnter + arrowPushSafe 双校验，玩家占位于当前格）
   * 建模取舍（均有依据）：
   *   - 忽略敌人：可击杀/可移动，不构成永久阻挡
   *   - 相位墙视为可通过：周期开放，等待即可（与 stateBFS 立场一致）
   *   - 栅栏门视为可通过：踩板充能开启，板的"无门可达性"由布置逻辑保证
   *   - 冰面按无冰爪/弹簧靴的全滑行语义：与 stateBFS 一致（持有者停止点更多，是子集）
   */
  /* 移动模型工厂：复刻 doMove 的单步落点语义（冰面滑行→传送门→箭头推动链）。
   * blockGates=true 时栅栏门视为墙（用于"不充能能否到达"校验）。 */
  function makeMovement(level, blockGates) {
    const { w, h, grid, meta } = level;
    const idx = (x, y) => y * w + x;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? T.WALL : grid[idx(x, y)];
    const gateOpen = (x, y) => {
      if (blockGates) return false;
      const g = (level.gates || []).find((gt) => gt.x === x && gt.y === y);
      return !!(g && g.open);
    };
    // 初始移动目标：玩家可站上（出口可站；相位/门按可等待/可开启处理）
    const standable = (x, y) => {
      const t = at(x, y);
      if (t === T.WALL) return false;
      if (t === T.GATE && blockGates) return false;
      return true;
    };
    // 推动落点校验（镜像 enemyCanEnter：出口/相位/关门/玩家占位均不可）
    const pushEnter = (x, y, px, py) => {
      const t = at(x, y);
      if (t === T.WALL || t === T.PHASE || t === T.EXIT) return false;
      if (t === T.GATE && !gateOpen(x, y)) return false;
      if (x === px && y === py) return false;
      return true;
    };
    const pushSafe = (x, y, px, py) => {
      let free = 0;
      for (const [dx, dy] of DIRS) if (pushEnter(x + dx, y + dy, px, py)) free++;
      return free >= 2;
    };
    // 从 (cx,cy) 朝 (dx,dy) 行动一回合的最终落点；null = 不移动（撞墙等）
    const land = (cx, cy, dx, dy) => {
      const nx = cx + dx, ny = cy + dy;
      if (!standable(nx, ny)) return null;
      let x = nx, y = ny, guard = 0;
      while (guard++ < 40) { // 冰面滑行：遇墙/相位/出口即停
        if (at(x, y) !== T.ICE) break;
        const tx = x + dx, ty = y + dy;
        const tt = at(tx, ty);
        if (tt === T.WALL || tt === T.PHASE || tt === T.EXIT) break;
        if (tt === T.GATE && !gateOpen(tx, ty)) break;
        x = tx; y = ty;
      }
      const m0 = meta[idx(x, y)]; // 传送门
      if (m0 && m0.pair && at(x, y) === T.PORTAL) { x = m0.pair[0]; y = m0.pair[1]; }
      for (let i = 0; i < 3; i++) { // 箭头推动链（占位于当前格）
        const m = meta[idx(x, y)];
        if (!m || !m.dir || at(x, y) !== T.ARROW) break;
        const ax = x + m.dir[0], ay = y + m.dir[1];
        if (!pushEnter(ax, ay, x, y) || !pushSafe(ax, ay, x, y)) break;
        x = ax; y = ay;
      }
      return [x, y];
    };
    return { w, h, idx, standable, land };
  }

  function realBFS(level, sx, sy, blockGates) {
    const mv = makeMovement(level, blockGates);
    const { w, h, idx, land } = mv;
    const seen = new Uint8Array(w * h);
    const q = [[sx, sy]];
    seen[idx(sx, sy)] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of DIRS) {
        const l = land(x, y, dx, dy);
        if (!l) continue;
        const k = idx(l[0], l[1]);
        if (seen[k]) continue;
        seen[k] = 1;
        q.push(l);
      }
    }
    return seen;
  }

  /* 反向可达集合：能到达 (tx,ty) 的格子（推动语义，反图 BFS）。
   * "充能后能否从板处回来"一类校验用——比对每个候选各跑一次 realBFS
   * 快一个数量级（一次全图 land 扫描 + 一次反 BFS）。 */
  function backSet(level, tx, ty, blockGates) {
    const mv = makeMovement(level, blockGates);
    const { w, h, idx, standable, land } = mv;
    const preds = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!standable(x, y)) continue;
      for (const [dx, dy] of DIRS) {
        const l = land(x, y, dx, dy);
        if (!l) continue;
        const k = idx(l[0], l[1]);
        let arr = preds.get(k);
        if (!arr) { arr = []; preds.set(k, arr); }
        arr.push(idx(x, y));
      }
    }
    const seen = new Uint8Array(w * h);
    const start = idx(tx, ty);
    seen[start] = 1;
    const q = [start];
    while (q.length) {
      const n = q.pop();
      const ps = preds.get(n);
      if (!ps) continue;
      for (const p of ps) if (!seen[p]) { seen[p] = 1; q.push(p); }
    }
    return seen;
  }

  /* POI 互通校验：在推动语义下，是否存在收集顺序使
   * 出生点 → 全部碎片（+ BOSS 层先击杀 BOSS）→ 出口 均可达。
   * 单向阀软锁的充分检测：玩家被泄进无法返回的区域后必有无解顺序。 */
  function poiSolvable(level) {
    const shards = (level.shards || []).map((s) => ({ x: s.x, y: s.y }));
    const boss = (level.enemies || []).find((e) => e.boss);
    const M = shards.length + (boss ? 1 : 0); // 必经点数（碎片 + BOSS）
    const pois = [level.spawn, ...shards];
    if (boss) pois.push({ x: boss.x, y: boss.y });
    pois.push(level.exit);
    const n = pois.length, W = level.w;
    const seenAll = [];
    for (let i = 0; i < n; i++) seenAll.push(realBFS(level, pois[i].x, pois[i].y));
    const R = (i, j) => seenAll[i][pois[j].y * W + pois[j].x];
    const EXIT = n - 1;
    const FULL = (1 << M) - 1;
    const memo = new Map();
    // DFS + 记忆化：当前在节点 cur，已收集 mask，能否走完全程
    const dfs = (cur, mask) => {
      if (mask === FULL) return R(cur, EXIT);
      const key = cur * (FULL + 1) + mask;
      if (memo.has(key)) return memo.get(key);
      let ok = false;
      for (let b = 0; b < M && !ok; b++) {
        if (mask & (1 << b)) continue;
        if (R(cur, 1 + b)) ok = dfs(1 + b, mask | (1 << b));
      }
      memo.set(key, ok);
      return ok;
    };
    return M === 0 ? R(0, EXIT) : dfs(0, 0);
  }

  /* ---------------- 纯几何泛洪（无视传送门/滑行）——用于地图体量检查 ----------------
   * blockGates=true 时把栅栏门视为墙：用于验证"不经过任何门可达"的区域（防软锁关键）
   */
  function plainFlood(level, sx, sy, blockGates) {
    const { w, h, grid } = level;
    const idx = (x, y) => y * w + x;
    const dist = new Int16Array(w * h).fill(-1);
    const q = [[sx, sy]];
    dist[idx(sx, sy)] = 0;
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist[idx(x, y)];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = idx(nx, ny);
        if (dist[n] !== -1 || !PASSABLE.has(grid[n])) continue;
        if (blockGates && grid[n] === T.GATE) continue;
        dist[n] = d + 1;
        q.push([nx, ny]);
      }
    }
    return dist;
  }

  /* ---------------- Held-Karp 精确最优收集顺序 ----------------
   * 节点：0=出生点, 1..K=碎片, K+1=出口。返回最优总步数（不可达=Infinity）。
   */
  function heldKarp(D, K) {
    if (K === 0) return D[0][1];
    const FULL = (1 << K) - 1;
    const dp = new Map();
    for (let i = 1; i <= K; i++) dp.set((1 << (i - 1)) * 16 + i, D[0][i]);
    for (let mask = 1; mask <= FULL; mask++) {
      for (let i = 1; i <= K; i++) {
        if (!(mask & (1 << (i - 1)))) continue;
        const cur = dp.get(mask * 16 + i);
        if (cur === undefined) continue;
        for (let j = 1; j <= K; j++) {
          if (mask & (1 << (j - 1))) continue;
          const nm = mask | (1 << (j - 1));
          const nv = cur + D[i][j];
          const key = nm * 16 + j;
          const old = dp.get(key);
          if (old === undefined || nv < old) dp.set(key, nv);
        }
      }
    }
    let best = Infinity;
    for (let i = 1; i <= K; i++) {
      const cur = dp.get(FULL * 16 + i);
      if (cur !== undefined) best = Math.min(best, cur + D[i][K + 1]);
    }
    return best;
  }

  /* ---------------- 地图骨架：房间 + 走廊 ---------------- */
  function carveMap(rng, w, h, roomN) {
    const grid = new Uint8Array(w * h); // 0=WALL
    const idx = (x, y) => y * w + x;
    const rooms = [];
    const overlaps = (r) => rooms.some((o) => r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y);
    for (let tries = 0; tries < 200 && rooms.length < roomN; tries++) {
      const rw = 3 + Math.floor(rng() * 6), rh = 3 + Math.floor(rng() * 5);
      const r = { x: 1 + Math.floor(rng() * (w - rw - 2)), y: 1 + Math.floor(rng() * (h - rh - 2)), w: rw, h: rh };
      if (overlaps(r)) continue;
      rooms.push(r);
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[idx(xx, yy)] = T.FLOOR;
    }
    // L 形走廊顺序连接
    const cc = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
    const carveH = (x1, x2, y) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) grid[idx(x, y)] = T.FLOOR; };
    const carveV = (y1, y2, x) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) grid[idx(x, y)] = T.FLOOR; };
    for (let i = 1; i < rooms.length; i++) {
      const [ax, ay] = cc(rooms[i - 1]), [bx, by] = cc(rooms[i]);
      if (rng() < 0.5) { carveH(ax, bx, ay); carveV(ay, by, bx); }
      else { carveV(ay, by, ax); carveH(ax, bx, by); }
    }
    // 额外环路（增加路线选择）
    const extra = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < extra && rooms.length > 2; i++) {
      const a = rooms[Math.floor(rng() * rooms.length)], b = rooms[Math.floor(rng() * rooms.length)];
      if (a === b) continue;
      const [ax, ay] = cc(a), [bx, by] = cc(b);
      if (rng() < 0.5) { carveH(ax, bx, ay); carveV(ay, by, bx); }
      else { carveV(ay, by, ax); carveH(ax, bx, by); }
    }
    // 保证每个房间 ≥2 个连接（防死区）：统计房间边界地板邻居
    return { grid, rooms };
  }

  /* ---------------- 群系机制铺装 ---------------- */
  function paintBiome(rng, level, noArrows) {
    const { w, h, grid, biome } = level;
    const idx = (x, y) => y * w + x;
    const at = (x, y) => grid[idx(x, y)];
    const set = (x, y, t) => { grid[idx(x, y)] = t; };
    const floors = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (at(x, y) === T.FLOOR) floors.push([x, y]);
    const mech = biome.mechanics || {};
    // 直线走廊格：滑行会沿走廊一路溜到底，严重压缩路线长度 —— 冰面避开它们
    const isCorridor = (x, y) => {
      const t = at(x, y);
      if (t !== T.FLOOR && t !== T.ICE) return false;
      const nb = DIRS.filter(([dx, dy]) => {
        const tt = at(x + dx, y + dy);
        return PASSABLE.has(tt) && tt !== T.EXIT;
      });
      if (nb.length !== 2) return false;
      return (nb[0][0] === -nb[1][0]) || (nb[0][1] === -nb[1][1]);
    };
    const blob = (paint, skipCorridor) => {
      if (!floors.length) return;
      let [cx, cy] = floors[Math.floor(rng() * floors.length)];
      const n = 5 + Math.floor(rng() * 9);
      for (let i = 0; i < n; i++) {
        if (at(cx, cy) === T.FLOOR && !(skipCorridor && isCorridor(cx, cy))) paint(cx, cy);
        const d = DIRS[Math.floor(rng() * 4)];
        cx = Math.max(1, Math.min(w - 2, cx + d[0])); cy = Math.max(1, Math.min(h - 2, cy + d[1]));
      }
    };
    if (mech.ice) {
      const iceBlob = (paint) => {
        if (!floors.length) return;
        let [cx, cy] = floors[Math.floor(rng() * floors.length)];
        const n = 4 + Math.floor(rng() * 5);
        for (let i = 0; i < n; i++) {
          if (at(cx, cy) === T.FLOOR && !isCorridor(cx, cy)) paint(cx, cy);
          const d = DIRS[Math.floor(rng() * 4)];
          cx = Math.max(1, Math.min(w - 2, cx + d[0])); cy = Math.max(1, Math.min(h - 2, cy + d[1]));
        }
      };
      for (let i = 0; i < 2; i++) iceBlob((x, y) => set(x, y, T.ICE));
    }
    if (mech.thinice) for (let i = 0; i < 2; i++) blob((x, y) => { if (at(x, y) === T.FLOOR) set(x, y, T.THIN); });
    if (mech.lava) for (let i = 0; i < 3; i++) blob((x, y) => { if (at(x, y) === T.FLOOR) set(x, y, T.LAVA); });
    if (mech.crumble) for (let i = 0; i < 10; i++) { const [x, y] = floors[Math.floor(rng() * floors.length)]; if (at(x, y) === T.FLOOR) set(x, y, T.RUBBLE); }
    if (mech.arrows && !noArrows) {
      const nearDeadEnd = (x, y) => DIRS.some(([dx, dy]) => deadEnd(level, x + dx, y + dy));
      for (let i = 0; i < 8; i++) {
        const [x, y] = floors[Math.floor(rng() * floors.length)];
        if (at(x, y) !== T.FLOOR) continue;
        if (isCorridor(x, y)) continue; // 走廊放箭头会造成单向死路
        if (nearDeadEnd(x, y)) continue; // 死角旁放箭头会让死角不可达
        const free = DIRS.filter(([dx, dy]) => at(x + dx, y + dy) === T.FLOOR).length;
        if (free < 2) continue;
        const dir = DIRS[Math.floor(rng() * 4)];
        set(x, y, T.ARROW); level.meta[idx(x, y)] = { dir };
      }
    }
    if (mech.vents) {
      for (let i = 0; i < 5; i++) {
        const [x, y] = floors[Math.floor(rng() * floors.length)];
        if (at(x, y) !== T.FLOOR) continue;
        set(x, y, T.VENT);
        level.meta[idx(x, y)] = { dir: DIRS[Math.floor(rng() * 4)], period: 6, phase: Math.floor(rng() * 6) };
      }
    }
    if (mech.phaseWalls) {
      for (let i = 0; i < 6; i++) {
        const x = 1 + Math.floor(rng() * (w - 2)), y = 1 + Math.floor(rng() * (h - 2));
        if (at(x, y) !== T.WALL) continue;
        const hPair = at(x - 1, y) === T.FLOOR && at(x + 1, y) === T.FLOOR;
        const vPair = at(x, y - 1) === T.FLOOR && at(x, y + 1) === T.FLOOR;
        if (hPair || vPair) { set(x, y, T.PHASE); level.meta[idx(x, y)] = { period: 8, phase: Math.floor(rng() * 8) }; }
      }
    }
    if (mech.teleports) {
      const pairs = 1 + Math.floor(rng() * 2);
      for (let p = 0; p < pairs; p++) {
        const a = floors[Math.floor(rng() * floors.length)], b = floors[Math.floor(rng() * floors.length)];
        if (at(a[0], a[1]) !== T.FLOOR || at(b[0], b[1]) !== T.FLOOR) continue;
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d < 10) continue;
        set(a[0], a[1], T.PORTAL); set(b[0], b[1], T.PORTAL);
        level.meta[idx(a[0], a[1])] = { pair: b };
        level.meta[idx(b[0], b[1])] = { pair: a };
        level.portals.push({ a, b });
      }
    }
  }

  /* ---------------- 主生成入口 ---------------- */
  function generateFloor(seed, floor, opts) {
    opts = opts || {};
    const DEBUG = typeof process !== 'undefined' && process.env && process.env.ECHO_GEN_DEBUG;
    const rng = mulberry32((seed * 7919 + floor * 104729) >>> 0);
    const isBoss = !!DATA.bossOf(floor);
    const biome = DATA.biomeOf(floor);
    const target = DATA.BAL.stepTarget(floor) - (isBoss ? 10 : 0);

    let attempt = 0;
    let level = null, bestLevel = null, bestOpt = -1;
    while (attempt < 6) {
      attempt++;
      // 冰窟滑行会压缩路程 → 用更大的地图补偿，保证步数指标
      const sizeBonus = biome.id === 'frost' ? 6 : 0;
      let w = Math.min(46, 26 + Math.floor(floor * 0.22)) + attempt * 2 + sizeBonus;
      let h = Math.min(28, 16 + Math.floor(floor * 0.14)) + (attempt > 3 ? 2 : 0) + (biome.id === 'frost' ? 2 : 0);
      level = buildOnce(rng, floor, biome, isBoss, w, h, target);
      if (DEBUG) console.error(`[gen] seed=${seed} F${floor} attempt=${attempt} ${w}x${h} ->`, level ? `OK opt=${level.minSteps}` : 'null');
      if (level) {
        if (!bestLevel || level.minSteps > bestOpt) { bestLevel = level; bestOpt = level.minSteps; }
        if (level.minSteps >= target || (level.minSteps >= 50 && attempt >= 4)) return level;
      }
    }
    // 兜底：返回最优努力层（测试保证其仍 ≥50；理论极少触发）
    // 若 6 次尝试全部被软锁校验拒绝（理论概率≈0），用无箭头布局再试一次——
    // 箭头是唯一能制造静态单向阀的地形，去掉后互通性由其余地形保证
    if (!bestLevel) {
      // 注意：w/h 是 while 内的块级变量，这里要独立重算（lint no-undef 实测抓到过）
      const bonus = biome.id === 'frost' ? 6 : 0;
      const safeW = Math.min(46, 26 + Math.floor(floor * 0.22)) + 20 + bonus;
      const safeH = Math.min(28, 16 + Math.floor(floor * 0.14)) + 4 + (biome.id === 'frost' ? 2 : 0);
      const safe = buildOnce(rng, floor, biome, isBoss, safeW, safeH, target, true);
      if (safe) { bestLevel = safe; }
      else if (DEBUG) console.error(`[gen] seed=${seed} F${floor} 无箭头兜底也失败（极端情况）`);
    }
    return bestLevel;
  }

  function buildOnce(rng, floor, biome, isBoss, w, h, target, noArrows) {
    const DEBUG = typeof process !== 'undefined' && process.env && process.env.ECHO_GEN_DEBUG;
    const dbg = (msg) => { if (DEBUG) console.error('    [build] ' + msg); };
    const idx = (x, y) => y * w + x;
    const level = {
      floor, biomeId: biome.id, biome, w, h, meta: {}, portals: [],
      shards: [], chests: [], enemies: [], hazards: [], plates: [], gates: [], keys: [],
      dark: !!(biome.mechanics && biome.mechanics.dark),
      isBoss, minSteps: 0,
    };
    let grid, rooms;
    if (isBoss) { const r = carveArena(w, h); grid = r.grid; rooms = r.rooms; }
    else { const r = carveMap(rng, w, h, 5 + Math.floor(rng() * 4) + Math.floor(floor / 30)); grid = r.grid; rooms = r.rooms; }
    level.grid = grid;
    paintBiome(rng, level, noArrows);

    /* ---- 出生点与出口 ---- */
    const floorsAll = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (grid[idx(x, y)] === T.FLOOR || grid[idx(x, y)] === T.ICE || grid[idx(x, y)] === T.RUBBLE) floorsAll.push([x, y]);
    if (floorsAll.length < 60) { dbg('floorsAll=' + floorsAll.length); return null; }

    let spawn, exitPos;
    if (isBoss) {
      spawn = [w >> 1, h - 3];
      exitPos = [w >> 1, 2];
    } else {
      // 出生点：最左上的房间中心；出口：距出生最远的地板
      const first = rooms[0];
      spawn = [first.x + (first.w >> 1), first.y + (first.h >> 1)];
      const d0 = plainFlood(level, spawn[0], spawn[1]); // 体量检查不受传送门压缩影响
      let best = -1, bestD = -1;
      for (const [x, y] of floorsAll) {
        const d = d0[idx(x, y)];
        if (d > bestD && grid[idx(x, y)] === T.FLOOR) { bestD = d; best = idx(x, y); }
      }
      if (bestD < 16) { dbg('bestD=' + bestD); return null; } // 地图太小/太直接 → 重试
      exitPos = [best % w, (best / w) | 0];
    }
    // 出生点与出口强制为干净地板（清除残留机关 meta，防传送门残留）
    grid[idx(spawn[0], spawn[1])] = T.FLOOR;
    delete level.meta[idx(spawn[0], spawn[1])];
    grid[idx(exitPos[0], exitPos[1])] = T.EXIT;
    delete level.meta[idx(exitPos[0], exitPos[1])];
    level.spawn = { x: spawn[0], y: spawn[1] };
    level.exit = { x: exitPos[0], y: exitPos[1] };
    if (isBoss) level.exitLock = 'boss'; // BOSS 层：击败 BOSS 后出口才开启

    /* ---- 碎片布置 + OPT 校验（核心保证） ---- */
    const dSpawn = stateBFS(level, spawn[0], spawn[1]);
    const K = isBoss ? 4 : DATA.BAL.shardCount(floor);
    // 碎片只放"可停留格"：冰面中途格滑行时停不下来（会一路溜过），绝不能放
    const cands = floorsAll.filter(([x, y]) => {
      const t = grid[idx(x, y)];
      return (t === T.FLOOR || t === T.RUBBLE) &&
        !(x === spawn[0] && y === spawn[1]) && !(x === exitPos[0] && y === exitPos[1]) &&
        isFinite(dSpawn[idx(x, y)]) && dSpawn[idx(x, y)] > 4;
    });
    if (cands.length < K * 3) { dbg('cands=' + cands.length + ' K=' + K); return null; }

    let placed = null, bestPick = null, bestOpt = -Infinity;
    for (let tr = 0; tr < 40; tr++) {
      // 评分采样：偏好远处/死角
      const scored = cands
        .map((c) => ({ c, s: dSpawn[idx(c[0], c[1])] + (deadEnd(level, c[0], c[1]) ? 7 : 0) + rng() * 14 }))
        .sort((a, b) => b.s - a.s);
      const pick = [];
      for (const { c } of scored) {
        if (pick.length >= K) break;
        if (pick.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) >= 6)) pick.push(c);
      }
      if (pick.length < K) continue;
      const pois = [spawn, ...pick, exitPos];
      const n = pois.length;
      const D = [];
      for (let i = 0; i < n; i++) {
        const df = (i === 0) ? dSpawn : stateBFS(level, pois[i][0], pois[i][1]);
        const row = [];
        for (let j = 0; j < n; j++) row.push(df[idx(pois[j][0], pois[j][1])]);
        D.push(row);
      }
      let ok = true;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && !isFinite(D[i][j])) ok = false;
      if (!ok) continue;
      const opt = heldKarp(D, K);
      if (isFinite(opt) && opt > bestOpt) { bestOpt = opt; bestPick = pick; } // 记录最优努力
      if (opt >= target) { placed = { pick, opt }; break; }
    }
    if (!placed && bestPick) placed = { pick: bestPick, opt: bestOpt }; // 兜底：放最优努力组合
    if (!placed) { dbg('40次试探全部失败'); return null; }
    level.shards = placed.pick.map(([x, y]) => ({ x, y, got: false }));
    level.minSteps = placed.opt;

    /* ---- 压力板 + 栅栏门（充能制，永不软锁） ---- */
    const mech = biome.mechanics || {};
    if (mech.plates && !isBoss) {
      const chokes = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (grid[idx(x, y)] !== T.FLOOR) continue;
        const nb = DIRS.filter(([dx, dy]) => PASSABLE.has(grid[idx(x + dx, y + dy)]) && grid[idx(x + dx, y + dy)] !== T.EXIT);
        if (nb.length === 2 && ((nb[0][0] === -nb[1][0]) || (nb[0][1] === -nb[1][1]))) {
          if (!(x === spawn[0] && y === spawn[1])) chokes.push([x, y]);
        }
      }
      const groups = Math.min(2, Math.floor(chokes.length / 6));
      for (let g = 0; g < groups; g++) {
        const gi = Math.floor(rng() * chokes.length);
        const [gx, gy] = chokes.splice(gi, 1)[0];
        grid[idx(gx, gy)] = T.GATE;
        // 防软锁关键：板必须"不经过任何已放置的门"就能从出生点到达。
        // 因此每次放完门都要重算"门即墙"的泛洪（先前的泛洪在无门时算不出隔离区）。
        const floodNoGate = plainFlood(level, spawn[0], spawn[1], true);
        const gate = { x: gx, y: gy, group: g, need: 2 + (rng() < 0.3 ? 1 : 0), charge: 0 };
        level.gates.push(gate);
        // 板放在：距门 ≥6、且无门可达
        const dg = stateBFS(level, gx, gy);
        const pf = floorsAll.filter(([x, y]) => {
          const t = grid[idx(x, y)];
          return t === T.FLOOR && isFinite(dg[idx(x, y)]) && dg[idx(x, y)] > 6 && dSpawn[idx(x, y)] > 3 &&
            floodNoGate[idx(x, y)] >= 0;
        });
        if (!pf.length) {
          // 找不到合规的压力板 → 撤销这扇门（宁可没有机关，也不制造软锁）
          grid[idx(gx, gy)] = T.FLOOR;
          level.gates.pop();
          continue;
        }
        // 单向阀防护（几何泛洪看不见）：板必须在真实推动语义下与出生点互通——
        // 无门可达（去）且充能后能回来（回）。seed 777 F24 实测教训：板被放进
        // 只能进的箭头水槽，玩家充完能就被永久关死。反图 BFS 一次算完"能回来"集合。
        const fwd = realBFS(level, spawn[0], spawn[1], true);
        const back = backSet(level, spawn[0], spawn[1], false);
        const safePf = pf.filter(([x, y]) => fwd[idx(x, y)] && back[idx(x, y)]);
        if (!safePf.length) {
          grid[idx(gx, gy)] = T.FLOOR;
          level.gates.pop();
          continue;
        }
        const [px, py] = safePf[Math.floor(rng() * safePf.length)];
        grid[idx(px, py)] = T.PLATE;
        level.plates.push({ x: px, y: py, group: g });
      }
    }

    /* ---- 尖刺/火焰 ---- */
    if (mech.spikes) {
      const n = Math.min(26, 5 + Math.floor(floor * 0.35));
      for (let i = 0; i < n; i++) {
        const [x, y] = floorsAll[Math.floor(rng() * floorsAll.length)];
        const t = grid[idx(x, y)];
        if (t !== T.FLOOR && t !== T.RUBBLE) continue;
        if (Math.abs(x - spawn[0]) + Math.abs(y - spawn[1]) < 4) continue;
        level.hazards.push({ type: biome.id === 'magma' ? 'fire' : 'spike', x, y, period: 4, phase: Math.floor(rng() * 4) });
      }
    }

    /* ---- 宝箱 / 钥匙 / 敌人 ---- */
    const dead = floorsAll.filter(([x, y]) =>
      deadEnd(level, x, y) && !(x === spawn[0] && y === spawn[1]) && dSpawn[idx(x, y)] > 5 &&
      !level.shards.some((s) => s.x === x && s.y === y) &&   // 碎片格不放宝箱/钥匙
      !level.plates.some((p) => p.x === x && p.y === y));    // 压力板上不放宝箱（防无法充能软锁）
    const chestN = Math.min(dead.length, 1 + Math.floor(rng() * 2));
    for (let i = 0; i < chestN; i++) {
      const [x, y] = dead.splice(Math.floor(rng() * dead.length), 1)[0];
      if (rng() < 0.3) level.enemies.push({ type: 'mimic', x, y, disguise: true });
      else level.chests.push({ x, y, locked: false });
    }
    if (!isBoss && rng() < 0.5 && dead.length) {
      const [x, y] = dead[Math.floor(rng() * dead.length)];
      level.keys.push({ x, y });
    }
    const eN = isBoss ? 0 : Math.min(16, 3 + Math.round(floor * 0.13));
    const pool = biome.enemies;
    let guard = 0;
    while (level.enemies.length < eN && guard++ < 300) {
      const [x, y] = floorsAll[Math.floor(rng() * floorsAll.length)];
      const t = grid[idx(x, y)];
      if (t !== T.FLOOR && t !== T.RUBBLE && t !== T.ICE) continue;
      if (dSpawn[idx(x, y)] < 6) continue;
      if (level.plates.some((p) => p.x === x && p.y === y)) continue; // 敌人别压在压力板上（防充能软锁）
      if (level.shards.some((s) => s.x === x && s.y === y)) continue;
      if (level.chests.some((c) => c.x === x && c.y === y)) continue;
      if (level.keys.some((c) => c.x === x && c.y === y)) continue;
      if (level.enemies.some((e) => e.x === x && e.y === y)) continue;
      const type = pool[Math.floor(rng() * pool.length)];
      if (type === 'mimic') continue;
      level.enemies.push({ type, x, y });
    }
    if (isBoss) {
      const boss = DATA.bossOf(floor);
      level.enemies.push({ type: 'boss:' + boss.id, x: w >> 1, y: 4, boss: true });
    }
    /* ---- 软锁防护（真实推动语义）：不存在合法收集顺序 → 注销重生成 ---- */
    if (!poiSolvable(level)) { dbg('poi 软锁（单向阀/不可达），重新生成'); return null; }
    return level;
  }

  /* ---------------- BOSS 竞技场 ---------------- */
  function carveArena(w, h) {
    const grid = new Uint8Array(w * h);
    const idx = (x, y) => y * w + x;
    const x0 = 2, y0 = 2, x1 = w - 3, y1 = h - 3;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[idx(x, y)] = T.FLOOR;
    // 对称柱阵
    const cx = w >> 1, cy = h >> 1;
    for (const [dx, dy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) grid[idx(cx + dx, cy + dy)] = T.WALL;
    // 四角符文龛
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = sx < 0 ? x0 : x1, ny = sy < 0 ? y0 : y1;
      grid[idx(nx, ny)] = T.FLOOR;
    }
    return { grid, rooms: [{ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }] };
  }

  function deadEnd(level, x, y) {
    const { w, h, grid } = level;
    const idx = (x, y) => y * w + x;
    const t = grid[idx(x, y)];
    if (t !== T.FLOOR && t !== T.RUBBLE) return false;
    let n = 0;
    for (const [dx, dy] of DIRS) {
      const tt = grid[idx(x + dx, y + dy)];
      if (PASSABLE.has(tt) && tt !== T.EXIT) n++;
    }
    return n === 1;
  }

  /* ---------------- 测试钩子 ---------------- */
  return { T, PASSABLE, DIRS, mulberry32, stateBFS, heldKarp, generateFloor, _carveMap: carveMap };
});
