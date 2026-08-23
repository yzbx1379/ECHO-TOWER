/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/main.js
 * 启动与主循环：标题界面 / 职业选择 / 输入泵 / 渲染循环 / 元进度。
 * ========================================================================= */
(function () {
  'use strict';
  const D = window.EchoData, C = window.EchoCore, R = window.EchoRender,
    A = window.EchoAudio, UI = window.EchoUI;

  let canvas, mctx, ctx;
  let game = null;
  let state = 'title';
  const META_KEY = 'echoTower.meta';

  /* ---------------- 元进度 ---------------- */
  function loadMeta() {
    try { return Object.assign(defaultMeta(), JSON.parse(localStorage.getItem(META_KEY)) || {}); }
    catch (e) { return defaultMeta(); }
  }
  function defaultMeta() {
    return { best: 0, dust: 0, runs: 0, wins: 0, charmsOwned: [], endlessUnlocked: false, muted: false };
  }
  function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }
  let meta = loadMeta();

  /* ---------------- 启动 ---------------- */
  function boot() {
    UI.init();
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    mctx = document.getElementById('minimap').getContext('2d');
    C.setupCanvas(canvas);
    C.bindInput(canvas);
    A.setMuted(meta.muted);
    titleScreen();
    requestAnimationFrame(loop);
  }

  /* ---------------- 标题 ---------------- */
  function titleScreen() {
    state = 'title';
    game = null;
    UI.hideHUD();
    const en = window.EchoLang.isEN();
    const root = document.getElementById('screen-root');
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="title-wrap">
        <div class="title-echo">⟲</div>
        <h1 class="title-name">${en ? 'ECHO TOWER' : '回声之塔'}</h1>
        <p class="title-en">${en ? '回 声 之 塔' : 'E C H O · T O W E R'}</p>
        <p class="title-sub">${en ? '100 floors · every step you take will be replayed' : '100 层 · 你的每一步都会被重演'}</p>
        <div class="title-stats dim small">${en
          ? `Best: Floor ${meta.best} · Dust ✦${meta.dust}${meta.endlessUnlocked ? ' · Endless ∞ unlocked' : ''}`
          : `最佳纪录：第 ${meta.best} 层 · 回尘 ✦${meta.dust}${meta.endlessUnlocked ? ' · 无尽已解锁 ∞' : ''}`}</div>
        <div class="btn-col title-btns" id="title-btns"></div>
        <p class="dim tiny">${en
          ? 'Arrows/WASD move · Space wait · J/F attack · Esc pause'
          : '方向键/WASD 移动 · 空格等待 · J/F 攻击 · Esc 暂停'}</p>
      </div>`;
    const btns = root.querySelector('#title-btns');
    const mk = (label, fn, cls) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.textContent = label;
      b.onclick = () => { A.ensure(); A.resume(); A.sfx('ui'); fn(); };
      btns.appendChild(b);
    };
    const hasRun = !!localStorage.getItem('echoTower.run');
    if (hasRun) mk(en ? '▶ Continue Climb' : '▶ 继续攀爬', continueRun, 'primary');
    mk(hasRun ? (en ? 'New Run' : '新的一局') : (en ? '▶ Start Climbing' : '▶ 开始攀登'), () => classSelect(), 'primary');
    mk(en ? '◈ Monuments (Dust Charms)' : '◈ 塔碑（回尘护符）', charmScreen);
    mk(en ? '? How to Play' : '? 攀塔指南', () => UI.help());
    mk(meta.muted ? (en ? '🔊 Sound: On' : '🔇 声音：关') : (en ? '🔊 Sound: Off' : '🔊 声音：开'), () => {
      meta.muted = !meta.muted; A.setMuted(meta.muted); saveMeta(meta); titleScreen();
    }, 'ghost');
    mk(en ? '🌐 中文' : '🌐 English', () => { window.EchoLang.set(window.EchoLang.isEN() ? 'zh' : 'en'); titleScreen(); }, 'ghost');
    if (document.documentElement.requestFullscreen) {
      mk(en ? '🖥 Fullscreen' : '🖥 全屏（横屏推荐）', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }, 'ghost');
    }
  }

  /* ---------------- 护符（元进度） ---------------- */
  function charmScreen() {
    state = 'charms';
    const en = window.EchoLang.isEN();
    const root = document.getElementById('screen-root');
    root.innerHTML = `<div class="title-wrap"><h1 class="title-name small">◈ ${en ? 'Monuments' : '塔碑'}</h1>
      <p class="title-sub">${en ? `Dust ✦${meta.dust} — engrave eternal charms with it` : `回尘 ✦${meta.dust} —— 用它铸刻永恒的护符`}</p><div class="charm-grid" id="charm-grid"></div>
      <button class="btn ghost" id="charm-back">${en ? '← Back to Gate' : '← 返回塔门'}</button></div>`;
    const grid = root.querySelector('#charm-grid');
    for (const ch of D.CHARMS) {
      const owned = meta.charmsOwned.includes(ch.id);
      const cn = en && ch.nameE ? ch.nameE : ch.name;
      const cd = en && ch.descE ? ch.descE : ch.desc;
      const card = document.createElement('button');
      card.className = 'charm-card' + (owned ? ' owned' : meta.dust >= ch.cost ? '' : ' locked');
      card.innerHTML = `<strong>${cn}</strong><span>${cd}</span><b>${owned ? (en ? '✓ Engraved' : '✓ 已铸刻') : `✦${ch.cost}`}</b>`;
      card.onclick = () => {
        if (owned) return;
        if (meta.dust < ch.cost) { UI.toast(en ? 'Not enough dust' : '回尘不足'); return; }
        meta.dust -= ch.cost; meta.charmsOwned.push(ch.id); saveMeta(meta);
        A.sfx('levelup'); charmScreen();
      };
      grid.appendChild(card);
    }
    root.querySelector('#charm-back').onclick = titleScreen;
  }

  /* ---------------- 职业选择 ---------------- */
  function classSelect() {
    state = 'classSelect';
    const en = window.EchoLang.isEN();
    const equipped = D.CHARMS.filter((c) => meta.charmsOwned.includes(c.id));
    const root = document.getElementById('screen-root');
    root.innerHTML = `<div class="title-wrap">
      <h1 class="title-name small">${en ? 'Choose Your Warden' : '选择你的守塔人'}</h1>
      ${equipped.length ? `<p class="tiny dim">${en ? 'Charms active: ' : '护符生效：'}${equipped.map(c => en && c.nameE ? c.nameE : c.name).join(' · ')}</p>` : ''}
      <div class="class-row" id="class-row"></div>
      <button class="btn ghost" id="cls-back">${en ? '← Back' : '← 返回'}</button></div>`;
    const row = root.querySelector('#class-row');
    for (const cls of D.CLASSES) {
      const card = document.createElement('button');
      card.className = 'class-card';
      card.style.setProperty('--cc', cls.color);
      card.innerHTML = `<h3 style="color:${cls.color}">${en && cls.nameE ? cls.nameE : cls.name}</h3><p class="en">${cls.en}</p><p>${en && cls.descE ? cls.descE : cls.desc}</p>`;
      card.onclick = () => startRun(cls.id);
      row.appendChild(card);
    }
    root.querySelector('#cls-back').onclick = titleScreen;
  }

  /* ---------------- 开局 / 续爬 ---------------- */
  function makeFx() {
    return {
      toast: (m) => UI.toast(m),
      shake: (m) => C.camera.shake(m),
      burst: (x, y, c, n, o) => C.burst(x, y, c, n, o),
      floatText: (x, y, t, c, b) => C.floatText(x, y, t, c, b),
      sfx: (n) => A.sfx(n),
      hitstop: (d) => C.hitstop.stop(d),
      openDraft: (choices, reason) => { UI.openDraft(choices, reason, (t) => game.applyTalent(t)); },
      openShop: (stock) => {
        UI.openShop(stock, game,
          (it) => game.buyItem(it),
          () => { });
      },
      onFloorStart: (level) => {
        // 注意：此回调在 EchoGame.create() 构造期间就会触发，此时模块级 game 尚未赋值，
        // 必须只用 level 参数自带的信息。
        const en = window.EchoLang.isEN();
        const fl = level.floor;
        const b = D.bossOf(fl);
        if (b) {
          const bn = en && b.nameE ? b.nameE : b.name;
          UI.banner(`${en ? '⚠ Floor' : '⚠ 第'} ${fl} ${en ? '' : '层'}`, `${bn} — ${b.title}`);
        } else {
          UI.banner(en ? `Floor ${fl}` : `第 ${fl} 层`, `${level.biome.name} · ${level.biome.en}`);
        }
      },
      onMusicBiome: (b) => A.startMusic(b),
      onMusicIntensity: (v) => A.setIntensity(v),
      flashTile: () => {},
      updateHUD: () => UI.updateHUD(game),
      onGameOver: (sum) => finishRun(sum),
      onVictory: (sum) => winRun(sum),
    };
  }

  function startRun(classId) {
    localStorage.removeItem('echoTower.run');
    meta.runs++; saveMeta(meta);
    game = window.EchoGame.create({
      seed: (Math.random() * 1e9) | 0, floor: 1, classId,
      charms: meta.charmsOwned.slice(), fx: makeFx(),
    });
    enterPlay();
  }
  function continueRun() {
    try {
      const s = JSON.parse(localStorage.getItem('echoTower.run'));
      game = window.EchoGame.create({ seed: s.seed, floor: s.floor, classId: s.classId, charms: s.charms || [], fx: makeFx() });
      game.restoreFrom(s);
      enterPlay();
    } catch (e) {
      console.error(e);
      UI.toast('存档损坏，开始新的一局');
      classSelect();
    }
  }
  function enterPlay() {
    state = 'playing';
    document.getElementById('screen-root').classList.add('hidden');
    UI.updateHUD(game);
    A.startMusic(game.level.biome);
    const en = window.EchoLang.isEN();
    if (game.floor > 1) UI.banner(en ? `Floor ${game.floor}` : `第 ${game.floor} 层`, en ? game.level.biome.en : game.level.biome.name);
    else UI.banner(en ? 'Floor 1' : '第 1 层', en ? 'Collect all ◆ shards, then take the exit' : '收集所有 ◆ 碎片，从出口离开');
  }

  /* ---------------- 终局 ---------------- */
  function finishRun(sum) {
    state = 'over';
    meta.dust += sum.dust;
    if (sum.floor > meta.best) meta.best = sum.floor;
    saveMeta(meta);
    localStorage.removeItem('echoTower.run');
    setTimeout(() => UI.gameOver(sum, meta, () => classSelect(), titleScreen), 700);
  }
  function winRun(sum) {
    state = 'victory';
    meta.wins++; meta.endlessUnlocked = true; meta.dust += sum.dust;
    if (sum.floor > meta.best) meta.best = sum.floor;
    saveMeta(meta);
    A.stopMusic(); A.sfx('win');
    setTimeout(() => UI.victory(sum,
      () => { game.endless = true; game.over = false; game.nextFloor(); enterPlay(); },
      titleScreen), 600);
  }

  /* ---------------- 暂停菜单（Esc 与 ☰ 按钮共用） ---------------- */
  function openPause() {
    A.sfx('ui');
    UI.pauseMenu(game, {
      muted: A.muted,
      toggleMute: () => { meta.muted = !meta.muted; A.setMuted(meta.muted); saveMeta(meta); },
      quit: () => { localStorage.removeItem('echoTower.run'); finishRun(Object.assign(game.runSummary(), { dust: 0 })); },
    });
  }

  /* ---------------- 输入泵 ---------------- */
  function pump() {
    while (true) {
      const act = C.popAction();
      if (!act) break;
      if (state !== 'playing') {
        if (act.action === 'confirm' && state === 'title') { /* 忽略 */ }
        continue;
      }
      if (act.action === 'pause') { if (!UI.modalOpen) openPause(); continue; }
      if (UI.modalOpen) continue;
      if (act.action === 'bomb') { game.useBomb(); continue; }
      if (act.action === 'attack') { game.actionAttack(); continue; }
      if (act.action === 'skill1') { game.useSkill('freeze'); continue; }
      if (act.action === 'skill2') {
        // 游侠优先星火弹（无回声或未充能时），否则尝试置换
        const s = game.stats;
        const echoAlive = game.echo && game.echo.alive && game.echo.spawned;
        if (game.classId === 'ranger' && (!s.unlockSwap || !echoAlive)) game.useSkill('spark');
        else if (s.unlockSwap) game.useSkill('swap');
        else if (game.classId === 'ranger') game.useSkill('spark');
        else UI.toast('尚未解锁【置换】（天赋池中获得）');
        continue;
      }
      if (act.action === 'skill3') { game.useSkill('pulse'); continue; }
      game.handleAction(act);
    }
  }

  /* ---------------- 主循环 ---------------- */
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    pump();
    // 长按方向连走（弹窗/暂停/结束时自动停）
    if (state === 'playing' && !UI.modalOpen && game && !game.over) {
      const ra = C.takeRepeat(t);
      if (ra) game.handleAction(ra);
    }
    // 平滑动画插值（hitstop 时冻结）
    const effDt = C.hitstop.consume(dt);
    if (game && state === 'playing') {
      const k = Math.min(1, effDt * 15);
      const ents = [game.player, ...game.enemies];
      if (game.echo && game.echo.spawned) ents.push(game.echo);
      for (const be of game.bossEchoes) if (be.spawned) ents.push(be);
      for (const e of ents) {
        e.px += (e.x - e.px) * k;
        e.py += (e.y - e.py) * k;
        if (Math.abs(e.px - e.x) < 0.01) e.px = e.x;
        if (Math.abs(e.py - e.y) < 0.01) e.py = e.y;
      }
      C.updateParticles(effDt);
      C.updateFloaters(effDt);
      R.render(ctx, game, canvas, t / 1000);
      R.drawMinimap(mctx, game, document.getElementById('minimap'));
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('echo-open-menu', () => {
    if (state === 'playing' && game && !game.over && !UI.modalOpen) openPause();
  });
  window.addEventListener('DOMContentLoaded', boot);
})();
