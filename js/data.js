/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/data.js
 * 全部静态数据表：群系 / 敌人 / BOSS / 遗物 / 天赋 / 职业 / 护符 / 平衡常数
 * UMD：浏览器挂 window.EchoData，Node 可 require 做测试。
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EchoData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 平衡常数 ---------------- */
  const BAL = {
    baseHP: 6,            // 初始生命（1 心 = 2 HP）
    baseATK: 2,
    hpPerDepth: 0.035,    // 敌人 HP 深度系数
    dmgStep: 25,          // 每 25 层敌人伤害 +1
    xpNeed: (lv) => 10 + (lv - 1) * 7,
    goldBase: 3,
    shopFloors: (f) => f > 2 && f < 100 && f % 7 === 4, // 4,11,18,...,95
    bossEvery: 10,
    freeDraftEvery: 5,    // 每 5 层免费三选一
    stepTarget: (f) => Math.min(76, 52 + Math.floor((Math.max(1, f) - 1) / 10) * 4), // ≥50 硬指标，含缓冲
    shardCount: (f) => Math.min(7, 3 + Math.floor(Math.max(1, f) / 22)),
    enemyCount: (f) => Math.min(14, 3 + Math.round(f * 0.12)),
    endlessMul: (f) => 1 + Math.max(0, f - 100) * 0.05, // 无尽模式成长
  };

  /* ---------------- 生物群系 ---------------- */
  const BIOMES = [
    {
      id: 'moss', name: '苔石回廊', en: 'MOSSY HALLS', floors: [1, 20],
      pal: { bg: '#0c120d', floor: '#1a2b1e', floorAlt: '#16241a', wall: '#243b28', wallTop: '#33553a', accent: '#8fe388', glow: '#b6ffb0', danger: '#e8b04b' },
      scale: [0, 2, 4, 5, 7, 9], bpm: 84,
      mechanics: { spikes: true, plates: true },
      enemies: ['slime', 'bat', 'mimic', 'splitter'],
    },
    {
      id: 'steam', name: '蒸汽锅炉', en: 'STEAMWORKS', floors: [21, 40],
      pal: { bg: '#120e0a', floor: '#2b2118', floorAlt: '#241b13', wall: '#40301f', wallTop: '#5c452c', accent: '#ffb454', glow: '#ffd27d', danger: '#ff6b4a' },
      scale: [0, 3, 5, 7, 10], bpm: 92,
      mechanics: { spikes: true, plates: true, vents: true, arrows: true },
      enemies: ['sentry', 'bomber', 'mirrorthief', 'bat', 'slime'],
    },
    {
      id: 'frost', name: '霜寒冰窟', en: 'FROST CAVERNS', floors: [41, 60],
      pal: { bg: '#0a1016', floor: '#16283a', floorAlt: '#122232', wall: '#23405c', wallTop: '#315a80', accent: '#7fd8ff', glow: '#bdeaff', danger: '#9adfff' },
      scale: [0, 2, 3, 7, 10], bpm: 76,
      mechanics: { ice: true, thinice: true, spikes: true, plates: true, teleports: true },
      enemies: ['ghost', 'archer', 'bat', 'wraithling'],
    },
    {
      id: 'magma', name: '熔火之心', en: 'MOLTEN CORE', floors: [61, 80],
      pal: { bg: '#140a08', floor: '#301512', floorAlt: '#291110', wall: '#4a201a', wallTop: '#6b2f24', accent: '#ff7847', glow: '#ffb08a', danger: '#ff4632' },
      scale: [0, 1, 5, 8, 10], bpm: 100,
      mechanics: { lava: true, firewalls: true, crumble: true, spikes: true, plates: true },
      enemies: ['gargoyle', 'splitter', 'sentry', 'bomber'],
    },
    {
      id: 'void', name: '虚空回廊', en: 'VOID GALLERY', floors: [81, 100],
      pal: { bg: '#0d0a16', floor: '#1e1733', floorAlt: '#191330', wall: '#332657', wallTop: '#483779', accent: '#c084fc', glow: '#e4ccff', danger: '#ff5edb' },
      scale: [0, 3, 5, 7, 12], bpm: 88,
      mechanics: { dark: true, teleports: true, phaseWalls: true, spikes: true, plates: true },
      enemies: ['voidmage', 'phasebeast', 'ghost', 'sentry', 'archer'],
    },
  ];

  function biomeOf(floor) {
    if (floor <= 20) return BIOMES[0];
    if (floor <= 40) return BIOMES[1];
    if (floor <= 60) return BIOMES[2];
    if (floor <= 80) return BIOMES[3];
    return BIOMES[4];
  }

  /* ---------------- 敌人（12 常规） ----------------
   * ai: slug慢追 bat游走 sentry激光 ghost穿墙 gargoyle沉睡冲锋 mimic伪装
   *     splitter分裂 archer风筝 voidmage瞬移法 bomber自爆 mirror镜像 phase相位
   * every: 每 N 回合行动一次；speed: 行动时走几格（一般 1）
   */
  const ENEMIES = {
    slime:      { id:'slime', name:'粘液怪', hp:4, dmg:1, xp:3, gold:4,  ai:'slug',   every:2, color:'#7ed957', glyph:'blob' },
    bat:        { id:'bat', name:'洞穴蝠', hp:2, dmg:1, xp:2, gold:3,  ai:'bat',    every:1, color:'#c9a7ff', glyph:'wing' },
    sentry:     { id:'sentry', name:'哨戒炮', hp:5, dmg:2, xp:5, gold:7,  ai:'sentry', every:1, range:7, color:'#ffb454', glyph:'turret' },
    ghost:      { id:'ghost', name:'游魂', hp:3, dmg:1, xp:4, gold:5,  ai:'ghost',  every:2, color:'#bfe8ff', glyph:'ghost' },
    wraithling: { id:'wraithling', name:'小怨灵', hp:4, dmg:2, xp:5, gold:6, ai:'ghost', every:2, color:'#8fd3ff', glyph:'ghost' },
    gargoyle:   { id:'gargoyle', name:'石像鬼', hp:8, dmg:2, xp:7, gold:9, ai:'gargoyle', every:3, sense:5, color:'#b8a58c', glyph:'gargoyle' },
    mimic:      { id:'mimic', name:'宝箱怪', hp:6, dmg:2, xp:6, gold:14, ai:'mimic', every:1, color:'#d8a03c', glyph:'chest' },
    splitter:   { id:'splitter', name:'分裂泥', hp:5, dmg:1, xp:4, gold:5, ai:'slug', every:2, color:'#59c9a5', glyph:'blob', splitInto:'slimeling' },
    slimeling:  { id:'slimeling', name:'小泥怪', hp:2, dmg:1, xp:1, gold:2, ai:'slug', every:2, color:'#8fe3c9', glyph:'blob', noSplit:true },
    archer:     { id:'archer', name:'骸骨弓手', hp:3, dmg:2, xp:5, gold:7, ai:'archer', every:2, range:5, color:'#e8e3d5', glyph:'archer' },
    voidmage:   { id:'voidmage', name:'虚空法师', hp:4, dmg:2, xp:7, gold:10, ai:'voidmage', every:2, tpEvery:6, range:6, color:'#c084fc', glyph:'mage' },
    bomber:     { id:'bomber', name:'自爆虫', hp:2, dmg:3, xp:4, gold:5, ai:'bomber', every:1, fuse:6, color:'#ff8c42', glyph:'bug' },
    mirrorthief:{ id:'mirrorthief', name:'镜像贼', hp:4, dmg:2, xp:6, gold:8, ai:'mirror', every:1, color:'#9adfff', glyph:'mirror' },
    phasebeast: { id:'phasebeast', name:'相位兽', hp:5, dmg:2, xp:8, gold:11, ai:'phase', every:1, color:'#ff5edb', glyph:'beast' },
  };

  /* ---------------- BOSS（10 个） ---------------- */
  const BOSSES = [
    { floor:10,  id:'gemini',  name:'守门双子',   title:'GEMINI WARDEN',   hp:22, dmg:2, ai:'gemini',  color:'#8fe388', hint:'两尊同步行动的镜像守卫——每尊首次倒下都会半血复活，逐一击破两次！' },
    { floor:20,  id:'clock',   name:'发条暴君',   title:'CLOCK TYRANT',    hp:34, dmg:2, ai:'clock',   color:'#ffb454', hint:'环形弹幕与地砖箭头齐发，逆着推力走位。' },
    { floor:30,  id:'frostheart', name:'寒霜之心', title:'FROST HEART',     hp:40, dmg:2, ai:'frost',   color:'#7fd8ff', hint:'冰环扩散、冰锥落点预警——站在裂缝外。' },
    { floor:40,  id:'molten',  name:'熔核巨人',   title:'MOLTEN COLOSSUS', hp:52, dmg:3, ai:'molten',  color:'#ff7847', hint:'三连冲锋撞墙即眩晕，尾迹是熔岩。' },
    { floor:50,  id:'hourglass',name:'时之沙漏王', title:'HOURGLASS KING',  hp:46, dmg:3, ai:'hourglass',color:'#ffd27d', hint:'每 8 回合将你回溯到 4 回合前的位置——预判它！' },
    { floor:60,  id:'voideye', name:'虚空之眼',   title:'VOID EYE',        hp:55, dmg:3, ai:'eye',     color:'#c084fc', hint:'黑暗中环绕眼弹，眨眼的间隙是唯一窗口。' },
    { floor:70,  id:'choir',   name:'回声合唱团', title:'ECHO CHOIR',      hp:60, dmg:3, ai:'choir',   color:'#e4ccff', hint:'三个回声分别重演你的移动/等待/冲撞——别被自己包围。' },
    { floor:80,  id:'janus',   name:'双面神',     title:'JANUS',           hp:66, dmg:3, ai:'janus',   color:'#9adfff', hint:'明暗双态轮换：只有当前实体态可被伤害。' },
    { floor:90,  id:'weaver',  name:'万象织网者', title:'THE WEAVER',      hp:74, dmg:3, ai:'weaver',  color:'#ff5edb', hint:'旋转激光网——安全区随网转动而移动。' },
    { floor:100, id:'firstecho',name:'初生回声',  title:'THE FIRST ECHO',  hp:99, dmg:3, ai:'firstecho',color:'#ffffff', hint:'它记得你爬塔的每一步……三阶段终焉之战。' },
  ];
  const bossOf = (floor) => BOSSES.find((b) => b.floor === floor) || null;

  /* ---------------- 遗物（24 被动） ---------------- */
  const RELICS = [
    { id:'magnet',    name:'磁力符',     desc:'金币自动飞向你（范围 3）。', color:'#ffd27d' },
    { id:'thorns',    name:'荆棘胸甲',   desc:'被撞击时反伤 1 点。', color:'#8fe388' },
    { id:'slowaura',  name:'时滞怀表',   desc:'敌人行动有 20% 概率迟滞一拍。', color:'#7fd8ff' },
    { id:'lifesteal', name:'吸血獠牙',   desc:'击杀回复 1 HP。', color:'#ff6b8a' },
    { id:'lens',      name:'回声透镜',   desc:'回声轨迹预览延长到 12 步。', color:'#e4ccff' },
    { id:'lantern',   name:'守塔灯笼',   desc:'黑暗楼层视野半径 +2。', color:'#ffe9a8' },
    { id:'spring',    name:'弹簧靴',     desc:'冰面不再打滑。', color:'#bdeaff' },
    { id:'shieldgen', name:'防爆盾',     desc:'爆炸与激光伤害减半（向上取整）。', color:'#9adfff' },
    { id:'greed',     name:'贪婪面具',   desc:'金币获取 +50%，最大生命 -2。', color:'#ffd700' },
    { id:'scholar',   name:'学者卷轴',   desc:'经验获取 +30%。', color:'#c8b8ff' },
    { id:'shadowstep',name:'影分结',     desc:'每层首次受击伤害无效。', color:'#8a7fff' },
    { id:'coil',      name:'磁暴线圈',   desc:'冲撞伤害 +2 且击退 1 格。', color:'#ffb454' },
    { id:'pendulum',  name:'不倒钟摆',   desc:'受到致命伤害时保留 1 HP（每层一次）。', color:'#ffe08a' },
    { id:'belt',      name:'药剂腰带',   desc:'通关一层回复 1 HP。', color:'#ff8ca8' },
    { id:'compass',   name:'黄金罗盘',   desc:'碎片方向始终以微光指示。', color:'#ffd27d' },
    { id:'cunning',   name:'蛇之狡诈',   desc:'10% 概率完全闪避接触伤害。', color:'#59c9a5' },
    { id:'bombbag',   name:'爆破背袋',   desc:'炸弹容量 +2，爆炸范围 +1。', color:'#ff7847' },
    { id:'echoheart', name:'回声之心',   desc:'击碎回声掉落翻倍，且回声不再伤害你（仍会推动你）。', color:'#e4ccff' },
    { id:'glasscannon',name:'琉璃炮',    desc:'攻击 +3，最大生命 -2。', color:'#ff4632' },
    { id:'guardian',  name:'守护符',     desc:'相邻敌人每回合受 1 点灼磨。', color:'#8fe388' },
    { id:'midas',     name:'点金指',     desc:'击杀额外掉落 3 金币。', color:'#ffd700' },
    { id:'sprinter',  name:'疾风之踵',   desc:'每层前 10 步敌人不会主动移动。', color:'#bdeaff' },
    { id:'frostward', name:'霜纹护符',   desc:'免疫冰面滑行偏移伤害，薄冰对你不碎。', color:'#7fd8ff' },
    { id:'phoenix',   name:'凤羽烬',     desc:'死亡时原地复活一次（3 HP），每局一次。', color:'#ff9a4d' },
  ];

  /* ---------------- 天赋池（三选一，30 条） ----------------
   * kind: stat / unlock / skill / item / special
   */
  const TALENTS = [
    { id:'t_hp2',   kind:'stat', name:'岩壳',       desc:'最大生命 +2 并回复 2。', apply:{ maxHp:+2, heal:2 } },
    { id:'t_hp4',   kind:'stat', name:'巨壁',       desc:'最大生命 +4 并回复 2。（稀有）', apply:{ maxHp:+4, heal:2 }, weight:0.5 },
    { id:'t_atk1',  kind:'stat', name:'磨刃',       desc:'攻击 +1。', apply:{ atk:+1 } },
    { id:'t_atk2',  kind:'stat', name:'断钢',       desc:'攻击 +2。（稀有）', apply:{ atk:+2 }, weight:0.5 },
    { id:'t_dash',  kind:'unlock', name:'疾风步',   desc:'解锁【冲撞】：直线冲刺并撞击伤害。', apply:{ unlockDash:true } },
    { id:'t_dashcd',kind:'special', name:'残影',     desc:'冲撞冷却 -1（最低 1）。', need:'dash', apply:{ dashCd:-1 } },
    { id:'t_bomb',  kind:'item', name:'爆破储备',   desc:'获得 2 枚炸弹。', apply:{ bombs:+2 } },
    { id:'t_key',   kind:'item', name:'万能钥匙坯', desc:'获得 1 把钥匙。', apply:{ keys:+1 } },
    { id:'t_heal',  kind:'item', name:'时之甘露',   desc:'立刻回复 4 HP。', apply:{ heal:4 } },
    { id:'t_freeze',kind:'skill', name:'时停怀表',  desc:'解锁【时停】：冻结所有敌人 3 回合（每层 1 次）。', apply:{ unlockFreeze:true } },
    { id:'t_swap',  kind:'skill', name:'置换术',    desc:'解锁【置换】：与回声交换位置（每层 2 次）。', apply:{ unlockSwap:true } },
    { id:'t_pulse', kind:'skill', name:'震荡脉冲',  desc:'解锁【脉冲】：震伤周围 2 格敌人 3 点（每层 2 次）。', apply:{ unlockPulse:true } },
    { id:'t_vision',kind:'stat', name:'夜枭之眼',   desc:'视野半径 +1（黑暗层显著）。', apply:{ vision:+1 } },
    { id:'t_gold',  kind:'item', name:'路费',       desc:'获得 50 金币。', apply:{ gold:+50 } },
    { id:'t_crit',  kind:'stat', name:'弱点洞察',   desc:'暴击率 +15%（1.5 倍伤害）。', apply:{ crit:+15 } },
    { id:'t_armor', kind:'stat', name:'鳞甲',       desc:'每次受击伤害 -1（最低 1）。', apply:{ armor:1 } },
    { id:'t_xp',    kind:'stat', name:'顿悟',       desc:'经验获取 +20%。', apply:{ xpMul:+20 } },
    { id:'t_echoxp',kind:'special', name:'共鸣',     desc:'击碎回声额外掉 6 回尘。', apply:{ echoDust:+6 } },
    { id:'t_shop',  kind:'special', name:'议价',     desc:'商店价格 -20%。', apply:{ shopDisc:20 } },
    { id:'t_bombdmg',kind:'special', name:'定向装药', desc:'炸弹伤害 +2。', apply:{ bombDmg:+2 } },
    { id:'t_laser', kind:'special', name:'偏振镜片', desc:'哨戒炮激光对你伤害减半。', apply:{ laserHalf:true } },
    { id:'t_thorn2',kind:'special', name:'荆棘共生', desc:'反伤 +1（可与遗物叠加）。', apply:{ thornsAdd:1 } },
    { id:'t_first', kind:'special', name:'先制',     desc:'你对敌人的首次攻击每层 +2 伤害。', apply:{ firstStrike:2 } },
    { id:'t_regen', kind:'special', name:'吐纳',     desc:'每 12 回合回复 1 HP。', apply:{ regenN:12 } },
    { id:'t_golddmg',kind:'special', name:'赏金猎手', desc:'击杀金币 +2。', apply:{ killGold:+2 } },
    { id:'t_iceslip',kind:'special', name:'冰爪',     desc:'冰面滑行可随时急停（按住方向即可）。', apply:{ iceClaw:true } },
    { id:'t_plate', kind:'special', name:'机关学',   desc:'压力板充能效率翻倍。', apply:{ plateMul:2 } },
    { id:'t_dust',  kind:'special', name:'回尘亲和', desc:'本局回尘获取 +30%。', apply:{ dustMul:30 } },
    { id:'t_maxhp%',kind:'stat', name:'塔的祝福',   desc:'最大生命 +6。（稀有）', apply:{ maxHp:+6, heal:3 }, weight:0.3 },
    { id:'t_atkhp', kind:'stat', name:'血祭',       desc:'攻击 +2，最大生命 -2。', apply:{ atk:+2, maxHp:-2 } },
  ];

  /* ---------------- 职业 ---------------- */
  const CLASSES = [
    { id:'knight', name:'守塔骑士', en:'WARDEN KNIGHT', color:'#8fe388',
      desc:'生命 +2，初始携带遗物「荆棘胸甲」。稳如磐石的前排。',
      mods:{ maxHp:+2 }, startRelic:'thorns' },
    { id:'ranger', name:'星火游侠', en:'STARFIRE RANGER', color:'#ffd27d',
      desc:'解锁远程【星火弹】（3 回合充能）。风筝流的浪漫。',
      mods:{}, startSkill:'spark' },
    { id:'shadow', name:'影行者', en:'SHADOW STRIDER', color:'#c084fc',
      desc:'每层首次受击无效；回尘获取 +25%。刀尖上起舞。',
      mods:{}, startTrait:'firstFree' },
  ];

  /* ---------------- 元进度护符（回尘解锁） ---------------- */
  const CHARMS = [
    { id:'charm_atk1',   name:'起步锋刃', desc:'开局攻击 +1。',                 cost:20 },
    { id:'charm_hp2',    name:'岩石肤',   desc:'开局最大生命 +2。',             cost:20 },
    { id:'charm_lantern',name:'守灯人',   desc:'开局自带「守塔灯笼」。',         cost:25 },
    { id:'charm_gold',   name:'锦囊',     desc:'开局额外 60 金币。',            cost:15 },
    { id:'charm_bomb',   name:'爆破执照', desc:'开局携带 2 枚炸弹。',           cost:15 },
    { id:'charm_dash',   name:'疾风步·启', desc:'开局解锁冲撞。',               cost:30 },
    { id:'charm_revive', name:'不灭烛',   desc:'每局首次死亡将以 3 HP 复活。',   cost:45 },
    { id:'charm_lens',   name:'回尘磁化', desc:'回尘获取 +20%。',              cost:25 },
  ];

  /* ---------------- 商店货架权重 ---------------- */
  const SHOP_POOL = [
    { id:'shop_heal',  name:'时之甘露', desc:'回复 4 HP。',      base:30 },
    { id:'shop_maxhp', name:'生命结晶', desc:'最大生命 +2。',    base:55 },
    { id:'shop_atk',   name:'磨刀石',   desc:'攻击 +1。',        base:70 },
    { id:'shop_key',   name:'黄铜钥匙', desc:'开启上锁宝箱。',   base:25 },
    { id:'shop_bomb',  name:'炸弹×2',   desc:'轰开一切相邻。',   base:30 },
    { id:'shop_relic', name:'神秘遗物', desc:'随机一件未持有遗物。', base:90 },
    { id:'shop_draft', name:'命运重铸', desc:'立即获得一次三选一。', base:60 },
    { id:'shop_purify',name:'净尘香',   desc:'清除当前层的回声。', base:40 },
  ];

  /* ---------------- 国际化：英文覆盖表（按 id 注入 nameE/descE/hintE） ---------------- */
  const _EN = {
    enemies: {
      slime: ['Green Slime'], bat: ['Cave Bat'], sentry: ['Sentry Turret'], ghost: ['Wisp'],
      wraithling: ['Lesser Wraith'], gargoyle: ['Gargoyle'], mimic: ['Mimic Chest'],
      splitter: ['Splitter Slime'], slimeling: ['Slimelet'], archer: ['Bone Archer'],
      voidmage: ['Void Mage'], bomber: ['Boom Bug'], mirrorthief: ['Mirror Thief'],
      phasebeast: ['Phase Beast'],
    },
    bosses: {
      gemini: { n: 'Gemini Warden', h: 'Twin mirrored guardians act in sync — each rises once at half HP. Break both twice!' },
      clock: { n: 'Clock Tyrant', h: 'Radial barrages and tile-flipping arrows — walk against the push.' },
      frost: { n: 'Frost Heart', h: 'Expanding frost rings and telegraphed icicles — stay off the marked tiles.' },
      molten: { n: 'Molten Colossus', h: 'Triple charge leaves lava trails; slamming into walls stuns him.' },
      hourglass: { n: 'Hourglass King', h: 'Every 8 turns he drags you 4 steps into the past — anticipate it!' },
      eye: { n: 'Void Eye', h: 'Orbiting orbs in darkness — strike only while the eye is open.' },
      choir: { n: 'Echo Choir', h: 'Three echoes replay your moves; the conductor is invulnerable until they fall.' },
      janus: { n: 'Janus', h: 'Light and dark phases alternate — only the solid form can be hurt.' },
      weaver: { n: 'The Weaver', h: 'A rotating laser web — keep moving with the safe arc.' },
      firstecho: { n: 'The First Echo', h: 'It remembers every step of your run… three-phase finale.' },
    },
    relics: {
      magnet: ['Magnet Charm', 'Gold flies to you within 3 tiles.'],
      thorns: ['Thorn Mail', 'Attackers take 1 damage back.'],
      slowaura: ['Chrono Watch', '20% chance an enemy skips its turn.'],
      lifesteal: ['Vampire Fang', 'Heal 1 HP on kill.'],
      lens: ['Echo Lens', 'Echo path preview extended to 12 steps.'],
      lantern: ["Keeper's Lantern", '+2 vision radius on dark floors.'],
      spring: ['Spring Boots', 'No sliding on ice.'],
      shieldgen: ['Blast Shield', 'Halve explosion and laser damage.'],
      greed: ['Greed Mask', '+50% gold, max HP -2.'],
      scholar: ['Scholar Scroll', '+30% XP gained.'],
      shadowstep: ['Shadow Knot', 'First hit each floor deals 0 damage.'],
      coil: ['Storm Coil', 'Dash deals +2 damage and knocks back.'],
      pendulum: ['Unfallen Pendulum', 'Survive a fatal hit at 1 HP, once per floor.'],
      belt: ['Potion Belt', 'Heal 1 HP when you clear a floor.'],
      compass: ['Golden Compass', 'Shards shimmer in your HUD direction.'],
      cunning: ['Serpent Cunning', '10% chance to dodge contact damage.'],
      bombbag: ['Bomb Pouch', '+2 bomb capacity, +1 blast radius.'],
      echoheart: ['Echo Heart', 'Echoes never hurt you, and shatter drops double dust.'],
      glasscannon: ['Glass Cannon', '+3 ATK, max HP -2.'],
      guardian: ['Guardian Sigil', 'Adjacent enemies burn for 1 each turn.'],
      midas: ['Midas Touch', '+3 gold per kill.'],
      sprinter: ["Sprinter's Heel", 'Enemies stay passive during your first 10 steps each floor.'],
      frostward: ['Frost Ward', 'Ice never slides you; thin ice never breaks underfoot.'],
      phoenix: ['Phoenix Ember', 'Revive once per run at 3 HP.'],
    },
    talents: {
      t_hp2: ['Stone Shell', '+2 max HP and heal 2.'],
      t_hp4: ['Great Wall', '+4 max HP and heal 2. (rare)'],
      t_atk1: ['Whetstone', '+1 ATK.'],
      t_atk2: ['Steel Breaker', '+2 ATK. (rare)'],
      t_dash: ['Dash Step', 'Unlock DASH: lunge in a line and slam enemies.'],
      t_dashcd: ['Afterimage', 'Dash cooldown -1 (min 1).'],
      t_bomb: ['Bomb Cache', 'Gain 2 bombs.'],
      t_key: ['Key Blank', 'Gain 1 key.'],
      t_heal: ['Chrono Dew', 'Heal 4 HP immediately.'],
      t_freeze: ['Freeze Watch', 'Unlock TIME STOP: freeze all enemies for 3 turns (once per floor).'],
      t_swap: ['Swap Art', 'Unlock SWAP: trade places with your echo (twice per floor).'],
      t_pulse: ['Shock Pulse', 'Unlock PULSE: 3 damage to enemies within 2 tiles (twice per floor).'],
      t_vision: ['Owl Eye', '+1 vision radius.'],
      t_gold: ['Toll Money', 'Gain 50 gold.'],
      t_crit: ['Weak Spot', '+15% crit chance (1.5x damage).'],
      t_armor: ['Scale Armor', 'All incoming damage -1 (min 1).'],
      t_xp: ['Epiphany', '+20% XP gained.'],
      t_echoxp: ['Resonance', 'Echoes drop +6 extra dust when shattered.'],
      t_shop: ['Haggling', 'Shop prices -20%.'],
      t_bombdmg: ['Shaped Charges', 'Bomb damage +2.'],
      t_laser: ['Polarized Lens', 'Laser damage to you is halved.'],
      t_thorn2: ['Thorn Symbiosis', 'Thorns +1 (stacks with relic).'],
      t_first: ['First Strike', 'Your first attack on each enemy per floor deals +2.'],
      t_regen: ['Breathwork', 'Heal 1 HP every 12 turns.'],
      t_golddmg: ['Bounty Hunter', '+2 gold per kill.'],
      t_iceslip: ['Ice Claws', 'Stop sliding on ice whenever you wish.'],
      t_plate: ['Mechanism Lore', 'Pressure plates charge twice as fast for you.'],
      t_dust: ['Dust Affinity', '+30% dust this run.'],
      't_maxhp%': ["Tower's Blessing", '+6 max HP. (rare)'],
      t_atkhp: ['Blood Price', '+2 ATK, max HP -2.'],
    },
    classes: {
      knight: ['HP +2, starts with the Thorn Mail relic. A steady frontline.'],
      ranger: ['Unlock the ranged SPARK bolt (3-turn charge). Kiting is life.'],
      shadow: ['First hit each floor is free; +25% dust. Dance on the blade.'],
    },
    charms: {
      charm_atk1: ['Starting Edge', '+1 ATK at run start.'],
      charm_hp2: ['Stone Skin', '+2 max HP at run start.'],
      charm_lantern: ['Lamplighter', 'Start with the Keeper\u2019s Lantern relic.'],
      charm_gold: ['Purse', 'Start with +60 gold.'],
      charm_bomb: ['Blasting License', 'Start with 2 bombs.'],
      charm_dash: ['Dash Initiate', 'Start with DASH unlocked.'],
      charm_revive: ['Undying Candle', 'First death each run revives you at 3 HP.'],
      charm_lens: ['Dust Magnet', '+20% dust gained.'],
    },
    shop: {
      shop_heal: ['Chrono Dew', 'Restore 4 HP.'],
      shop_maxhp: ['Life Crystal', '+2 max HP.'],
      shop_atk: ['Whetstone', '+1 ATK.'],
      shop_key: ['Brass Key', 'Opens locked chests.'],
      shop_bomb: ['Bombs x2', 'Blast adjacent everything.'],
      shop_relic: ['Mystery Relic', 'A random unowned relic.'],
      shop_draft: ['Fate Reforge', 'Gain an extra draft right now.'],
      shop_purify: ['Purifying Incense', 'Banish the current echo.'],
    },
  };
  const byId = (arr) => Array.isArray(arr) ? Object.fromEntries(arr.map((x) => [x.id, x])) : arr;
  const eById = byId(ENEMIES), rById = byId(RELICS), tlById = byId(TALENTS), chById = byId(CHARMS), spById = byId(SHOP_POOL);
  for (const id in _EN.enemies) if (eById[id]) eById[id].nameE = _EN.enemies[id][0];
  for (const id in _EN.bosses) { const b = BOSSES.find((x) => x.id === id); if (b) { b.nameE = _EN.bosses[id].n; b.hintE = _EN.bosses[id].h; } }
  for (const id in _EN.relics) if (rById[id]) { rById[id].nameE = _EN.relics[id][0]; rById[id].descE = _EN.relics[id][1]; }
  for (const id in _EN.talents) if (tlById[id]) { tlById[id].nameE = _EN.talents[id][0]; tlById[id].descE = _EN.talents[id][1]; }
  for (const id in _EN.classes) { const c = CLASSES.find((x) => x.id === id); if (c) c.descE = _EN.classes[id][0]; }
  for (const id in _EN.charms) if (chById[id]) { chById[id].nameE = _EN.charms[id][0]; chById[id].descE = _EN.charms[id][1]; }
  for (const id in _EN.shop) if (spById[id]) { spById[id].nameE = _EN.shop[id][0]; spById[id].descE = _EN.shop[id][1]; }

  return { BAL, BIOMES, biomeOf, ENEMIES, BOSSES, bossOf, RELICS, TALENTS, CLASSES, CHARMS, SHOP_POOL };
});
