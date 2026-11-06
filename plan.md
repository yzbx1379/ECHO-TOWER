# 回声之塔 · 优化执行计划

> 依据:对当前代码(10 个 js + css + 6 套测试)的审阅；2026-10-24 全量复查、2026-11-05 收尾同步。
> 原则:尊重项目"零依赖、纯 Canvas、双击即玩、GitHub Pages 部署"的设计哲学,**不引入打包工具/框架**。
> 执行方式:自上而下逐项实施,每项完成后立即跑测试套件回归,并在本文件更新状态(⏳待办 / 🔄进行中 / ✅完成 / ⏸️阻塞)。

---

## 测试基线(每项完成后运行)

```bash
npm test                          # 一键跑下面全部 Node 测试
#  = node test/gen.test.cjs             生成器 12950 项断言(可解性 + 每层≥50步)
#  = node test/sim.test.cjs             端到端机器人：3 种子通关 F100 → F101
#  = node test/dom-stub.cjs             UI 冒烟 + 调试关闭 + 色盲组号分支
#  = node test/dom-stub.cjs --debug      调试模式(localStorage 通路)
#  = node test/dom-stub.cjs --url-debug  调试模式(URL ?debug=1 通路)
#  = node test/static.test.cjs          index.html ↔ sw.js 缓存清单一致性(73 项，含 Worker 白名单)
npm run lint                      # ESLint(0 error 门槛，已纳入 CI)
npm run format:check              # Prettier 全量格式门禁(已纳入 CI)
node test/smoke.cjs               # Playwright 真浏览器冒烟 14 项(需本机执行权限)
```

回归标准:`gen.test.cjs` / `sim.test.cjs` / `static.test.cjs` 全绿;`dom-stub.cjs` 三种模式均不得新增失败输出;`npm run lint` **0 error / 0 warning**;`npm run format:check` 通过;`smoke.cjs` 24 项全过且零控制台错误。
> `format:check` **已是 CI 门禁**(2026-11-06 全量重排后):23 个文件已用 `prettier --write` 统一风格,与 `npm run lint` 同在 CI 的 lint job;降级为可选工具是 2026-10-24 的中间结论,已被推翻(详见任务 9 的状态再更正)。

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
| 8   | 首层生成 Web Worker                | 🥈     | ✅   | 中   |
| 9   | ESLint + Prettier 工程化           | 🥈     | ✅   | 低   |
| 10  | 生成器 `dSpawn` 复用(小优化)       | 🥉     | ✅   | 低   |
| 11  | 游戏内调试模式(?debug=1)          | 🥉     | ✅   | 低   |
| 12  | 色盲友好(形状区分)                | 🥉     | ✅   | 中   |
| 13  | heldKarp 改 TypedArray(可选)       | 🥉     | ✅   | 低   |
| 14  | systems.js 拆分(可选)             | 🥉     | ✅   | 中   |

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
- **状态**:✅ 完成(2026-11-06,用户拍板推翻 2026-08-23 的推迟结论)。新增 `js/gen.worker.js`(只 `importScripts('data.js','gen.js')`,二者 UMD 以 self 为 root)+ `js/prefetch.js`(缓存/waiters/inflight/超时兜底)。首层 `startRun` 在 Worker 可用时异步生成并 `create({level})` 传入;`enterPlay` 后预取下一层,`buildLevel` 用 `EchoPrefetch.take()` 命中缓存,**`nextFloor()` 保持同步语义**,sim.test 不加载该模块、回合数完全不变。`file://` / DOM 桩 / Worker 失败 → `enabled()` 为 false → 完全同步开局(不引入微任务),双击 `index.html` 仍可玩。`static.test.cjs` 加 `CACHE_ONLY` 白名单,允许 Worker 脚本只进 ASSETS 不被 index.html 引用。实测:smoke 14/14(Worker 生成层与同步生成逐字段一致、`workerGenerated=1`);http 下 F1 预取 F2 → `]` 跳层后 cached 1→0、cacheHits+1、workerGenerated=2;`file://` 下 Worker 禁用、syncFallback=1、HUD 正常显示 F1,两条路径均零控制台错误。

### 9. ESLint + Prettier 工程化
- **目标**:统一代码风格 + PR 质量门槛。
- **改动**:
  - 新增 `.eslintrc.cjs`(规则从宽:只查未声明变量、`no-undef`、`no-unused-vars` 警告)
  - 新增 `.prettierrc`(与现有风格对齐:2 空格、单引号、无分号——按现有代码推断)
  - `package.json` 加 devDependencies + `lint`/`format` scripts
  - 可选:`.github/workflows/ci.yml` 跑 `npm test` + lint
- **验收**:`npm run lint` 无 error;`npm run format --check` 通过(或先 `format` 一次统一)。
- **状态**:✅ 配置完成(2026-08-23)。新增 `.eslintrc.cjs`(8 条宽松规则:no-undef error、no-unused-vars/no-fallthrough/eqeqeq warn;test/*.cjs 用 node env;忽略 .pw-browsers/shot_*.png)、`.prettierrc`(printWidth 120/semi false/singleQuote/trailingComma all,贴近现有风格)、`.prettierignore`;package.json 加 `lint`/`lint:fix`/`format`/`format:check` scripts + eslint/prettier devDeps。配置语法已验证(8 rules 解析正常)。**lint/format 实际运行待用户本地 `npm install`**(npm 在此沙箱被执行策略禁用)。CI workflow 已加(`.github/workflows/ci.yml`:push/PR 到 main 触发,两个并行 job——Node 测试 + Playwright 浏览器冒烟;lint 未纳入 CI 因配置尚未验证通过,待本地跑通后再加)。
- **状态更正(2026-10-24 实跑)**:原"配置语法已验证"结论不成立——ESLint 首次实跑即报 `no-empty` 规则 schema 非法(`allowStatementCursors` 非合法字段),已改为 `allowEmptyCatch`;`test/**/*.cjs` override 误设 `browser:false` 导致 window/document 误报,已改回 `browser:true`。修完后 `npx eslint js/ test/` = **0 error / 27 warning**(warning 全为存量 unused-vars 与 ui.js 的 `close` 前置引用)。`.github/workflows/ci.yml` 新增第三个并行 `lint` job(`npm run lint` 作 0-error 门禁)。**Prettier 如实降级**:`prettier --check "js/**/*.js" "test/**/*.cjs"` 报 16 个文件不符合,全量 `--write` 会产生数千行重排 diff 且可能引发冲突,决定不执行;`format`/`format:check` 保留为本地可选命令,**不纳入 CI、不作为合并门禁**。
- **状态再更正(2026-11-06,用户拍板全量重排)**:已执行 `prettier --write "js/**/*.js" "test/**/*.cjs"`,**23 个文件**统一格式(+6491/−4016,纯格式改动单独提交以便 review);`format:check` 现通过并升级为 **CI 门禁**(与 `npm run lint` 同在 lint job)。重排前先做本地中间提交 `e112d9c` 作回滚基线;重排后全套回归再次全绿(gen 12950、sim 三种子通关 F101 且回合数不变、dom-stub 36/48/48、static 73/73、lint 0 error、format:check 通过、smoke 14/14)。

### 10. 生成器 `dSpawn` 复用
- **目标**:消除 `buildOnce` 40 次试探里对 `spawn` 重复的 stateBFS。
- **改动**:`js/gen.js` 第 375 行的 `dSpawn` 提到试探循环外,循环内 `pois[0]=spawn` 复用它。
- **验收**:`gen.test.cjs` 12956 断言全绿(结果应完全一致,只是更快)。
- **状态**:✅ 完成(2026-08-23)。gen.js buildOnce 试探循环里 `pois[0]=spawn` 的 stateBFS 复用函数开头已算的 `dSpawn`(1 行改动:`const df = (i===0) ? dSpawn : stateBFS(...)`)。结果完全一致(12950 断言全绿,52 步下限不变)。**性能提升:平均 6.2→5.0ms/层(-19%),峰值 88→61ms(-30%)**——省了 40 次/层重复 Dijkstra。

### 11. 游戏内调试模式
- **目标**:开发/调参可用,`?debug=1` 或 `localStorage.echoTower.debug=1` 开启。
- **改动**:`js/main.js` 读 flag → 暴露跳层(`[`/`]`)、无敌、显示回声录制、显示 OPT vs 实际步数;`render.js` 调试叠层。
- **验收**:flag 关闭时行为零变化;开启时调试叠层显示,`smoke.cjs` 正常。
- **状态**:✅ 完成(2026-11-05)。`js/main.js` 顶层 `debugEnabled()` 读 `?debug=1` 或 `localStorage.echoTower.debug=1`,全程 `typeof`/try-catch 保护;**flag 关闭时不注册 keydown、不挂 `window.__echoDebug`、不调用叠层**,正式玩法路径零变化。`js/systems.js` 加 `damagePlayer` 无敌早退 + `debugJumpFloor(delta)`(钳制 F1–F100、重置为该层规范随机种子、清录像/回声、不发回尘与奖励)。`js/render.js` 加 `drawDebugOverlay`(屏幕空间叠层:F/seed/坐标、OPT vs 实际步数、录像帧数/回声、碎片/出口锁/HP、无敌状态)。按键 `[` `]` 跳层、`I` 无敌;另暴露 `window.__echoDebug` 供控制台。`test/dom-stub.cjs` 新增 `--debug` / `--url-debug` 两种启动模式,覆盖两条 flag 通路、API 与真实 keydown、边界钳制、无敌伤害、叠层绘制,以及 flag 关闭时零副作用。回归:dom-stub 31→36 项(常规)/48 项(调试),gen 12950、sim 3 种子通关、static 53 项、lint 0 error 全绿。**2026-11-06 补真浏览器实测**:Chromium headless(1280×800) 打开 `?debug=1`,`__echoDebug.state` 由 `F1/OPT=56/invuln=OFF` 经 `]`+`I` 变为 `F2/OPT=53/invuln=ON`,控制台零错误;截图目视确认叠层 5 行完整、位于左下空白区不遮挡地图/HUD/小地图。

### 12. 色盲友好(形状区分)
- **目标**:不只靠色相区分碎片/出口/危险。
- **改动**:`js/data.js` 群系调色补对比度;`render.js` 给关键实体加形状/图案(如出口加门框、碎片加菱形描边)。
- **验收**:灰度模式下仍可辨识关键元素。
- **状态**:✅ 完成(2026-11-05,按实际缺口收敛)。复查结论:碎片(菱形)、宝箱(横箱)、锁住的出口(圆+叉)、栅栏门(竖栏+⚡充能)、压力板(圆环)、箭头(三角)、传送门(圆)、相位墙(虚线框)、尖刺(锯齿) **本来就有形状区分**,不需要再堆图形。真正只依赖色相的是 **门 group ↔ 压力板 group 的配对**(4 种组色,无其它线索)。因此在两处叠加一致的组号数字徽记(`render.js` 新增并导出 `groupMark(group)` → 1–4,按 4 取模稳定),组色降为辅助线索;未改动其它渲染路径。`test/dom-stub.cjs` 断言 4 组号互异/为纯数字/取模稳定,并强制把 GATE/PLATE 注入某层后跑一次 `render()`,保证新增分支不抛错。**2026-11-06 补真浏览器截图**:同一张 F2 截图中可见两块压力板中心分别显示 `1`/`2`、右侧栅栏门左上角显示同组 `2` 徽记,数字与组色一一对应、无重叠。**2026-11-06 第三轮灰度实测已闭环**:`smoke.cjs` 注入 `grayscale(1)` 后真实画面有效灰阶 9~11 档 / spread 197~237（随 seed 波动，自动化门槛 levels≥8 / spread≥100）;专项探针把一对 GATE/PLATE 放到出生点旁单独渲染,徽记区域灰度后 `min=8 max=245 spread=237`;`test/shot_grayscale_badge.png` 目视确认门左上角与压力板中心的 `1/2/3` 均清晰、无重叠。多分辨率(390×844 / 768×1024 / 1920×1080)横向溢出全为 0、HUD 可见、零错误;触屏 4 方向 + 3 动作键可见且 `[right, wait]` 确实进入输入泵。整体记作"代码检测 + 真浏览器多场景实测通过",仍建议真实设备过一眼小字号元素,不写作"达标"。

### 13. heldKarp 改 TypedArray(可选)
- **目标**:学术优化,Map→Float64Array。K≤7 收益极小。
- **状态**:✅ 完成(2026-11-06)。`gen.js` 的 `heldKarp` 由 `Map<number,number>` 改为 `Float64Array` + `Infinity` 哨兵,`STRIDE = K+1` 不再依赖硬编码 16。独立等价性脚本跑 **8000 组随机矩阵**(K=0..7、含 4% 不可达边),新旧实现**逐例完全一致**;`gen.test` 12950/12950、OPT 下限 52 不变。K≤7 绝对收益极小,主要价值是去掉哈希装箱与每次试探的 Map 分配。

### 14. systems.js 拆分(可选)
- **目标**:52KB 单文件拆 4-5 个。仅在后续大改时做。
- **状态**:✅ 完成(2026-11-06)。`systems.js` 1326 行按注释分节拆成 `systems.move/combat/hazards/echo/progress.js` 五个 **mixin class**(方法体逐行搬运,不用给 class 方法补逗号),各文件在 `systems.js` 之前加载并 push 到 `window.EchoSystemsParts`;`systems.js` 末尾用 `Object.getOwnPropertyDescriptor` 把方法合并进 `Game.prototype`。核心文件只留构造/属性聚合/查询(243 行),**方法数 80→80 无丢失**;拆出的 mixin 只声明实际用到的全局依赖,lint warning 未增加。**等价性证据**:sim 三种子通关回合数 15886/16938/15348 与拆分前逐位一致,dom-stub 36/48/48、static 73/73 全绿。原文件已可逆归档后再重写。

---

## 2026-10-24 全量复查追加项(原 14 项之外；2026-11-05 完成收尾回归)

> 触发:用户要求"先确认项目是最新的"再提改进建议。本地 HEAD `63ad2fe` 经 GitHub API 校验与 `origin/main` 最新 sha 一致(`git fetch` 因 schannel TLS 握手失败,改用 API);工作区原有 4 个 WIP 文件保留未动。

| 项 | 发现 / 结论 | 处置 |
| --- | --- | --- |
| 🔴 英文 BOSS 名静默回退中文 | `data.js` 的 `_EN.bosses` 用了 AI 名 `frost`/`eye`,而实体 id 是 `frostheart`/`voideye`,注入 `find()` 命中失败 | key 改为 `frostheart`/`voideye`;7 张表 nameE/descE/hintE 全覆盖校验通过 |
| 🔴 `.workbuddy/` 未忽略 | 未跟踪目录有误提交进公开仓库风险 | `.gitignore` 加 `.workbuddy/`,`git check-ignore -v` 验证命中 |
| 🔴 端到端只测到 F12 | F13–F100 与后 8 个 BOSS 零覆盖 | `sim.test.cjs` 目标改 F100,3 种子全部通关 F101(15886/16938/15348 回合),连跑两次结果完全一致 |
| 🔴 `sw.js` 手写 15 项 ASSETS | 新增资源漏一项即离线白屏 | 新增 `test/static.test.cjs` 双向比对 index.html 引用与 ASSETS、manifest 图标;53/53 通过,负例自检(注入 `js/ghost.js`)确证可抓漏 |
| 🟡 lint 配置从未实跑 | 见任务 9 状态更正 | 修 schema + env,0 error,新增 CI `lint` job |
| 🔴 生成器箭头单向阀软锁 | 纯几何泛洪不建模推动语义,压力板可能被放进"能进不能出"区域(seed 777 F24) | `gen.js` 新增 `makeMovement`/`realBFS`/`backSet`/`poiSolvable`,压力板候选双向互通过滤、生成末尾拒绝无解层、极端情况无箭头兜底;平均耗时 19.5ms→**2.8ms/层** |
| 🔴 同进程多 seed 结果互相污染 | `entities.js` 模块级 `UID` 递增,而 `systems.js` 用 `(uid % 2)+1` 决定敌人冷却 | 改为实例级 `game.nextUid`,每层重置为 1 |
| 🔴 F20 运行时自环卡死 | `arrowStorm` 给每格随机方向,可形成吸引子把玩家可达域压成 1 格 | 每次施放全场箭头统一方向,新箭头沿用该方向 |
| 🔴 模拟机器人与真实 `doMove` 不一致 | 箭头推动链缺 `enemyCanEnter`/`arrowPushSafe`;碎片可在 `visited` 途经格被拾取,机器人只判最终落点 | `computeLanding` 精确镜像推动语义并输出途经格;新增 `viaPath`/`reachSet`/`orderExists`/`pickSafeShard` |
| 🟡 `gen.js` 兜底分支 `w/h` 未定义 | 极端情况会抛 `ReferenceError` | ESLint `no-undef` 提前抓到,改为独立重算 `safeW`/`safeH` |
| 🟡 `package-lock.json` 陈旧 | 原文件 `"name": "geom"` 且无 devDependencies,与本仓库无关 | `npm install` 重建为 `echo-tower` + 3 个 devDeps(103 包);详见 README 工程说明 |

> 口径备注(2026-11-06 更新):本机补装 Playwright `chromium_headless_shell-1234`(114.5 MiB)后,`node test/smoke.cjs` 已跑通 **11/11**(当时口径;第二轮已扩至 14/14)、控制台零错误;顺带修复 SW 断言日志——原写法 `page.evaluate(() => getRegistration())` 跨进程序列化丢失原型属性,日志恒显示 `undefined`,改为直接回传 `r.scope`,现在输出 `http://localhost:8765/` 可核验。**灰度滤镜 / 多分辨率 / 触屏已于第三轮实测覆盖**(见下方补充),整体记作"代码检测 + 真浏览器多场景实测通过",不写作"达标"。
>
> 补充(2026-11-06 第二轮):`node test/smoke.cjs` 扩到 **14/14**,新增「Worker 生成层与主线程同步生成逐字段一致」「Worker 路径已启用」两条断言;一次性脚本另实测 http 换层预取命中(F1 预取 F2 → 跳层后 cached 1→0、cacheHits+1)与 `file://` 双击兜底(Worker 禁用、syncFallback=1、HUD F1 正常)。**全量 Prettier 重排**完成(23 文件)并纳入 CI 门禁。
> 补充(2026-11-06 第三轮):`smoke.cjs` 扩到 **24/24**,新增灰度画面亮度层次(levels 9~11 / spread 197~237，随 seed 波动)、灰度侧组号仍为 `1234`、门/板徽记专项局部对比度(`min=8 max=245 spread=237`)与两张灰度截图、三档分辨率(HUD/画布/横向溢出/控制台)、触屏虚拟按键可见性与 `echo-vbtn` 事件链路;`test/shot_grayscale.png` 与 `test/shot_grayscale_badge.png` 目视复检通过(均为 gitignore 的临时产物)。**27 条存量 ESLint warning 已清零**,`npx eslint js/ test/` 现为 0 error / 0 warning。

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
| 2026-10-24 | 🔎 全量复查:确认 HEAD 与远端一致;列出 i18n / 测试覆盖 / SW 清单 / lint / .workbuddy 等 6 类改进点 |
| 2026-10-24 | ✅ 追加项 1–5:BOSS 英文 key、.gitignore、sim 延伸至 F100、static.test.cjs、lint 实跑并入 CI |
| 2026-10-24 | 🐛 F100 模拟连带修复 4 个真 bug:生成器单向阀软锁、模块级 UID 污染、arrowStorm 自环、机器人移动模型错位 |
| 2026-10-24 | ⏸️ Prettier 降级为可选工具(16 文件不符合,不做全量重排);8/13/14 维持原状态 |
| 2026-11-05 | ✅ 任务 11:调试模式 `?debug=1`(跳层/无敌/OPT 叠层),dom-stub 三种模式回归 |
| 2026-11-05 | ✅ 任务 12:门/压力板组号标记(色盲友好),收敛范围为真实缺口 |
| 2026-11-05 | 📝 README/plan 同步、package-lock 规范化、全量回归(gen 12950 + sim 3 种子 + dom-stub 36/48/48 + static 53 + lint 0 error) |
| 2026-11-06 | 🧪 补装 Playwright headless shell,真浏览器冒烟 11/11 + 控制台零错误;修 SW 断言日志(回传 `r.scope`);`?debug=1` 跳层/无敌与组号徽记截图目视通过 |
| 2026-11-06 | ✅ 任务13:heldKarp 改 Float64Array,8000 组随机矩阵与旧 Map 版逐例等价 |
| 2026-11-06 | ✅ 任务14:systems.js 1326 行拆 5 个 mixin,方法数 80→80,sim 回合数不变 |
| 2026-11-06 | ✅ 任务8:首层 Web Worker + 换层预取;`file://` 同步兜底实测通过,smoke 扩至 14/14 |
| 2026-11-06 | 📄 MIT 许可并入 README 独立章节(不建 LICENSE.md),package.json/lock 同步 |
| 2026-11-06 | 🎨 Prettier 全量重排 23 文件(+6491/−4016,单独提交),format:check 升级为 CI 门禁 |
| 2026-11-06 | 🧹 清理 27 条存量 ESLint warning(未用变量 / close 前置引用 / 桩声明提前 / 补 lastErr 诊断),lint 0 error 0 warning |
| 2026-11-06 | 🧪 smoke 扩至 24/24:灰度滤镜 + 组号徽记专项探针 + 三分辨率 + 触屏链路实测,目视截图复检通过 |
| 2026-11-06 | 📝 README/plan 口径同步:灰度 / 多分辨率 / 触屏由「未实测」改为实测结论 |
