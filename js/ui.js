/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/ui.js
 * DOM 界面层：HUD / 提示条 / 天赋三选一 / 商店 / 暂停 / 帮助 / 结算。
 * 浏览器挂 window.EchoUI。
 * ========================================================================= */
(function () {
  'use strict';
  const D = window.EchoData;
  /* —— 国际化辅助：LANG() 取运行时，nm/ds 按当前语言取数据字段 —— */
  const LANG = () => window.EchoLang || { t: (s) => s, isEN: () => false };
  const nm = (x) => { const g = LANG(); return (g.isEN() && x.nameE) ? x.nameE : x.name; };
  const ds = (x) => { const g = LANG(); return (g.isEN() && x.descE) ? x.descE : x.desc; };

  let root = null, hudEls = {}, toastTimer = null;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function init() {
    root = document.getElementById('ui-root');
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="hud-left">
          <div id="hud-floor" class="hud-chip">第 1 层</div>
          <div id="hud-steps" class="hud-chip">步数 0</div>
          <div id="hud-shards" class="hud-chip">◆ 0/0</div>
        </div>
        <div id="hud-center">
          <div id="hud-hearts"></div>
          <div id="hud-xpbar"><div id="hud-xpfill"></div><span id="hud-lv">Lv.1</span></div>
        </div>
        <div id="hud-right">
          <div id="hud-gold" class="hud-chip">◎ 0</div>
          <div id="hud-dust" class="hud-chip">✦ 0</div>
          <div id="hud-items" class="hud-chip">💣0 ⚿0</div>
        </div>
      </div>
      <canvas id="minimap" width="180" height="120"></canvas>
      <div id="toasts"></div>
      <div id="banner" class="hidden"></div>
      <div id="modal-layer" class="hidden"></div>
      <div id="touch-pad" class="hidden">
        <button data-act="up" class="tp-up">▲</button>
        <button data-act="left" class="tp-left">◀</button>
        <button data-act="right" class="tp-right">▶</button>
        <button data-act="down" class="tp-down">▼</button>
      </div>
      <div id="action-pad" class="hidden">
        <button data-act="attack" class="ap-main">⚔</button>
        <button data-act="wait">⏳</button>
        <button data-act="bomb">💥</button>
      </div>`;
    bindTouch();
  }

  function bindTouch() {
    let lastDir = null;
    for (const padId of ['touch-pad', 'action-pad']) {
      const pad = document.getElementById(padId);
      if (!pad) continue;
      pad.addEventListener('pointerdown', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        const act = b.dataset.act;
        window.dispatchEvent(new CustomEvent('echo-vbtn', { detail: { action: act } }));
        lastDir = ['up', 'down', 'left', 'right'].includes(act) ? act : null;
      });
      const stop = () => {
        if (lastDir) window.dispatchEvent(new CustomEvent('echo-vbtn-up', { detail: { action: lastDir } }));
        lastDir = null;
      };
      pad.addEventListener('pointerup', stop);
      pad.addEventListener('pointercancel', stop);
      pad.addEventListener('pointerleave', stop);
    }
    if ('ontouchstart' in window) {
      document.getElementById('touch-pad').classList.remove('hidden');
      document.getElementById('action-pad').classList.remove('hidden');
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHUD(game) {
    if (!game) return;
    document.getElementById('hud').classList.remove('hidden');
    const L = game.level;
    const shardsGot = L.shards.filter((s) => s.got).length;
    hudEls.floor = hudEls.floor || document.getElementById('hud-floor');
    hudEls.steps = hudEls.steps || document.getElementById('hud-steps');
    hudEls.shards = hudEls.shards || document.getElementById('hud-shards');
    hudEls.hearts = hudEls.hearts || document.getElementById('hud-hearts');
    hudEls.gold = hudEls.gold || document.getElementById('hud-gold');
    hudEls.dust = hudEls.dust || document.getElementById('hud-dust');
    hudEls.items = hudEls.items || document.getElementById('hud-items');
    hudEls.xpfill = hudEls.xpfill || document.getElementById('hud-xpfill');
    hudEls.lv = hudEls.lv || document.getElementById('hud-lv');

    hudEls.floor.textContent = LANG().isEN()
      ? `Floor ${game.floor} · ${game.level.biome.en}`
      : `第 ${game.floor} 层 · ${L.biome.name}`;
    const stepsTxt = `${LANG().isEN() ? 'Steps' : '步数'} <b>${game.stepsThisFloor}</b> <span class="dim">(${LANG().isEN() ? 'par' : '最短'}≥${Math.max(50, Math.round(L.minSteps))})</span>`;
    hudEls.steps.innerHTML = stepsTxt;
    hudEls.shards.textContent = `◆ ${shardsGot}/${L.shards.length}`;
    hudEls.gold.textContent = `◎ ${game.gold}`;
    hudEls.dust.textContent = `✦ ${game.dust}`;
    hudEls.items.textContent = `💣${game.bombs} ⚿${game.keys}${game.stats.unlockDash ? ' ⚡' : ''}`;

    // 心（1心=2HP）
    let hh = '';
    const hearts = Math.ceil(game.player.maxHp / 2);
    for (let i = 0; i < hearts; i++) {
      const v = game.player.hp - i * 2;
      hh += `<span class="heart ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}"></span>`;
    }
    hudEls.hearts.innerHTML = hh;
    const need = D.BAL.xpNeed(game.plv);
    hudEls.xpfill.style.width = `${Math.min(100, game.xp / need * 100)}%`;
    hudEls.lv.textContent = `Lv.${game.plv}`;
  }
  function hideHUD() { const h = document.getElementById('hud'); if (h) h.classList.add('hidden'); }

  /* ---------------- 提示（统一翻译咽喉点） ---------------- */
  function toast(msg) {
    msg = LANG().t(msg);
    const box = document.getElementById('toasts');
    const t = el('div', 'toast', msg);
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2600);
  }
  function banner(title, sub, dur) {
    const b = document.getElementById('banner');
    b.innerHTML = `<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}`;
    b.classList.remove('hidden');
    clearTimeout(banner.__t);
    banner.__t = setTimeout(() => b.classList.add('hidden'), dur || 2400);
  }

  /* ---------------- 模态框基座 ---------------- */
  function modal(contentEl) {
    const layer = document.getElementById('modal-layer');
    layer.classList.remove('hidden');
    layer.innerHTML = '';
    const box = el('div', 'modal');
    box.appendChild(contentEl);
    layer.appendChild(box);
    return () => { layer.classList.add('hidden'); layer.innerHTML = ''; };
  }

  /* ---------------- 天赋三选一 ---------------- */
  function openDraft(choices, reason, onPick) {
    const box = el('div', 'draft-box');
    box.appendChild(el('h3', null, LANG().t(reason || '选择一项天赋')));
    const row = el('div', 'draft-row');
    choices.forEach((t, i) => {
      const card = el('button', 'draft-card');
      card.innerHTML = `<em>${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</em><strong>${nm(t)}</strong><span>${ds(t)}</span>`;
      card.onclick = () => { close(); onPick(t); };
      row.appendChild(card);
    });
    box.appendChild(row);
    const close = modal(box);
  }

  /* ---------------- 商店 ---------------- */
  function openShop(stock, game, onBuy, onClose) {
    const en = LANG().isEN();
    const box = el('div', 'shop-box');
    const refresh = () => {
      box.innerHTML = `<h3>🏪 ${en ? 'Echo Shop' : '回声商店'} <span class="dim">（${en ? 'Gold' : '金币'} ◎${game.gold}）</span></h3>`;
      const list = el('div', 'shop-list');
      stock.forEach((it) => {
        if (it.sold) return;
        const btn = el('button', 'shop-item' + (game.gold < it.price ? ' poor' : ''));
        btn.innerHTML = `<strong>${nm(it)}</strong><span>${ds(it)}</span><b>◎${it.price}</b>`;
        btn.onclick = () => {
          if (onBuy(it)) { it.sold = true; refresh(); }
          else window.EchoUI.toast('金币不足！');
        };
        list.appendChild(btn);
      });
      const leave = el('button', 'btn ghost', LANG().isEN() ? 'Leave Shop ▶' : '离开商店 ▶');
      leave.onclick = () => { close(); onClose && onClose(); };
      box.appendChild(list);
      box.appendChild(leave);
    };
    refresh();
    const close = modal(box);
  }

  /* ---------------- 结算画面 ---------------- */
  function gameOver(sum, meta, onRetry, onTitle) {
    const en = LANG().isEN();
    const box = el('div', 'end-box');
    box.appendChild(el('h2', 'dead-title', en ? 'The Tower kept you here' : '塔将你留在了这里'));
    box.appendChild(el('p', 'end-sub', en
      ? `You reached <b>Floor ${sum.floor}</b> · ${sum.steps} steps · ${sum.kills} kills · ◆${sum.shards} shards`
      : `你抵达了 <b>第 ${sum.floor} 层</b> · 共 ${sum.steps} 步 · 击杀 ${sum.kills} · 收集碎片 ◆${sum.shards}`));
    if (sum.dust > 0) box.appendChild(el('p', 'end-dust', en
      ? `Dust ✦+${sum.dust} brought home (spend it at Monuments)`
      : `回尘 ✦+${sum.dust} 已带回（可在【塔碑】解锁护符）`));
    const row = el('div', 'btn-row');
    const again = el('button', 'btn primary', en ? 'Climb Again' : '再次攀登');
    again.onclick = () => { close(); onRetry(); };
    const home = el('button', 'btn ghost', en ? 'Back to Gate' : '回到塔门');
    home.onclick = () => { close(); onTitle(); };
    row.append(again, home);
    box.appendChild(row);
    const close = modal(box);
  }
  function victory(sum, onEndless, onTitle) {
    const en = LANG().isEN();
    const box = el('div', 'end-box win');
    box.appendChild(el('h2', 'win-title', en ? '⟲ The First Echo falls silent' : '⟲ 初生回声归于寂静'));
    box.appendChild(el('p', 'end-sub', en
      ? `All 100 floors cleared! ${sum.steps} steps · ${sum.kills} kills · ${Math.floor(sum.time / 60)}m${sum.time % 60}s`
      : `100 层全部登顶！总步数 ${sum.steps} · 击杀 ${sum.kills} · 用时 ${Math.floor(sum.time / 60)}分${sum.time % 60}秒`));
    box.appendChild(el('p', 'end-quote', en
      ? '\u201cThe Tower remembered your every step. Now it remembers only light.\u201d'
      : '"塔记住了你的每一步，如今，它只记得光。"'));
    const row = el('div', 'btn-row');
    if (onEndless) {
      const btn = el('button', 'btn primary', en ? 'Endless Mode ∞' : '进入无尽模式 ∞');
      btn.onclick = () => { close(); onEndless(); };
      row.appendChild(btn);
    }
    const home = el('button', 'btn ghost', en ? 'Triumphant Return' : '凯旋归塔');
    home.onclick = () => { close(); onTitle(); };
    row.append(home);
    box.appendChild(row);
    const close = modal(box);
  }

  /* ---------------- 暂停 / 帮助 ---------------- */
  function pauseMenu(game, opts) {
    const en = LANG().isEN();
    const box = el('div', 'pause-box');
    box.appendChild(el('h3', null, en ? '⏸ Paused' : '⏸ 暂停'));
    const relicNames = game.relicIds.length
      ? game.relicIds.map((id) => { const r = D.RELICS.find((x) => x.id === id); return nm(r); }).join(en ? ', ' : '、')
      : (en ? 'None' : '无');
    const info = el('p', 'dim small',
      `${en ? 'Floor' : '层数'} ${game.floor} · ${en ? 'Steps' : '步数'} ${game.runStats.stepsTotal} · ${en ? 'Kills' : '击杀'} ${game.runStats.kills}<br>` +
      `${en ? 'Relics' : '遗物'}: ${relicNames}<br>` +
      `${en ? 'Seed' : '种子'} ${game.seed}`);
    box.appendChild(info);
    const row = el('div', 'btn-col');
    const mkBtn = (label, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; row.appendChild(b); };
    mkBtn(en ? 'Resume ▶' : '继续攀爬 ▶', () => close(), 'primary');
    mkBtn(en ? '? How to Play' : '操作说明 ?', () => { close(); help(() => pauseMenu(game, opts)); });
    mkBtn(opts.muted ? '🔇 Sound: On' : (en ? '🔊 Sound: Off' : '🔊 声音：开'), () => { close(); opts.toggleMute(); pauseMenu(game, opts); });
    mkBtn(en ? '🌐 中文' : '🌐 English', () => { window.EchoLang.set(window.EchoLang.isEN() ? 'zh' : 'en'); close(); pauseMenu(game, opts); });
    mkBtn(en ? 'Abandon Run → Gate' : '放弃本局 → 塔门', () => { close(); opts.quit(); }, 'ghost');
    box.appendChild(row);
    const close = modal(box);
  }
  function help(onClose) {
    const en = LANG().isEN();
    const box = el('div', 'help-box');
    if (en) {
      box.innerHTML = `
        <h3>❓ Climber's Guide</h3>
        <ul>
          <li><b>Arrows / WASD</b> move (turn-based, <b>hold to repeat</b>) · <b>Space</b> wait · <b>J / F</b> attack · <b>B</b> bomb · <b>Esc/P</b> pause</li>
          <li><b>Attack (J/F)</b> strikes toward your facing: no retaliation damage, cracks chests, shatters echoes. Missing still costs a turn.</li>
          <li><b>Shift+dir</b> Dash (once unlocked): lunge in a line and slam enemies.</li>
          <li><b>Q</b> Time Stop · <b>E</b> Swap/Spark · <b>R</b> Pulse (when unlocked).</li>
          <li><b>Goal:</b> collect every ◆ shard → the exit portal opens → step in (or press Space while standing on it).</li>
          <li><b>Echo:</b> your moves are replayed by a ghost next floor. Bump it and you get hurt; lure it onto spikes or smash it for dust; it can hold pressure plates too!</li>
          <li><b>Charge gates:</b> step on the matching pressure plate — the ⚡ counter tracks progress. Echoes and enemies can charge plates as well!</li>
          <li>Spikes pulse · ice slides · steam pushes · phase walls blink · lanterns light dark floors.</li>
          <li>Every 10th floor is a BOSS: light the four corner runes first, then slay the guardian.</li>
        </ul>`;
    } else {
      box.innerHTML = `
        <h3>❓ 攀塔指南</h3>
        <ul>
          <li><b>方向键 / WASD</b> 移动（<b>长按可连走</b>）· <b>空格</b> 等待 · <b>J / F</b> 攻击 · <b>B</b> 炸弹 · <b>Esc/P</b> 暂停</li>
          <li><b>攻击（J/F）</b>朝面向方向挥击：命中敌人<b>不吃反伤</b>，还能劈开宝箱、击碎回声；挥空也消耗回合</li>
          <li><b>Shift+方向</b> 冲撞（解锁后）：直线冲刺撞击敌人（可击退）</li>
          <li><b>Q</b> 时停 · <b>E</b> 置换/星火弹 · <b>R</b> 脉冲（解锁后生效）</li>
          <li><b>目标：</b>收集本层所有 ◆ 回响碎片 → 出口传送门开启 → 踩上离开（站在开启的出口上按等待也可进入）</li>
          <li><b>回声：</b>每层的行动会在下一层被幽灵重演。撞它会受伤；把它引到尖刺上/用攻击与炸弹击碎得回尘；它还能替你压住机关板！</li>
          <li><b>栅栏门：</b>踩压力板充能（板上有 ⚡进度提示），充满即永久开启——回声和敌人也能帮你踩！</li>
          <li>尖刺有节奏 · 冰面会滑 · 蒸汽会推人 · 相位墙周期虚化 · 黑暗层提灯照亮四周</li>
          <li>每 10 层是 BOSS 战：先踩亮四角符文解除护盾，再击败守护者。</li>
        </ul>`;
    }
    const b = el('button', 'btn primary', en ? 'Got it' : '明白了');
    b.onclick = () => close();
    box.appendChild(b);
    const close = modal(box);
  }

  window.EchoUI = {
    init, updateHUD, hideHUD, toast, banner, openDraft, openShop,
    gameOver, victory, pauseMenu, help,
    get modalOpen() {
      const l = document.getElementById('modal-layer');
      return l && !l.classList.contains('hidden');
    },
  };
})();
