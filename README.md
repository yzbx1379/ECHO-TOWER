# ⟲ 回声之塔 · ECHO TOWER

> [!IMPORTANT]
> ### ▶ 打开即玩，无需安装
> ## <https://yzbx1379.github.io/ECHO-TOWER/>
> 推荐 Chrome / Edge 浏览器。也可以下载仓库后双击 `index.html` 离线游玩。

![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-%E6%B5%8F%E8%A7%88%E5%99%A8-8fe388) ![类型](https://img.shields.io/badge/%E7%B1%BB%E5%9E%8B-%E5%9B%9E%E5%90%88%E5%88%B6Roguelite-c084fc) ![关卡](https://img.shields.io/badge/%E5%85%B3%E5%8D%A1-100%E5%B1%82%C3%97%E2%89%A550%E6%AD%A5-ffd27d) ![依赖](https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6-59c9a5)

> 原创回合制爬塔 Roguelite ｜ 纯 HTML5 Canvas，零依赖、零素材
> **100 层程序生成地牢 × 每层最短通关路线 ≥50 步（数学保证）× "你的行动会被重演"核心机制**

---

## ▶ 怎么玩

**打开 <https://yzbx1379.github.io/ECHO-TOWER/>** 在线游玩，或**双击本地 `index.html`**（Chrome / Edge 浏览器）离线开始。

| 按键 | 功能 |
|---|---|
| 方向键 / WASD | 移动（回合制；**长按自动连走**） |
| 空格 | 原地等待一回合（站在已开启的出口上按=进入下一层） |
| **J / F** | **攻击**：朝面向方向挥击——命中敌人**不吃反伤**，可劈宝箱、碎回声；挥空也耗 1 回合 |
| Shift+方向 | 冲撞（解锁后）：直线冲刺撞击敌人（可击退） |
| Q / E / R | 时停 / 置换·星火弹 / 脉冲（解锁后生效） |
| B | 投掷炸弹 |
| Esc / P | 暂停 |

> 手机/触屏：左下角虚拟方向键支持长按连走，另有 ⚔攻击 / ⏳等待 / 💥炸弹 按钮。

**目标**：收集本层所有 ◆ 回响碎片 → 出口传送门开启 → 登上第 100 层击败「初生回声」。

## ⟲ 核心机制：回声

塔会记录你在每一层的**全部行动**。进入下一层时，一个幽灵"回声"将从出生点出发，
**逐步重演你上一层的每一步移动与等待**——

- 它碰到你会让你掉血；但把它**引到尖刺上/用炸弹/让敌人弹道命中**可以击碎它，掉落回尘 ✦；
- 它踩上**压力板**也算数！高层"充能栅栏门"可以靠它加速；
- HUD 有虚线预览它的未来轨迹；「回声透镜」遗物可延长预览；
- 解锁技能【置换】可与回声瞬间换位——逃生或解谜的底牌。

## ⚔ 内容一览

- **5 大生物群系**：苔石回廊(1-20) → 蒸汽锅炉(21-40) → 霜寒冰窟(41-60) → 熔火之心(61-80) → 虚空回廊(81-100)
- **10 个机制各异的 BOSS**（每 10 层）：守门双子 / 发条暴君 / 寒霜之心 / 熔核巨人 / 时之沙漏王 / 虚空之眼 / 回声合唱团 / 双面神 / 万象织网者 / 初生回声
- **12 种敌人 AI** + 尖刺/冰面/薄冰/熔岩/蒸汽喷口/箭头地砖/传送门/相位墙/压力板机关
- **3 职业** × **30 条天赋三选一** × **24 件遗物**（流派组合）× 商店
- **元进度**：回尘解锁 8 种开局护符；通关解锁无尽模式 ∞；自动存档可续爬

## 📐 "每层 ≥50 步"是如何保证的

生成器（`js/gen.js`）在生成每一层时：

1. 用 **Dijkstra 距离场**精确计算任意两点最短行动数（含冰面滑行、传送门的真实语义）；
2. 对出生点→全部碎片→出口做 **Held-Karp 精确 TSP**，得到理论最优通关步数 OPT；
3. `OPT < 目标值(52~76)` 则重新布置碎片/出口并重生成地图；
4. 软锁防护：用与玩家 `doMove` 完全一致的**推动语义**（冰面滑行 / 传送门 / 箭头推动链）做正向 + 反向可达性搜索，校验「出生点 → 所有碎片 → 出口」存在合法收集顺序；压力板只允许放在与出生点双向互通的格子上，无解层直接作废重生成。仅靠几何泛洪会把玩家放进「能进不能出」的箭头单向阀里。

自动化校验：`node test/gen.test.cjs` —— 5 种子 × 100 层 = **12,950 项断言全通过**
（碎片可达性、出口可达性、OPT≥52、实体不嵌墙、门板配对完整）。

## 🗂 工程结构

```
index.html              入口页面
css/style.css           霓虹暗黑美术风格
js/data.js              数据表（群系/敌人/BOSS/遗物/天赋/职业/护符）
js/gen.js               地牢生成器（Dijkstra + Held-Karp 步数保证 + 推动语义软锁防护）
js/core.js              引擎基建（输入/相机/粒子/hitstop）
js/entities.js          敌人与 BOSS AI
js/systems.js           Game 核心：构造 / 属性聚合 / 格子与实体查询（合并下列 mixin）
js/systems.move.js      玩家行动 / 移动语义 / 机关触发（mixin）
js/systems.combat.js    攻击 / 回合管线 / 技能 / 战斗与伤害结算（mixin）
js/systems.hazards.js   投射物 / 激光 / 爆炸 / BOSS 支援效果（mixin）
js/systems.echo.js      回声重演 / 拾取 / 宝箱 / 碎片（mixin）
js/systems.progress.js  楼层流程 / 成长 / 商店 / 存档（mixin）
js/render.js            Canvas 世界渲染 + 小地图 + 调试叠层 + 组号标记
js/audio.js             WebAudio 合成音效与环境音乐
js/prefetch.js          楼层预生成调度（Worker 缓存 + 同步 fallback）
js/gen.worker.js        地牢生成 Worker（由 new Worker 加载，非 <script>）
js/main.js              标题流程/输入泵/主循环/存档/调试开关
sw.js                   Service Worker（ASSETS 清单派生版本化缓存 + navigation network-first）
manifest.webmanifest    PWA 安装清单
test/gen.test.cjs       生成器自动化测试（5 种子 × 100 层）
test/sim.test.cjs       端到端逻辑模拟（3 种子通关 F100 → F101）
test/combat.test.cjs    真实 HP 战斗 / 死亡 / 复活回归（20 项，不用 9999 HP）
test/dom-stub.cjs       DOM 桩冒烟（常规 / --debug / --url-debug 三种模式）
test/static.test.cjs    index.html ↔ sw.js 缓存清单一致性（含 Worker 白名单）
test/smoke.cjs          Playwright 浏览器截图冒烟（需本机执行权限）
test/fetch-browser.cjs  浏览器下载辅助脚本
DESIGN.md               完整设计文档
plan.md                 优化执行计划与变更记录
```

## 🧪 测试

```bash
npm test                 # 一键跑完全部 Node 测试（见下）
npm run lint             # ESLint，0 error / 0 warning 门槛，已纳入 CI
npm run format:check     # Prettier 全量格式门禁，已纳入 CI

node test/gen.test.cjs            # 12,950 项断言：可解性 + 每层≥50步（约 2.8ms/层）
node test/sim.test.cjs            # 端到端：3 种子真实爬塔通关 F100 → F101
node test/combat.test.cjs         # 20 项：真实 6~8 HP 的减伤/闪避/复活/失败结算
node test/dom-stub.cjs            # UI 冒烟 + 调试关闭 + 色盲组号绘制分支
node test/dom-stub.cjs --debug      # 调试模式（localStorage 通路）
node test/dom-stub.cjs --url-debug  # 调试模式（URL ?debug=1 通路）
node test/static.test.cjs         # 76 项：index.html 引用 ↔ sw.js 预缓存清单双向比对（含 Worker 白名单与 SW 版本化）
node test/smoke.cjs               # 真浏览器 28 项（PWA/Worker/灰度/三分辨率/触屏/小字号/SW 离线回落）
```

`npm test` 依次执行 `gen` → `sim` → `combat` → `dom-stub` ×3 模式 → `static`。`static.test.cjs` 是 PWA 的防白屏守卫：新增资源若忘了写进 `sw.js` 的 `ASSETS`，或清单里留了已删除的文件，测试会直接失败；它同时断言 SW 缓存名由清单派生、导航请求 network-first。

> 质检口径：以上为**代码检测结果**（gen 12950/12950、combat 20 项真实 HP 回归、dom-stub 39/51/51、static 76/76）；另在 Chromium headless 跑 `npm run smoke:browser`，**28/28 通过、控制台零错误**——含 Worker 生成层确定性、http 换层预取命中、`file://` 双击兜底、灰度滤镜、三档分辨率、触屏虚拟按键、390 宽小字号、SW 版本化缓存与离线 reload 九类实测；并留存 `?debug=1`、`grayscale(1)`、门/板徽记专项与小字号放大截图。灰度下组号徽记局部 `min=8 / max=245 / spread=237`，三分辨率横向溢出均为 0，小字号已统一 11px + 深色衬底。**本轮修掉一个真 bug**：`damagePlayer` 扣血后 `recalcStats()` 把 HP 夹到至少 1，而致死判定在其后，导致玩家永不死亡、凤羽烬/不灭烛/失败结算全部失效；现改用扣血后的 `lethal` 判定（combat.test.cjs 第 13–19 项固化）。仍不记作「达标」——真实设备字体渲染差异不在自动化覆盖内。

## 🐞 调试模式

在地址栏加 `?debug=1`，或在控制台执行 `localStorage.setItem('echoTower.debug','1')` 后刷新，即可开启：

| 操作 | 效果 |
|---|---|
| `]` / `[` | 上 / 下跳一层（钳制在 F1–F100；重建该层、清空录像与回声、不发回尘与天赋） |
| `I` | 切换无敌（`damagePlayer` 直接早退） |
| 屏幕左下叠层 | 楼层 / seed / 坐标、`OPT` 生成器保证步数 vs 本层实际步数、录像帧数与回声状态、碎片/出口锁/HP、无敌状态 |
| 控制台 `__echoDebug` | `jump(n)` / `toggleInvuln()` / `state`，便于脚本化复现 |

调试 flag **关闭时不注册按键监听、不挂全局 API、不绘制叠层**，正式玩法路径零变化；两种开启通路与「关闭时零副作用」都由 `dom-stub.cjs` 三种模式回归覆盖。调试跳层会把运行时随机流重置为该层的规范种子，保证同一 seed + 层号得到同一布局。

## ♿ 色盲友好

碎片（菱形）、宝箱（横箱）、未解锁出口（圆+叉）、栅栏门（竖栏）、压力板（圆环）、箭头（三角）、传送门（圆）、相位墙（虚线框）、尖刺（锯齿）本就有形状区分。唯一曾只靠色相关联的是**栅栏门与压力板的分组**（4 种组色），现在两者叠加一致的 **1–4 组号数字徽记**，灰度下也能判断哪块板开哪扇门，组色退为辅助线索。**灰度实测**：注入 `grayscale(1)` 后真实画面有效灰阶 9~11 档、亮度 spread 197~237（随该局随机 seed 波动；自动化门槛 levels≥8 / spread≥100）；专项探针把一对门/板放到出生点旁单独渲染，徽记区域灰度后 `min=8 / max=245 / spread=237`，截图目视确认数字 `1/2/3` 清晰、无重叠遮挡。

## 🛠 开发说明

- 无任何外部运行时依赖；字体为可选在线加载，离线自动降级。
- 音频全部由 WebAudio 实时合成；图形全部由 Canvas 程序化绘制。
- 存档位于 localStorage：`echoTower.run`（当前局）/ `echoTower.meta`（元进度）/ `echoTower.debug`（可选调试开关）。
- 代码风格已用 `prettier --write` **全量统一**（23 个文件、+6491/−4016 行纯格式改动，单独提交以便 review）；`npm run lint` 与 `npm run format:check` **均为 CI 门禁**。27 条存量 ESLint warning 已全部清理（未用变量删除/补齐真实用途、`ui.js` 的 `close` 定义提前、DOM 桩声明提前、`fetch-browser.cjs` 补上失败诊断输出），当前 **0 error / 0 warning**。
- 楼层预生成：`js/gen.worker.js` 在 Worker 中跑 Dijkstra + Held-Karp，`js/prefetch.js` 负责首层异步生成与下一层预取；`nextFloor()` 保持同步语义，命中缓存即零阻塞。`file://` 双击、DOM 桩、Worker 加载失败一律走同步 fallback，双击 `index.html` 仍可玩。`sim.test.cjs` 不加载该模块，端到端模拟确定性不受影响。
- PWA 缓存：`sw.js` 的缓存名由 `ASSETS` 清单内容（FNV-1a）自动派生，清单变化即换缓存、activate 清旧缓存；导航请求 network-first，离线时回落预缓存（`smoke.cjs` 实测断网 reload 仍可打开）。不再需要人工 bump 版本号。
- 存档确定性：`mulberry32` 暴露 `getState/setState`，`snapshot()` 新增可选 `rng` 整数（存档 `v: 1` 不变），`restoreFrom()` 有则恢复。续爬后的暴击 / 闪避 / 掉落 / 商店随机流与首次连续游玩逐位一致；旧存档缺该字段时保持原行为，无需迁移。
- `package-lock.json` 原为陈旧文件（`"name": "geom"` 且无 devDependencies），2026-10-24 随 `npm install` 重建为 `echo-tower` 并补全 3 个 devDependencies，使 `npm ci` 可用；仅安装期依赖，不进入运行时。
- CI（`.github/workflows/ci.yml`）三个并行 job：Node 测试、ESLint + Prettier（lint + format:check）、Playwright 浏览器冒烟。

## 📄 许可与来源

- 运行时零第三方依赖；图形全部由 Canvas 程序化绘制、音效全部由 WebAudio 合成，未包含外部美术/音频素材。在线字体为可选加载，离线自动降级。
- 本项目采用 **MIT License**。按仓库约定，许可全文与来源声明合并进本节，**不单独放 `LICENSE.md`**；`package.json` 的 `license` 字段同步为 `MIT`。
- Copyright 年份取自本仓库最早提交（2026），持有人取自 Git 提交身份 `叶子不小 (yzbx1379)`；如需改用其它署名，直接修改下方许可文本与 `package.json` 即可。

### MIT License

```text
MIT License

Copyright (c) 2026 叶子不小 (yzbx1379)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```




*—— 塔记住了你的每一步。*
