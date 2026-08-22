/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/i18n.js
 * 国际化运行时：语言状态（zh/en）+ 翻译字典（以中文原文为键）。
 * - EchoLang.lang        当前语言（持久化于 localStorage）
 * - EchoLang.set(l)      切换并保存
 * - EchoLang.t(s, ...v)  翻译；s 中的 {1}{2}… 依次用 v 替换；未命中回退原文
 * 首次进入自动按浏览器语言选择。
 * ========================================================================= */
(function () {
  'use strict';
  const KEY = 'echoTower.lang';

  let lang = 'zh';
  try {
    const saved = localStorage.getItem(KEY);
    lang = (saved === 'en' || saved === 'zh') ? saved :
      (navigator.language && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh');
  } catch (e) { /* 无 localStorage 时保持 zh */ }

  function set(l) {
    lang = (l === 'en') ? 'en' : 'zh';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }
  const isEN = () => lang === 'en';

  /* ---------------- 字典：键 = 中文原文，值 = 英文 ---------------- */
  const DICT = {
    // —— 系统 toast ——
    '⚙ 这是充能栅栏门——找到同色「压力板」踩上去充能！': '⚙ Charge gate — step on the MATCHING pressure plate!',
    '👣 踩满 {1} 次永久开启；你的回声也能帮你踩': '👣 Fill {1} presses to open it for good; your echo can help!',
    '⚙ 机关栅栏开启了！': '⚙ The gate swung open!',
    '双子重新站起（半血）——它只剩一次机会了！': 'A twin rises again (half HP) — one revival left!',
    '一尊倒下了——在它复活前解决另一尊！': 'One twin down — finish the other before it revives!',
    '🏆 {1} 已被击败！': '🏆 {1} has been defeated!',
    '出口传送门开启了！': 'Exit portal unlocked!',
    '✦ 所有回响碎片已收集，出口开启了！': '✦ All shards collected — the exit is open!',
    '还有 {1} 枚回响碎片未收集': '{1} shard(s) still missing',
    '出口被封印——先击败守护者！': 'The exit is sealed — defeat the guardian first!',
    '⭐ 升到 Lv.{1}！': '⭐ Level up! Lv.{1}',
    '⟲ 你的回声出现了（重演上一层行动）': '⟲ Your Echo appeared (replaying last floor)',
    '回声演完了它的录像，消散了': 'The echo finished its recording and faded',
    '碎片 {1} 剩': '{1} left',
    '🔒 需要钥匙（商店有售）': '🔒 Locked — needs a key (shop sells them)',
    '用钥匙打开了上锁宝箱！': 'Unlocked the chest with a key!',
    '是宝箱怪！': 'It\u2019s a mimic!',
    '分裂泥裂成了两半！': 'The splitter split in two!',
    '🌀 发条暴君扭转了地砖！': '🌀 Clock Tyrant twists the tiles!',
    '⏳ 时之沙漏把你拉回了过去！': '⏳ Hourglass King drags you into the past!',
    '回声克隆体出现了！': 'An echo clone appears!',
    '⏱ 时停！敌人冻结 3 回合': '⏱ Time stop! Enemies frozen for 3 turns',
    '时停本层已用过': 'Time stop already used this floor',
    '置换次数用尽(2/2)': 'Swap charges used up (2/2)',
    '没有可置换的回声': 'No echo to swap with',
    '脉冲次数用尽(2/2)': 'Pulse charges used up (2/2)',
    '星火充能中 {1}/3': 'Spark charging {1}/3',
    '没有炸弹了！': 'Out of bombs!',
    '金币不足': 'Not enough gold',
    '当前没有回声可净化': 'No echo to purify right now',
    '✦ 获得遗物「{1}」：{2}': '✦ Relic \u2014 {1}: {2}',
    '⏳ 不倒钟摆救了你一命！': '⏳ The Unfallen Pendulum saves you!',
    '🔥 凤羽烬燃烧，你复活了！': '🔥 Phoenix Ember burns — you rise again!',
    '🕯 不灭烛护符发光，你复活了！': '🕯 The Undying Candle glows — you rise again!',
    '尚未解锁【置换】（天赋池中获得）': 'SWAP not unlocked yet (draft it from talents)',
    '回声与你擦肩而过': 'The echo brushes past you',
    '⚠ {1}': '⚠ {1}',
    // —— 战斗飘字 ——
    '暴击!': 'CRIT!', '闪避!': 'DODGE!', '影遁!': 'SHADOW!', '免疫': 'IMMUNE', '醒了!': 'Wakes!',
    // —— HUD / 标签 ——
    '步数': 'Steps', '最短≥': 'par ≥', '层 · ': ' · ',
    // —— 标题界面 ——
    '回声之塔': 'ECHO TOWER',
    '100 层 · 你的每一步都会被重演': '100 floors · every step you take will be replayed',
    '最佳纪录：第 {1} 层 · 回尘 ✦{2} · 无尽已解锁 ∞': 'Best: Floor {1} · Dust ✦{2} · Endless unlocked ∞',
    '最佳纪录：第 {1} 层 · 回尘 ✦{2}': 'Best: Floor {1} · Dust ✦{2}',
    '▶ 继续攀爬': '▶ Continue Climb',
    '▶ 开始攀登': '▶ Start Climbing',
    '新的一局': 'New Run',
    '◈ 塔碑（回尘护符）': '◈ Monuments (Dust Charms)',
    '? 攀塔指南': '? How to Play',
    '🔊 声音：开': '🔊 Sound: On',
    '🔇 声音：关': '🔊 Sound: Off',
    '🌐 Language：中文': '🌐 Language: English',
    '方向键/WASD 移动 · 空格等待 · J/F 攻击 · Esc 暂停': 'Arrows/WASD move · Space wait · J/F attack · Esc pause',
    // —— 职业 ——
    '选择你的守塔人': 'Choose Your Warden',
    '护符生效：': 'Charms active: ',
    '← 返回': '← Back',
    // —— 塔碑 ——
    '◈ 塔碑': '◈ Monuments',
    '回尘 ✦{1} —— 用它铸刻永恒的护符': 'Dust ✦{1} — engrave eternal charms with it',
    '✓ 已铸刻': '✓ Engraved',
    // —— 楼层横幅 ——
    '收集所有 ◆ 碎片，从出口离开': 'Collect all ◆ shards, then take the exit',
    // —— 暂停 ——
    '⏸ 暂停': '⏸ Paused',
    '层数': 'Floor', '击杀': 'Kills', '种子': 'Seed',
    '遗物：': 'Relics: ', '无': 'None',
    '继续攀爬 ▶': 'Resume ▶',
    '放弃本局 → 塔门': 'Abandon Run → Gate',
    '🌐 中文 / EN': '🌐 中文 / EN',
    // —— 商店 ——
    '🏪 回声商店': '🏪 Echo Shop',
    '离开商店 ▶': 'Leave Shop ▶',
    '（金币 ◎{1}）': '(Gold ◎{1})',
    // —— 天赋 ——
    '三选一': 'Choose One',
    '每 5 层的天塔馈赠': "The Tower's gift every 5 floors",
    '升级奖励': 'Level-Up Reward',
    '命运重铸': 'Fate Reforge',
    '选择一项天赋': 'Pick a talent',
    // —— 结算 ——
    '塔将你留在了这里': 'The Tower kept you here',
    '你抵达了 <b>第 {1} 层</b>': 'You reached <b>Floor {1}</b>',
    '共 {1} 步 · 击杀 {2} · 收集碎片 ◆{3}': '{1} steps · {2} kills · ◆{3} shards',
    '回尘 ✦+{1} 已带回（可在【塔碑】解锁护符）': 'Dust ✦+{1} brought home (spend at Monuments)',
    '再次攀登': 'Climb Again',
    '回到塔门': 'Back to Gate',
    '⟲ 初生回声归于寂静': '⟲ The First Echo falls silent',
    '"塔记住了你的每一步，如今，它只记得光。"': '\u201cThe Tower remembered your every step. Now it remembers only light.\u201d',
    '进入无尽模式 ∞': 'Endless Mode ∞',
    '凯旋归塔': 'Triumphant Return',
    '明白了': 'Got it',
    // —— BOSS 横幅后缀 ——
    '— 击败它！': '— defeat it!',
  };

  function t(s) {
    if (!isEN()) return s;
    let out = DICT[s] !== undefined ? DICT[s] : s;
    if (arguments.length > 1) {
      for (let i = 1; i < arguments.length; i++) {
        out = out.replace('{' + i + '}', String(arguments[i]));
      }
    }
    return out;
  }

  window.EchoLang = { get lang() { return lang; }, set, t, isEN };
})();
