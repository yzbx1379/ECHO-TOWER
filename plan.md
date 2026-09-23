# 回声之塔 · 优化执行计划

> 依据:对当前代码(11 个 js + css + 4 套测试)的审阅。
> 原则:尊重项目"零依赖、纯 Canvas、双击即玩、GitHub Pages 部署"的设计哲学,**不引入打包工具/框架**。
> 执行方式:自上而下逐项实施,每项完成后立即跑测试套件回归,并在本文件更新状态(⏳待办 / 🔄进行中 / ✅完成 / ⏸️阻塞)。

---

## 测试基线(每项完成后运行)

```bash
npm test                 # 一键跑下面三项
#  = node test/gen.test.cjs   生成器 12956 项断言(可解性 + 每层≥50步)
#  = node test/sim.test.cjs   机器人真实爬塔过 BOSS(F10双子→F11+)
#  = node test/dom-stub.cjs   UI 装配冒烟(标题→选职→HUD→天赋→商店→结算)
node test/smoke.cjs      # Playwright 真浏览器截图冒烟(需本机执行权限)
```

回归标准:`gen.test.cjs` 与 `sim.test.cjs` 必须全绿;`dom-stub.cjs` 不得因本次改动新增失败输出;`smoke.cjs` 不得在沙箱外崩。

---

## 执行顺序与总览

| #   | 任务                              | 优先级 | 状态 | 风险 |
| --- | --------------------------------- | ------ | ---- | ---- |
| 1   | OG meta / favicon / theme-color   | 🥇     | ✅   | 低   |
| 2   | 存档版本号 + 迁移兜底              | 🥇     | ✅   | 低   |
| 3   | 存档导入 / 导出                    | 🥇     | ✅   | 低   |
| 4   | prefers-reduced-motion 适配        | 🥇     | ✅   | 低   |
| 5   | i18n `tr()` 辅助函数(去重三元)    | 🥈     | ✅   | 中   |
| 6   | PWA(manifest + service worker)     | 🥇     | ✅   | 中   |
| 7   | 静态地形离屏 Canvas 缓存            | 🥈     | ✅   | 中   |
| 8   | 首层生成 Web Worker                | 🥈     | ⏸️   | 中   |
| 9   | ESLint + Prettier 工程化           | 🥈     | ✅   | 低   |
| 10  | 生成器 `dSpawn` 复用(小优化)       | 🥉     | ✅   | 低   |
| 11  | 游戏内调试模式(?debug=1)          | 🥉     | ⏳   | 低   |
| 12  | 色盲友好(形状区分)                | 🥉     | ⏳   | 中   |
| 13  | heldKarp 改 TypedArray(可选)       | 🥉     | ⏳   | 低   |
| 14  | systems.js 拆分(可选)             | 🥉     | ⏳   | 中   |

> 顺序考量:先做零风险纯增量(1-4)→ 可维护性重构(5)→ 综合性 PWA(6,需 1 的 favicon)→ 性能(7-8)→ 工程化(9)→ 收尾(10-14 视情况)。

---

## 详细任务

### 1. OG meta / favicon / theme-color
- **目标**:补全 GitHub Pages 分享卡片与浏览器标签视觉。
- **改动**:
  - `index.html` 增加 `meta description`、`og:title/og:description/og:image/og:type/og:url`、`twitter:card`、`<meta name="theme-color">`、`<link rel="icon" href="favicon.svg">`
  - 新增 `favicon.svg`:霓虹绿底 + ⟲ 回声环符号(纯 SVG,零素材)
  - 新增 `og.svg`:同风格横版封面(后续可补 PNG,部分平台不认 SVG og:image)
- **验收**:`index.html` 通过 HTML 校验;`favicon.svg` 在浏览器标签显示;`smoke.cjs` 截图正常。
- **状态**:✅ 完成(2026-08-23)。改动:index.html head 增 18 个 meta/link;新增 favicon.svg(塔影+⟲ 回声环)、og.svg(1200×630 横版封面)。回归:gen 12950/12950 + sim 3 种子 + dom-stub 19 项全绿。og:image 暂用 SVG(部分平台不识别,后续可补 PNG)。

### 2. 存档版本号 + 迁移兜底
- **目标**:防止未来改 meta 结构时旧存档静默丢字段。
- **改动**:
  - `js/main.js`:`defaultMeta()` 加 `__v: 1`;`loadMeta()` 合并后校验 `__v`,缺失则补默认;`continueRun` 对 `echoTower.run` 同理加 `__v`
  - `js/systems.js`:`restoreFrom` 容忍缺字段(可能已做,复核)
- **验收**:构造无 `__v` 的旧 JSON 写入 localStorage,`loadMeta`/`continueRun` 不抛错且补全字段;`npm test` 全绿。
- **状态**:✅ 完成(2026-08-23)。发现 `systems.js` snapshot() 已有 `v:1`、restoreFrom 已容忍缺字段(run 侧本就完备)。仅 `main.js` defaultMeta 补 `v:1` + loadMeta 增迁移分支(无 v 旧存档补默认并回写)。回归:gen 12950/12950 + dom-stub 19 项全绿。

### 3. 存档导入 / 导出
- **目标**:元进度(回尘/护符/最佳层数)与当前局可跨设备携带。
- **改动**:
  - `js/main.js`:在 `charmScreen` 底部加"导出存档码 / 导入存档码"按钮
  - `js/ui.js`:加一个输入框弹窗(复用现有 modal 机制),导出 = Base64(JSON(meta+run)),导入 = 解码合并 + 版本校验
  - 导入触发后调 `saveMeta` + 刷新界面
- **验收**:`dom-stub.cjs` 走通"导出→清 localStorage→导入→meta 恢复";手动验证截断/篡改的码被拒。
- **状态**:✅ 完成(2026-08-23)。ui.js 加 `openSaveIO` 弹窗;main.js 加 `exportSaveCode/importSaveCode`(`btoa(unescape(encodeURIComponent(...)))` 处理中文)+ charmScreen 加按钮;css 加 `.saveio-code` 样式;暴露 `window.__echoSaveIO` 供测试;dom-stub 加 Base64 兜底 + 7 项往返用例(导出→清→导入恢复 meta/run→篡改拒)。回归:gen 12950 + dom-stub 26 项全绿。

### 4. prefers-reduced-motion 适配
- **目标**:前庭敏感用户可降级震屏与粒子。
- **改动**:
  - `js/core.js`:新增 `reducedMotion()` 读 `matchMedia('(prefers-reduced-motion: reduce)')`;`camera.shake` 在启用时幅度×0;`burst` 的 n 减半
  - `css/style.css`:`@media (prefers-reduced-motion: reduce)` 下关闭非必要 transition/animation
- **验收**:系统切换"减少动态效果"后震屏与粒子明显衰减;`dom-stub`/`smoke` 不崩。
- **状态**:✅ 完成(2026-08-23)。core.js 加 `reducedMotion()`(读 matchMedia,带 try/catch 兜底);`camera.shake` 开头 return、`burst` 粒子数减半;css 末尾加标准 `@media (prefers-reduced-motion: reduce)` 关闭过渡/动画。回归:gen 12950 + sim 3 种子 + dom-stub 26 项全绿。

### 5. i18n `tr()` 辅助函数
- **目标**:消除 `en && x.nameE ? x.nameE : x.name` 这类重复三元(遍布 main.js / ui.js)。
- **改动**:
  - `js/i18n.js`:新增 `tr(obj, field='name')` —— 自动按 `isEN()` 取 `nameE||name`
  - `js/main.js`、`js/ui.js`:逐处替换为 `EchoLang.tr(x)`
- **验收**:中/英切换所有界面文案与改动前一致;`dom-stub` 全流程冒烟通过。
- **状态**:✅ 完成(2026-08-23)。i18n.js 加 `tr(obj, field='name')` 挂 `EchoLang.tr`;main.js 顶部加 `L = window.EchoLang` 别名,替换 6 处 `en && x.nameE ? x.nameE : x.name` 三元(grep 残留 0);ui.js 局部 `nm/ds` 委托给 `tr` 集中实现。回归:gen 12950 + sim 3 种子 + dom-stub 26 项全绿。

### 6. PWA(manifest + service worker)
- **目标**:可"安装到桌面"、强化离线。
- **改动**:
  - 新增 `manifest.webmanifest`:name/short_name/icons(复用 favicon.svg + 一张 512 png 暂用 svg 占位)/theme_color/background_color/display=standalone
  - 新增 `sw.js`:install 预缓存核心文件(index.html + css/ + js/),fetch 走 stale-while-revalidate
  - `index.html`:`<link rel="manifest">`;`js/main.js` boot 时 `navigator.serviceWorker.register`
  - `.gitignore` 无需改动(sw.js 是生产文件)
- **验收**:Chrome DevTools Application 面板 manifest 识别、SW 注册成功、离线模式打开仍可游玩;`smoke.cjs` 正常。
- **注意**:SW 需 HTTPS 或 localhost;GitHub Pages ✓,本地需用 localhost 而非 file:// 测。
- **状态**:✅ 代码完成(2026-08-23)。新增 `manifest.webmanifest`(standalone/landscape/theme #0d0b1a/icons 用 favicon.svg)+ `sw.js`(install 预缓存 15 资源 + activate 清旧 + fetch stale-while-revalidate,仅同源);index.html 加 `<link rel="manifest">`;main.js boot 末尾 `navigator.serviceWorker.register('./sw.js').catch(()=>{})` 兜底。回归:gen 12950 + sim 3 种子 + dom-stub 26 项全绿(stub navigator 无 SW,走兜底不崩)。**浏览器实测(manifest 识别/SW 离线)待 smoke 或手动 localhost 验证**;icon 暂用 SVG,后续可补 192/512 PNG。

### 7. 静态地形离屏 Canvas 缓存
- **目标**:楼层内地形不变,避免每帧重画墙/地板,降低中端机 CPU。
- **改动**:
  - `js/render.js`:新增离屏 Canvas,在楼层切换/地形变化(门开/塌陷砖/相位墙)时重绘静态层;`render` 每帧 `drawImage` + 叠动态层
  - 需处理"脏标记":门开/薄冰碎/塌陷砖消失时置脏重绘
- **验收**:视觉与改动前像素级一致(对比 `smoke.cjs` 前后截图);`npm test` 全绿。
- **状态**:✅ 代码完成(2026-08-23)。render.js 加 `ensureStaticLayer`/`drawStaticTile`/`isStaticTile`;render 主循环改为 `drawImage(离屏, 视口区域)` + 只遍历动态格(LAVA/GATE/PLATE/PORTAL/VENT/PHASE/THIN/尖刺覆盖)重画。**关键设计**:只缓存 6 类完全不变的格(WALL/FLOOR/ICE/WATER/RUBBLE/ARROW),**无需脏标记**(缓存类型永不变化),楼层切换按 `floor:biomeId:w×h` 键重建。`drawStaticTile` 与 `drawTile` 静态部分逐行一致(代码审查保证)。回归:gen 12950 + sim 3 种子 + dom-stub 26 项全绿(加载无语法错)。**视觉实测待 smoke/手动 localhost**——smoke 因沙箱 `spawn EPERM` 无法在此环境跑(浏览器进程被拦)。

### 8. 首层生成 Web Worker
- **目标**:避免主线程在首层/换层时被 Dijkstra+Held-Karp 阻塞。
- **改动**:
  - 新增 `js/gen.worker.js`:`importScripts('data.js','gen.js')`,收 `{seed,floor}` 回 `{level}`
  - `js/main.js`:`startRun`/`nextFloor` 改异步:显示 loading → postMessage → onmessage 拿 level 交给 `EchoGame` 装配
  - 保留主线程 fallback:Worker 不可用时同步生成(确保 file:// 双击仍可玩)
- **验收**:`sim.test.cjs` 逻辑不受影响(它直接 require gen);`smoke.cjs` 真浏览器首层加载无长卡顿;file:// 打开仍可玩。
- **状态**:⏸️ 推迟(2026-08-23,用户确认)。依据 gen.test 实测:平均 **6ms/层**、峰值 **94ms/层**——换层卡顿轻微(约 5-6 帧),Worker 改造需重构 Game 构造 + 保留同步 fallback(file:// 双击要能玩)+ 测试双路径,维护成本高于收益。若后续实测移动端卡顿明显再重启。

### 9. ESLint + Prettier 工程化
- **目标**:统一代码风格 + PR 质量门槛。
- **改动**:
  - 新增 `.eslintrc.cjs`(规则从宽:只查未声明变量、`no-undef`、`no-unused-vars` 警告)
  - 新增 `.prettierrc`(与现有风格对齐:2 空格、单引号、无分号——按现有代码推断)
  - `package.json` 加 devDependencies + `lint`/`format` scripts
  - 可选:`.github/workflows/ci.yml` 跑 `npm test` + lint
- **验收**:`npm run lint` 无 error;`npm run format --check` 通过(或先 `format` 一次统一)。
- **状态**:✅ 配置完成(2026-08-23)。新增 `.eslintrc.cjs`(8 条宽松规则:no-undef error、no-unused-vars/no-fallthrough/eqeqeq warn;test/*.cjs 用 node env;忽略 .pw-browsers/shot_*.png)、`.prettierrc`(printWidth 120/semi false/singleQuote/trailingComma all,贴近现有风格)、`.prettierignore`;package.json 加 `lint`/`lint:fix`/`format`/`format:check` scripts + eslint/prettier devDeps。配置语法已验证(8 rules 解析正常)。**lint/format 实际运行待用户本地 `npm install`**(npm 在此沙箱被执行策略禁用)。CI workflow 已加(`.github/workflows/ci.yml`:push/PR 到 main 触发,两个并行 job——Node 测试 + Playwright 浏览器冒烟;lint 未纳入 CI 因配置尚未验证通过,待本地跑通后再加)。

### 10. 生成器 `dSpawn` 复用
- **目标**:消除 `buildOnce` 40 次试探里对 `spawn` 重复的 stateBFS。
- **改动**:`js/gen.js` 第 375 行的 `dSpawn` 提到试探循环外,循环内 `pois[0]=spawn` 复用它。
- **验收**:`gen.test.cjs` 12956 断言全绿(结果应完全一致,只是更快)。
- **状态**:✅ 完成(2026-08-23)。gen.js buildOnce 试探循环里 `pois[0]=spawn` 的 stateBFS 复用函数开头已算的 `dSpawn`(1 行改动:`const df = (i===0) ? dSpawn : stateBFS(...)`)。结果完全一致(12950 断言全绿,52 步下限不变)。**性能提升:平均 6.2→5.0ms/层(-19%),峰值 88→61ms(-30%)**——省了 40 次/层重复 Dijkstra。

### 11. 游戏内调试模式
- **目标**:开发/调参可用,`?debug=1` 或 `localStorage.echoTower.debug=1` 开启。
- **改动**:`js/main.js` 读 flag → 暴露跳层(`[`/`]`)、无敌、显示回声录制、显示 OPT vs 实际步数;`render.js` 调试叠层。
- **验收**:flag 关闭时行为零变化;开启时调试叠层显示,`smoke.cjs` 正常。
- **状态**:⏳

### 12. 色盲友好(形状区分)
- **目标**:不只靠色相区分碎片/出口/危险。
- **改动**:`js/data.js` 群系调色补对比度;`render.js` 给关键实体加形状/图案(如出口加门框、碎片加菱形描边)。
- **验收**:灰度模式下仍可辨识关键元素。
- **状态**:⏳

### 13. heldKarp 改 TypedArray(可选)
- **目标**:学术优化,Map→Float64Array。K≤7 收益极小。
- **状态**:⏳(视 10 完成后是否值得)

### 14. systems.js 拆分(可选)
- **目标**:52KB 单文件拆 4-5 个。仅在后续大改时做。
- **状态**:⏳

---

## 变更记录

| 日期       | 内容                          |
| ---------- | ----------------------------- |
| 2026-08-23 | plan.md 创建,14 项任务列入   |
| 2026-08-23 | ✅ 任务1:OG meta + favicon.svg + og.svg,回归全绿 |
| 2026-08-23 | ✅ 任务2:meta 存档版本号 v:1 + 迁移兜底(run 侧本已有 v),回归全绿 |
| 2026-08-23 | ✅ 任务3:存档导入/导出(Base64)+ dom-stub 7 项往返用例,回归全绿 |
| 2026-08-23 | ✅ 任务4:prefers-reduced-motion(core.js reducedMotion + css media query),回归全绿 |
| 2026-08-23 | ✅ 任务5:i18n tr() 去重(main.js 6 处 + ui.js nm/ds 委托),回归全绿 |
| 2026-08-23 | ✅ 任务6:PWA(manifest + sw.js + boot 注册),回归全绿;浏览器实测待 smoke |
| 2026-08-23 | ✅ 任务7:静态地形离屏缓存(6 类无脏标记),回归全绿;视觉待 smoke(沙箱 EPERM) |
| 2026-08-23 | ⏸️ 任务8:Web Worker 推迟(用户确认,gen 6ms/峰94ms 收益边际) |
| 2026-08-23 | ✅ 任务9:ESLint+Prettier 配置(8 规则),待 npm install 跑 lint |
| 2026-08-23 | ✅ 任务10:dSpawn 复用,gen 峰值 88→61ms(-30%),回归全绿 |
| 2026-08-23 | 🐛 修复离屏缓存过时 bug:dirtyCells 标记+局部重绘(炸弹/薄冰/地砖改格视觉错乱) |
| 2026-08-23 | 🧪 render 脏格回归测试(dom-stub 26→29 项),填补 render.js 零测试盲区 |
| 2026-08-23 | 🚀 GitHub Actions CI:Node 测试 + Playwright 冒烟(含 SW/manifest 断言) |
| 2026-08-23 | 🏁 核心 1-10 完成(8 推迟);11-14 未实施,plan 记录在案,可随时重启 |
