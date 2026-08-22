/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/ui.js
 * DOM 界面层：HUD / 提示条 / 天赋三选一 / 商店 / 暂停 / 帮助 / 结算。
 * 浏览器挂 window.EchoUI。
 * ========================================================================= */
(function () {
  'use strict';
  const D = window.EchoData;

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
        <button data-act="up">▲</button>
        <div class="tp-mid">
          <button data-act="left">◀</button>
          <button data-act="attack">⚔</button>
          <button data-act="right">▶</button>
        </div>
        <div class="tp-mid">
          <button data-act="wait">⏳</button>
          <button data-act="down">▼</button>
          <button data-act="bomb">💥</button>
        </div>
      </div>`;
    bindTouch();
  }

  function bindTouch() {
    const pad = document.getElementById('touch-pad');
    let lastDir = null;
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
    if ('ontouchstart' in window) pad.classList.remove('hidden');
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

    hudEls.floor.textContent = `第 ${game.floor} 层 · ${L.biome.name}`;
    hudEls.steps.innerHTML = `步数 <b>${game.stepsThisFloor}</b> <span class="dim">(最短≥${Math.max(50, Math.round(L.minSteps))})</span>`;
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

  /* ---------------- 提示 ---------------- */
  function toast(msg) {
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
    box.appendChild(el('h3', null, reason || '选择一项天赋'));
    const row = el('div', 'draft-row');
    choices.forEach((t, i) => {
      const card = el('button', 'draft-card');
      card.innerHTML = `<em>${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</em><strong>${t.name}</strong><span>${t.desc}</span>`;
      card.onclick = () => { close(); onPick(t); };
      row.appendChild(card);
    });
    box.appendChild(row);
    const close = modal(box);
  }

  /* ---------------- 商店 ---------------- */
  function openShop(stock, game, onBuy, onClose) {
    const box = el('div', 'shop-box');
    const refresh = () => {
      box.innerHTML = `<h3>🏪 回声商店 <span class="dim">（金币 ◎${game.gold}）</span></h3>`;
      const list = el('div', 'shop-list');
      stock.forEach((it) => {
        if (it.sold) return;
        const btn = el('button', 'shop-item' + (game.gold < it.price ? ' poor' : ''));
        btn.innerHTML = `<strong>${it.name}</strong><span>${it.desc}</span><b>◎${it.price}</b>`;
        btn.onclick = () => {
          if (onBuy(it)) { it.sold = true; refresh(); }
          else window.EchoUI.toast('金币不足！');
        };
        list.appendChild(btn);
      });
      const leave = el('button', 'btn ghost', '离开商店 ▶');
      leave.onclick = () => { close(); onClose && onClose(); };
      box.appendChild(list);
      box.appendChild(leave);
    };
    refresh();
    const close = modal(box);
  }

  /* ---------------- 结算画面 ---------------- */
  function gameOver(sum, meta, onRetry, onTitle) {
    const box = el('div', 'end-box');
    box.appendChild(el('h2', 'dead-title', '塔将你留在了这里'));
    box.appendChild(el('p', 'end-sub', `你抵达了 <b>第 ${sum.floor} 层</b> · 共 ${sum.steps} 步 · 击杀 ${sum.kills} · 收集碎片 ◆${sum.shards}`));
    if (sum.dust > 0) box.appendChild(el('p', 'end-dust', `回尘 ✦+${sum.dust} 已带回（可在【塔碑】解锁护符）`));
    const row = el('div', 'btn-row');
    const again = el('button', 'btn primary', '再次攀登');
    again.onclick = () => { close(); onRetry(); };
    const home = el('button', 'btn ghost', '回到塔门');
    home.onclick = () => { close(); onTitle(); };
    row.append(again, home);
    box.appendChild(row);
    const close = modal(box);
  }
  function victory(sum, onEndless, onTitle) {
    const box = el('div', 'end-box win');
    box.appendChild(el('h2', 'win-title', '⟲ 初生回声归于寂静'));
    box.appendChild(el('p', 'end-sub', `100 层全部登顶！总步数 ${sum.steps} · 击杀 ${sum.kills} · 用时 ${Math.floor(sum.time / 60)}分${sum.time % 60}秒`));
    box.appendChild(el('p', 'end-quote', '"塔记住了你的每一步，如今，它只记得光。"'));
    const row = el('div', 'btn-row');
    if (onEndless) {
      const en = el('button', 'btn primary', '进入无尽模式 ∞');
      en.onclick = () => { close(); onEndless(); };
      row.appendChild(en);
    }
    const home = el('button', 'btn ghost', '凯旋归塔');
    home.onclick = () => { close(); onTitle(); };
    row.append(home);
    box.appendChild(row);
    const close = modal(box);
  }

  /* ---------------- 暂停 / 帮助 ---------------- */
  function pauseMenu(game, opts) {
    const box = el('div', 'pause-box');
    box.appendChild(el('h3', null, '⏸ 暂停'));
    const info = el('p', 'dim small',
      `层数 ${game.floor} · 步数 ${game.runStats.stepsTotal} · 击杀 ${game.runStats.kills}<br>` +
      `遗物：${game.relicIds.length ? game.relicIds.map(id => D.RELICS.find(r=>r.id===id)?.name).join('、') : '无'}<br>` +
      `种子 ${game.seed}`);
    box.appendChild(info);
    const row = el('div', 'btn-col');
    const mkBtn = (label, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; row.appendChild(b); };
    mkBtn('继续攀爬 ▶', () => close(), 'primary');
    mkBtn('操作说明 ?', () => { close(); help(() => pauseMenu(game, opts)); });
    mkBtn(opts.muted ? '🔇 音效：关' : '🔊 音效：开', () => { close(); opts.toggleMute(); pauseMenu(game, opts); });
    mkBtn('放弃本局 → 塔门', () => { close(); opts.quit(); }, 'ghost');
    box.appendChild(row);
    const close = modal(box);
  }
  function help(onClose) {
    const box = el('div', 'help-box');
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
    const b = el('button', 'btn primary', '明白了');
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
