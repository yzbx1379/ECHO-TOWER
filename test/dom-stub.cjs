/* 《回声之塔》DOM 桩冒烟测试 —— 无浏览器环境下验证 UI 装配与主循环
 * 用最小 DOM/Canvas 存根加载全部脚本，模拟点击标题→选职业→按键移动。
 * 运行： node test/dom-stub.cjs
 */
'use strict';
const path = require('path');

/* ---------------- 最小 DOM 存根 ---------------- */
function makeClassList() {
  const set = new Set();
  return {
    contains: (c) => set.has(c),
    add: (...cs) => cs.forEach((c) => set.add(c)),
    remove: (...cs) => cs.forEach((c) => set.delete(c)),
    toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
  };
}
let elementCount = 0;
function makeElement(tag) {
  const el = {
    tag, children: [], style: { setProperty() {}, removeProperty() {} }, dataset: {}, __id: ++elementCount,
    className: '', innerText: '', textContent: '',
    classList: makeClassList(),
    parentNode: null,
    width: 300, height: 200, clientWidth: 1280, clientHeight: 800, __dpr: 1,
    listeners: {},
    _inner: '',
    get innerHTML() { return this._inner; },
    set innerHTML(v) {
      this._inner = String(v);
      this.children = [];
      const ids = [...this._inner.matchAll(/id="([^"]+)"/g)];
      for (const m of ids) { const c = makeElement('div'); c.id = m[1]; this.appendChild(c); }
      this.__cards = (this._inner.match(/class="(?:class-card|draft-card|charm-card|btn)/g) || []).length;
    },
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
    set textContent(v) { this._text = String(v); this.innerText = String(v); },
    get textContent() { return this._text ?? ''; },
    appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) registry[c.id] = c; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    get firstChild() { return this.children[0] || null; },
    getContext() {
      return new Proxy({}, {
        get(t, k) {
          if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
          if (k === 'measureText') return () => ({ width: 10 });
          if (typeof k === 'string') return (...a) => undefined;
          return undefined;
        },
        set() { return true; },
      });
    },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener() {},
    click(ev) {
      const e = ev || { target: this, closest: () => this };
      if (typeof this.onclick === 'function') this.onclick(e);
      (this.listeners.click || []).forEach((f) => f(e));
    },
    dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); return true; },
    closest(sel) { let n = this; while (n) { if ((n.className || '').includes(sel.replace('.', ''))) return n; n = n.parentNode; } return null; },
    querySelector(sel) { return findIn(this, sel)[0] || null; },
    querySelectorAll(sel) { return findIn(this, sel); },
    focus() {}, blur() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; },
  };
  Object.defineProperty(el, 'id', { value: '', writable: true });
  return el;
}
/* 粗糙选择器：只支持 .class/#tag 匹配已创建元素 */
const allElements = () => Object.values(registry).concat(extraEls);
const registry = {}; const extraEls = [];
function matches(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    const cn = el.className || '';
    if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) return true;
    if (el.classList && el.classList.contains(cls)) return true;
    return false;
  }
  return false;
}
function hasText(el, text) {
  const hay = (el._inner || '') + (el.textContent || '') + (el.innerText || '');
  if (hay.includes(text)) return true;
  for (const c of el.children) if (hasText(c, text)) return true;
  return false;
}
function walk(el, out) {
  out.push(el);
  for (const c of el.children) walk(c, out);
}
function findIn(root, sel) {
  const out = [];
  walk(root, out);
  return out.filter((e) => matches(e, sel));
}

const documentStub = {
  getElementById(id) { return registry[id] || null; },
  createElement: makeElement,
  body: makeElement('body'),
  documentElement: Object.assign(makeElement('html'), { requestFullscreen() { return Promise.resolve(); } }),
  fullscreenElement: null,
  addEventListener(ev, fn) { docListeners[ev] = fn; },
  dispatchEvent() { return true; },
};
const docListeners = {};
const winListeners = {};
global.addEventListener = (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); };
global.removeEventListener = () => {};
global.dispatchEvent = () => true;

/* window/global 环境 */
global.window = global;
global.self = global;
global.document = documentStub;
try { global.navigator = { userAgent: 'stub' }; } catch (e) { /* Node22 只读 */ }
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
global.requestAnimationFrame = () => 0; // 不跑渲染循环
global.performance = { now: () => Date.now() };
let timeouts = [];
global.setTimeout = (fn, ms) => { timeouts.push(fn); return timeouts.length; };
global.clearTimeout = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

/* 预置 index.html 的静态元素 */
for (const id of ['game', 'minimap', 'ui-root', 'screen-root', 'stage']) {
  const e = makeElement(id === 'game' || id === 'minimap' ? 'canvas' : 'div');
  e.id = id;
  registry[id] = e;
}

/* ---------------- 加载全部脚本 ---------------- */
window.EchoData = require(path.join(__dirname, '..', 'js', 'data.js'));
window.EchoGen = require(path.join(__dirname, '..', 'js', 'gen.js'));
require(path.join(__dirname, '..', 'js', 'i18n.js'));
require(path.join(__dirname, '..', 'js', 'audio.js'));
require(path.join(__dirname, '..', 'js', 'core.js'));
require(path.join(__dirname, '..', 'js', 'entities.js'));
require(path.join(__dirname, '..', 'js', 'systems.js'));
require(path.join(__dirname, '..', 'js', 'render.js'));
require(path.join(__dirname, '..', 'js', 'ui.js'));
require(path.join(__dirname, '..', 'js', 'main.js'));

/* 触发 boot */
(winListeners['DOMContentLoaded'] || []).forEach((f) => f());

const UI = global.window.EchoUI;
const D = global.window.EchoData;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓', m); } else { fail++; console.error('✗', m); } };

ok(global.window.EchoGame && typeof global.window.EchoGame.create === 'function', 'EchoGame 已挂载');
ok(registry['screen-root'] && !registry['screen-root'].classList.contains('hidden'), '标题界面已显示');

/* 标题按钮存在性：title-btns 内应有 ≥4 个 .btn */
const btns = findIn(registry['screen-root'], '.btn');
ok(btns.length >= 4, `标题按钮数量 ${btns.length} ≥ 4`);

/* 点击“开始攀登” */
const startBtn = btns.find((b) => hasText(b, '开始攀登')) || btns.find((b) => hasText(b, '新的一局'));
ok(!!startBtn, '找到开始按钮');
startBtn.click();
timeouts = []; // 清掉音频延迟
const cards = findIn(registry['screen-root'], '.class-card');
ok(cards.length === 3, `职业卡片数量 ${cards.length} === 3`);

/* 选骑士开局 */
cards.find((c) => hasText(c, '守塔骑士')).click();

/* 直接构造真实游戏并驱动若干回合（绕过 rAF 主循环） */
const game = global.window.EchoGame.create({
  seed: 424242, floor: 1, classId: 'knight', charms: [],
  fx: {
    toast() {}, shake() {}, burst() {}, floatText() {}, sfx() {}, hitstop() {}, flashTile() {},
    updateHUD: () => UI.updateHUD(game), onMusicBiome() {}, onMusicIntensity() {},
    onFloorStart: (lv) => UI.banner(`第 ${lv.floor} 层`, lv.biome.name),
    openDraft: (ch, r) => UI.openDraft(ch, r, (t) => game.applyTalent(t)),
    openShop: (st) => UI.openShop(st, game, () => false),
    onGameOver() {}, onVictory() {},
  },
});
UI.updateHUD(game);
ok(!registry['hud'].classList.contains('hidden'), 'HUD 显示');
ok(registry['hud-floor'].innerText.includes('第 1 层'), `楼层显示「${registry['hud-floor'].innerText}」`);

/* 走几步 */
const acts = ['right', 'down', 'wait', 'left', 'up', 'right'];
for (const a of acts) game.handleAction({ action: a, shift: false });
ok(game.turnCount >= acts.length - 3, `回合推进 turnCount=${game.turnCount}`);

/* 主动攻击：朝面向方向挥击消耗 1 回合且不移动 */
{
  const fx0 = game.player.x, fy0 = game.player.y, tc = game.turnCount;
  game.player.facing = [0, 1]; // 朝下
  game.actionAttack();
  ok(game.turnCount === tc + 1, `攻击消耗一回合 (${tc}→${game.turnCount})`);
  ok(game.player.x === fx0 && game.player.y === fy0, '攻击不移动');
}

/* 长按连走：模拟按下方向键 → 延迟后 takeRepeat 应吐出合成动作 */
{
  const C = global.window.EchoCore;
  const kd = winListeners.keydown || docListeners['keydown'];
  const fire = (code) => {
    const ev = { code, repeat: false, preventDefault() {}, shiftKey: false };
    (winListeners['keydown'] || []).forEach((f) => f(ev));
  };
  fire('ArrowRight');
  const immediate = C.popAction();
  ok(immediate && immediate.action === 'right', `按下立即触发一步 (${immediate && immediate.action})`);
  ok(C.takeRepeat(0) == null, '延迟期内不重复');
  const rep = C.takeRepeat(Date.now() + 10000);
  ok(rep && rep.action === 'right', `长按后自动连走 (${rep && rep.action})`);
  const up = { code: 'ArrowRight', repeat: false };
  (winListeners['keyup'] || []).forEach((f) => f(up));
  ok(C.takeRepeat(Date.now() + 20000) == null, '松开后停止连走');
}

/* 天赋三选一 UI 打开与选择 */
let picked = null;
UI.openDraft([D.TALENTS[0], D.TALENTS[1], D.TALENTS[2]], '测试', (t) => { picked = t; });
const draftCards = findIn(documentStub.getElementById('modal-layer'), '.draft-card');
ok(draftCards.length === 3, `天赋卡渲染 ${draftCards.length} === 3`);
draftCards[0].click();
ok(picked != null, '天赋选择回调触发: ' + (picked && picked.name));

/* 商店 UI 渲染 */
UI.openShop(D.SHOP_POOL.slice(0, 4).map((it) => ({ ...it, price: 30 })), game, () => true);
const shopItems = findIn(documentStub.getElementById('modal-layer'), '.shop-item');
ok(shopItems.length === 4, `商店货栏渲染 ${shopItems.length} === 4`);
shopItems[0].click(); // 买第一件

/* 结算画面 */
UI.gameOver({ floor: 7, steps: 300, kills: 12, shards: 15, dust: 20, time: 400 }, {}, () => {}, () => {});
ok(hasText(documentStub.getElementById('modal-layer'), '塔将你留在了这里'), '失败结算文案渲染');

/* 国际化：切到英文后 toast 应自动翻译 */
window.EchoLang.set('en');
UI.toast('⚙ 机关栅栏开启了！');
{
  const box = document.getElementById('toasts');
  const last = box.children[box.children.length - 1];
  ok(last && last.innerHTML.includes('gate swung open'), `EN toast 翻译: "${last && last.innerHTML}"`);
}
window.EchoLang.set('zh');

console.log('—'.repeat(40));
if (fail) { console.error(`✗ ${fail} 项失败`); process.exit(1); }
console.log(`✓ DOM 桩冒烟测试全部通过（${pass} 项）`);
