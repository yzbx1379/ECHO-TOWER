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
js/systems.js           回合结算/战斗/回声/成长/商店/楼层流程
js/render.js            Canvas 世界渲染 + 小地图 + 调试叠层 + 组号标记
js/audio.js             WebAudio 合成音效与环境音乐
js/main.js              标题流程/输入泵/主循环/存档/调试开关
sw.js                   Service Worker 预缓存清单（stale-while-revalidate）
manifest.webmanifest    PWA 安装清单
test/gen.test.cjs       生成器自动化测试（5 种子 × 100 层）
test/sim.test.cjs       端到端逻辑模拟（3 种子通关 F100 → F101）
test/dom-stub.cjs       DOM 桩冒烟（常规 / --debug / --url-debug 三种模式）
test/static.test.cjs    index.html ↔ sw.js 缓存清单一致性
test/smoke.cjs          Playwright 浏览器截图冒烟（需本机执行权限）
test/fetch-browser.cjs  浏览器下载辅助脚本
DESIGN.md               完整设计文档
plan.md                 优化执行计划与变更记录
```

## 🧪 测试

```bash
npm test                 # 一键跑完全部 Node 测试（见下）
npm run lint             # ESLint，0 error 门槛，已纳入 CI

node test/gen.test.cjs            # 12,950 项断言：可解性 + 每层≥50步（约 2.8ms/层）
node test/sim.test.cjs            # 端到端：3 种子真实爬塔通关 F100 → F101
node test/dom-stub.cjs            # UI 冒烟 + 调试关闭 + 色盲组号绘制分支
node test/dom-stub.cjs --debug      # 调试模式（localStorage 通路）
node test/dom-stub.cjs --url-debug  # 调试模式（URL ?debug=1 通路）
node test/static.test.cjs         # 53 项：index.html 引用 ↔ sw.js 预缓存清单双向比对
node test/smoke.cjs               # 真浏览器截图（沙箱内被拦截时请在终端手动运行）
```

`npm test` 依次执行 `gen` → `sim` → `dom-stub` ×3 模式 → `static`。`static.test.cjs` 是 PWA 的防白屏守卫：新增资源若忘了写进 `sw.js` 的 `ASSETS`，或清单里留了已删除的文件，测试会直接失败。

> 质检口径：以上为**代码检测结果**；另在 Chromium headless（1280×800）跑 `npm run smoke:browser`，**11/11 通过、控制台零错误**，并留存 `?debug=1` 真浏览器截图——调试叠层 5 行信息完整无遮挡，门/压力板组号徽记可见。灰度模式、不同分辨率与触屏仍建议自行复检，不记作「达标」。

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

碎片（菱形）、宝箱（横箱）、未解锁出口（圆+叉）、栅栏门（竖栏）、压力板（圆环）、箭头（三角）、传送门（圆）、相位墙（虚线框）、尖刺（锯齿）本就有形状区分。唯一曾只靠色相关联的是**栅栏门与压力板的分组**（4 种组色），现在两者叠加一致的 **1–4 组号数字徽记**，灰度下也能判断哪块板开哪扇门，组色退为辅助线索。

## 🛠 开发说明

- 无任何外部运行时依赖；字体为可选在线加载，离线自动降级。
- 音频全部由 WebAudio 实时合成；图形全部由 Canvas 程序化绘制。
- 存档位于 localStorage：`echoTower.run`（当前局）/ `echoTower.meta`（元进度）/ `echoTower.debug`（可选调试开关）。
- `npm run lint` 是 CI 门禁（0 error，当前 27 条存量 warning）；`npm run format:check` **不是门禁**：全项目 16 个文件仍不符合 Prettier 风格，全量 `--write` 会产生数千行重排 diff，本轮决定不做，`format`/`format:check` 仅作本地可选工具。
- `package-lock.json` 原为陈旧文件（`"name": "geom"` 且无 devDependencies），2026-10-24 随 `npm install` 重建为 `echo-tower` 并补全 3 个 devDependencies，使 `npm ci` 可用；仅安装期依赖，不进入运行时。
- CI（`.github/workflows/ci.yml`）三个并行 job：Node 测试、ESLint、Playwright 浏览器冒烟。

## 📄 许可与来源

- 运行时零第三方依赖；项目自述图形全部由 Canvas 程序化绘制、音效全部由 WebAudio 合成，未包含外部美术/音频素材。在线字体为可选加载，离线自动降级。
- 本仓库**未附 `LICENSE` 文件，也未声明开源许可**；许可状态以维护者后续补充为准，此处不代为推定或补写。




*—— 塔记住了你的每一步。*
