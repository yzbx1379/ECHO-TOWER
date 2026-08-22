/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/render.js
 * Canvas 世界渲染：群系调色地砖 / 实体图形 / 回声与轨迹预览 / 粒子 /
 * 激光 / 黑暗视野 / 小地图。浏览器挂 window.EchoRender。
 * ========================================================================= */
(function () {
  'use strict';
  const C = window.EchoCore, G = window.EchoGen, D = window.EchoData;
  const T = G.T;
  const TS = 36; // 图块像素

  /* ---------------- 小图形库 ---------------- */
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }

  /* ---------------- 主渲染 ---------------- */
  function render(ctx, game, canvas, time) {
    const dpr = canvas.__dpr || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const pal = game.level.biome.pal;
    const p = game.player;
    // 相机
    const [sx, sy] = C.camera.offset(1 / 60);
    C.camera.follow(p.px * TS, p.py * TS);
    const camX = C.camera.x - W / 2 + sx, camY = C.camera.y - H / 2 + sy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-camX, -camY);

    const x0 = Math.max(0, Math.floor(camX / TS)), y0 = Math.max(0, Math.floor(camY / TS));
    const x1 = Math.min(game.level.w - 1, Math.ceil((camX + W) / TS));
    const y1 = Math.min(game.level.h - 1, Math.ceil((camY + H) / TS));

    /* ---- 地砖 ---- */
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        drawTile(ctx, game, x, y, pal, time);
      }
    }
    /* ---- 出口 / 碎片 / 宝箱 / 拾取物 ---- */
    drawPOIs(ctx, game, pal, time);
    /* ---- 危险预警 ---- */
    for (const s of game.pendingSlams) {
      const a = 0.35 + 0.25 * Math.sin(time * 10);
      ctx.globalAlpha = a;
      circle(ctx, s.x * TS + TS / 2, s.y * TS + TS / 2, TS * 0.42, null, s.color || '#ff7847', 3);
      ctx.globalAlpha = 1;
    }
    /* ---- 激光 ---- */
    for (const b of game.beams) {
      ctx.save();
      ctx.globalAlpha = 0.7 * b.life;
      ctx.strokeStyle = b.color; ctx.lineWidth = 4; ctx.shadowColor = b.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(b.x0 * TS + TS / 2, b.y0 * TS + TS / 2); ctx.lineTo(b.x1 * TS + TS / 2, b.y1 * TS + TS / 2); ctx.stroke();
      ctx.restore();
    }
    /* ---- 回声（含未来轨迹预览） ---- */
    drawEchoes(ctx, game, pal, time);
    /* ---- 敌人 ---- */
    for (const e of game.enemies) if (!e.dead) drawEnemy(ctx, game, e, time);
    /* ---- 投射物 ---- */
    for (const pr of game.projectiles) {
      const px = pr.x * TS + TS / 2, py = pr.y * TS + TS / 2;
      const col = pr.kind === 'spark' ? '#ffd27d' : pr.kind === 'bolt' ? '#e8e3d5' : '#c084fc';
      circle(ctx, px, py, 5, col); ctx.shadowBlur = 0;
    }
    /* ---- 玩家 ---- */
    drawPlayer(ctx, game, pal, time);
    /* ---- 粒子 / 飘字（世界空间） ---- */
    for (const pt of C.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      if (pt.glow) { ctx.shadowColor = pt.color; ctx.shadowBlur = 6; }
      ctx.fillRect(pt.x * TS + TS / 2 - pt.size / 2, pt.y * TS + TS / 2 - pt.size / 2, pt.size, pt.size);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    for (const f of C.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = (f.big ? 'bold 20px' : '13px') + " 'ZCOOL QingKe HuangYou','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillText(f.text, f.x * TS + TS / 2 + 1, f.y * TS + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * TS + TS / 2, f.y * TS);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* ---- 黑暗视野 ---- */
    if (game.level.dark) {
      const vision = (3 + game.stats.vision + (game.has('lantern') ? 2 : 0)) * TS;
      const gx = p.px * TS + TS / 2 - camX, gy = p.py * TS + TS / 2 - camY;
      const grad = ctx.createRadialGradient(gx, gy, vision * 0.45, gx, gy, vision);
      grad.addColorStop(0, 'rgba(5,3,12,0)');
      grad.addColorStop(1, 'rgba(5,3,12,0.94)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    /* ---- 暗角 ---- */
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- 单格绘制 ---------------- */
  function drawTile(ctx, game, x, y, pal, time) {
    const t = game.tileAt(x, y);
    const px = x * TS, py = y * TS;
    const alt = (x + y) % 2 === 0;
    if (t === T.WALL) {
      ctx.fillStyle = pal.wall; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = pal.wallTop; ctx.fillRect(px, py, TS, 4);
      return;
    }
    ctx.fillStyle = alt ? pal.floor : pal.floorAlt;
    ctx.fillRect(px, py, TS, TS);
    switch (t) {
      case T.ICE: {
        ctx.fillStyle = 'rgba(190,234,255,.34)'; ctx.fillRect(px + 2, py + 2, TS - 4, TS - 4);
        poly(ctx, [[px + 8, py + 8], [px + 16, py + 14], [px + 9, py + 20]], 'rgba(255,255,255,.35)');
        break;
      }
      case T.THIN: {
        ctx.strokeStyle = 'rgba(190,234,255,.75)'; ctx.lineWidth = 1.5;
        const m = game.metaAt(x, y) || {};
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 10); ctx.lineTo(px + 18, py + 18); ctx.lineTo(px + 28, py + 12);
        if ((m.cracks || 0) >= 1) { ctx.moveTo(px + 14, py + 6); ctx.lineTo(px + 17, py + 26); }
        ctx.stroke();
        break;
      }
      case T.WATER: {
        ctx.fillStyle = 'rgba(60,130,190,.5)'; ctx.fillRect(px + 2, py + 2, TS - 4, TS - 4);
        break;
      }
      case T.LAVA: {
        const wob = Math.sin(time * 3 + x * 2 + y) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,90,40,${0.55 + wob * 0.25})`;
        ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
        ctx.shadowColor = '#ff4632'; ctx.shadowBlur = 10;
        ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
        ctx.shadowBlur = 0;
        break;
      }
      case T.RUBBLE: {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        for (let i = 0; i < 4; i++) ctx.fillRect(px + 5 + i * 7, py + 8 + ((i % 2) * 12), 5, 5);
        break;
      }
      case T.GATE: {
        const g = game.gateAt(x, y);
        const gc = ['#ffd27d', '#7fd8ff', '#8fe388', '#ff8ca8'][(g ? g.group : 0) % 4];
        if (g && g.open) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px + 8, py, 4, TS); ctx.fillRect(px + 22, py, 4, TS); }
        else {
          // 竖栅栏 + 组色边框 + 充能进度（区别于宝箱的横箱造型）
          ctx.fillStyle = '#2c2416'; ctx.fillRect(px + 3, py + 2, TS - 6, TS - 4);
          for (let i = 0; i < 3; i++) { ctx.fillStyle = '#8a744a'; ctx.fillRect(px + 8 + i * 9, py + 3, 4, TS - 6); }
          const pulse = g && g.charge > 0 ? 0.5 + 0.5 * Math.sin(time * 5) : 1;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = gc; ctx.lineWidth = 2.5;
          ctx.strokeRect(px + 3, py + 2, TS - 6, TS - 4);
          ctx.fillStyle = gc;
          ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⚡' + String((g && g.charge) || 0) + '/' + String((g && g.need) || '?'), px + TS / 2, py - 2);
          ctx.restore();
        }
        break;
      }
      case T.PLATE: {
        const pl = game.level.plates.find((q) => q.x === x && q.y === y);
        const gc = ['#ffd27d', '#7fd8ff', '#8fe388', '#ff8ca8'][((pl ? pl.group : 0)) % 4];
        const linked = game.level.gates.find((gg) => gg.group === (pl ? pl.group : 0));
        const done = linked && linked.open;
        // 呼吸光环提示可踩
        const pr = 10 + Math.sin(time * 4 + x * 1.7) * (done ? 0 : 2.5);
        ctx.save();
        ctx.shadowColor = gc; ctx.shadowBlur = done ? 0 : 10;
        circle(ctx, px + TS / 2, py + TS / 2, pr, '#3a3020', gc, 2.5);
        circle(ctx, px + TS / 2, py + TS / 2, 3.5, done ? '#555' : gc);
        if (!done && linked) {
          ctx.fillStyle = gc; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⚡' + (linked.need - Math.min(linked.charge || 0, linked.need)), px + TS / 2, py + TS - 1);
        }
        ctx.restore();
        break;
      }
      case T.PORTAL: {
        const r = 8 + Math.sin(time * 4 + x) * 2;
        ctx.save(); ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 14;
        circle(ctx, px + TS / 2, py + TS / 2, r, 'rgba(192,132,252,.4)', '#c084fc', 2);
        ctx.restore();
        break;
      }
      case T.VENT: {
        const m = game.metaAt(x, y) || {};
        const active = m.dir && ((game.turnCount + (m.phase || 0)) % (m.period || 6)) === 0;
        ctx.fillStyle = active ? '#ffb454' : '#4a3a26';
        ctx.fillRect(px + 8, py + 8, TS - 16, TS - 16);
        ctx.strokeStyle = '#ffb454'; ctx.beginPath();
        ctx.moveTo(px + TS / 2, py + TS / 2);
        ctx.lineTo(px + TS / 2 + m.dir[0] * 12, py + TS / 2 + m.dir[1] * 12);
        ctx.stroke();
        break;
      }
      case T.ARROW: {
        const m = game.metaAt(x, y) || {};
        if (!m.dir) break;
        ctx.save();
        ctx.translate(px + TS / 2, py + TS / 2);
        ctx.rotate(Math.atan2(m.dir[1], m.dir[0]));
        poly(ctx, [[-6, -8], [8, 0], [-6, 8]], 'rgba(255,180,84,.65)');
        ctx.restore();
        break;
      }
      case T.PHASE: {
        if (game.phaseOpen(x, y)) {
          ctx.fillStyle = 'rgba(192,132,252,.15)'; ctx.fillRect(px, py, TS, TS);
          ctx.strokeStyle = 'rgba(192,132,252,.5)'; ctx.setLineDash([4, 4]); ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4); ctx.setLineDash([]);
        } else {
          ctx.fillStyle = pal.wall; ctx.fillRect(px, py, TS, TS);
          ctx.fillStyle = 'rgba(192,132,252,.35)'; ctx.fillRect(px + 6, py + 6, TS - 12, TS - 12);
        }
        break;
      }
      default: break;
    }
    // 尖刺/火焰覆盖层
    const hz = game.level.hazards.find((h) => h.x === x && h.y === y);
    if (hz && (t === T.FLOOR || t === T.RUBBLE)) {
      const act = game.spikeActiveAt(x, y);
      const preAct = ((game.turnCount + 1 + hz.phase) % hz.period) < 2;
      if (hz.type === 'fire') {
        ctx.fillStyle = act ? '#ff7847' : preAct ? 'rgba(255,120,71,.3)' : 'rgba(80,50,40,.6)';
        ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, act ? 11 : 8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = act ? '#e8e3d5' : preAct ? 'rgba(232,227,213,.5)' : 'rgba(120,110,100,.5)';
        ctx.lineWidth = 2;
        const hgt = act ? 12 : preAct ? 5 : 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(px + 8 + i * 10, py + TS - 8);
          ctx.lineTo(px + 8 + i * 10 + 3, py + TS - 8 - hgt);
          ctx.lineTo(px + 8 + i * 10 + 6, py + TS - 8);
          ctx.stroke();
        }
      }
    }
  }

  /* ---------------- 出口 / 碎片 / 宝箱 / 拾取 ---------------- */
  function drawPOIs(ctx, game, pal, time) {
    const L = game.level;
    // 出口传送门
    {
      const ex = L.exit.x * TS + TS / 2, ey = L.exit.y * TS + TS / 2;
      const ready = L.shards.every((s) => s.got) && !L.exitLock;
      const r = 11 + Math.sin(time * (ready ? 5 : 2)) * 3;
      ctx.save();
      ctx.shadowColor = ready ? pal.glow : '#555'; ctx.shadowBlur = ready ? 18 : 4;
      circle(ctx, ex, ey, r, ready ? 'rgba(143,227,136,.35)' : 'rgba(90,90,90,.25)', ready ? pal.accent : '#777', 2);
      if (!ready) { ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 7, ey - 7); ctx.lineTo(ex + 7, ey + 7); ctx.stroke(); }
      ctx.restore();
    }
    // 碎片
    for (const s of L.shards) {
      if (s.got) continue;
      const cx = s.x * TS + TS / 2, cy = s.y * TS + TS / 2 + Math.sin(time * 3 + s.x) * 3;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(time * 1.5);
      ctx.shadowColor = '#8fe388'; ctx.shadowBlur = 12;
      poly(ctx, [[0, -9], [7, 0], [0, 9], [-7, 0]], '#8fe388', '#eafff0', 1.5);
      ctx.restore();
    }
    // 宝箱
    for (const c of L.chests) {
      if (c.opened) continue;
      const px = c.x * TS, py = c.y * TS;
      ctx.fillStyle = c.locked ? '#8a6a2a' : '#a87e33';
      ctx.fillRect(px + 6, py + 10, TS - 12, TS - 16);
      ctx.fillStyle = c.locked ? '#c9a03c' : '#d8b055';
      ctx.fillRect(px + 6, py + 10, TS - 12, 7);
      if (c.locked) { ctx.fillStyle = '#ffd700'; ctx.fillRect(px + TS / 2 - 2, py + TS / 2 - 2, 4, 7); }
    }
    // 拾取物
    for (const pk of game.pickups) {
      const cx = pk.x * TS + TS / 2, cy = pk.y * TS + TS / 2 + Math.sin(time * 4 + pk.x * 2) * 2;
      if (pk.kind === 'gold') { circle(ctx, cx, cy, 4.5, '#ffd700', '#fff3c0', 1); }
      else if (pk.kind === 'heart') {
        ctx.fillStyle = '#ff6b8a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('♥', cx, cy + 4);
      } else if (pk.kind === 'key') {
        ctx.fillStyle = '#ffd27d'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚿', cx, cy + 4);
      } else if (pk.kind === 'dust') {
        ctx.save(); ctx.shadowColor = '#e4ccff'; ctx.shadowBlur = 8;
        circle(ctx, cx, cy, 3.5, '#e4ccff');
        ctx.restore();
      }
    }
    // 临时熔岩
    for (const l of game.tempLava) {
      ctx.save(); ctx.globalAlpha = 0.75; ctx.shadowColor = '#ff4632'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff7847';
      ctx.fillRect(l.x * TS + 2, l.y * TS + 2, TS - 4, TS - 4);
      ctx.restore();
    }
  }

  /* ---------------- 回声 ---------------- */
  function drawEchoes(ctx, game, pal, time) {
    const list = [];
    if (game.echo && game.echo.alive && game.echo.spawned !== false) list.push(game.echo);
    for (const be of game.bossEchoes) if (!be.dead) list.push(be);
    for (const eco of list) {
      // 轨迹
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < eco.trail.length; i++) {
        const tr = eco.trail[i];
        ctx.fillStyle = '#e4ccff';
        ctx.fillRect(tr.x * TS + TS / 2 - 2, tr.y * TS + TS / 2 - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      // 未来轨迹虚线（透镜加长）
      if (eco === game.echo && eco.rec) {
        const lens = game.has('lens') ? 12 : 6;
        let sx = eco.x, sy = eco.y;
        ctx.strokeStyle = 'rgba(228,204,255,.5)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(sx * TS + TS / 2, sy * TS + TS / 2);
        for (let k = eco.i; k < Math.min(eco.rec.length, eco.i + lens); k++) {
          const cmd = eco.rec[k];
          if (cmd.t === 'w') continue;
          let nx = sx + cmd.dx, ny = sy + cmd.dy;
          const t = game.tileAt(nx, ny);
          if (t === T.WALL || t === T.PHASE || game.enemyAt(nx, ny)) continue; // 近似：撞墙则停
          sx = nx; sy = ny;
          ctx.lineTo(sx * TS + TS / 2, sy * TS + TS / 2);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // 本体（半透明幽灵）
      const wob = Math.sin(time * 5) * 1.5;
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.translate(eco.x * TS + TS / 2, eco.y * TS + TS / 2 + wob);
      circle(ctx, 0, -2, 9, 'rgba(228,204,255,.85)', '#fff', 1.5);
      poly(ctx, [[-9, 4], [0, 12], [9, 4]], 'rgba(228,204,255,.55)');
      ctx.fillStyle = '#3a2a55';
      circle(ctx, -3, -3, 1.5, '#3a2a55'); circle(ctx, 3, -3, 1.5, '#3a2a55');
      ctx.restore();
    }
  }

  /* ---------------- 敌人图形库 ---------------- */
  function drawEnemy(ctx, game, e, time) {
    const cx = e.px != null ? e.px * TS + TS / 2 : e.x * TS + TS / 2;
    const cy = e.py != null ? e.py * TS + TS / 2 : e.y * TS + TS / 2;
    ctx.save();
    if (e.flashT > 0) { e.flashT -= 1 / 60; ctx.filter = 'brightness(2.2)'; }
    const col = e.def?.color || e.def || '#fff';
    const color = typeof col === 'string' ? col : '#fff';
    // 伪装宝箱怪
    if (e.disguise) {
      ctx.fillStyle = '#a87e33'; ctx.fillRect(cx - 12, cy - 8, 24, 17);
      ctx.fillStyle = '#d8b055'; ctx.fillRect(cx - 12, cy - 8, 24, 6);
      ctx.restore();
      return;
    }
    switch (e.bossId || e.type) {
      case 'slime': case 'slimeling': case 'splitter': {
        const w = e.type === 'slimeling' ? 8 : 12;
        const sq = Math.sin(time * 6 + e.uid) * 2;
        poly(ctx, [[cx - w, cy + w * 0.7], [cx - w * 0.6, cy - w * 0.6 - sq], [cx + w * 0.6, cy - w * 0.6 + sq], [cx + w, cy + w * 0.7]], color, '#0a0a0a', 1.5);
        circle(ctx, cx - 3, cy, 1.6, '#111'); circle(ctx, cx + 3, cy, 1.6, '#111');
        break;
      }
      case 'bat': {
        const fl = Math.sin(time * 14 + e.uid) * 4;
        poly(ctx, [[cx, cy], [cx - 13, cy - 4 - fl], [cx - 6, cy + 3]], color);
        poly(ctx, [[cx, cy], [cx + 13, cy - 4 + fl], [cx + 6, cy + 3]], color);
        circle(ctx, cx, cy, 4, color);
        break;
      }
      case 'sentry': {
        ctx.fillStyle = color; ctx.fillRect(cx - 9, cy - 9, 18, 18);
        ctx.strokeStyle = '#222'; ctx.strokeRect(cx - 9, cy - 9, 18, 18);
        if (e.st.charge) {
          ctx.save(); ctx.shadowColor = '#ff4632'; ctx.shadowBlur = 8;
          ctx.strokeStyle = '#ff4632'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.lineTo(cx + e.st.charge.dx * TS * 6, cy + e.st.charge.dy * TS * 6);
          ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
        break;
      }
      case 'ghost': case 'wraithling': {
        const wob = Math.sin(time * 4 + e.uid) * 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 9, Math.PI, 0);
        ctx.lineTo(cx + 9, cy + 8 + wob);
        for (let i = 0; i < 3; i++) ctx.arc(cx + 6 - i * 6, cy + 8 + wob, 3, 0, Math.PI, i % 2 === 0);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        circle(ctx, cx - 3, cy - 3, 1.5, '#333'); circle(ctx, cx + 3, cy - 3, 1.5, '#333');
        break;
      }
      case 'gargoyle': {
        if (e.st.asleep) {
          ctx.fillStyle = '#6b6157'; poly(ctx, [[cx - 10, cy + 8], [cx, cy - 10], [cx + 10, cy + 8]], '#6b6157', '#444');
          ctx.fillStyle = '#ddd'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('z', cx + 8, cy - 10);
        } else {
          poly(ctx, [[cx - 10, cy + 9], [cx - 12, cy - 4], [cx - 4, cy - 10], [cx + 4, cy - 10], [cx + 12, cy - 4], [cx + 10, cy + 9]], color, '#333');
          circle(ctx, cx - 4, cy - 2, 2, '#ff4632'); circle(ctx, cx + 4, cy - 2, 2, '#ff4632');
        }
        break;
      }
      case 'mimic': {
        ctx.fillStyle = '#a87e33'; ctx.fillRect(cx - 12, cy - 8, 24, 17);
        // 尖牙嘴
        poly(ctx, [[cx - 8, cy + 2], [cx + 8, cy + 2], [cx + 6, cy + 7], [cx - 6, cy + 7]], '#fff');
        circle(ctx, cx - 6, cy - 2, 2.5, '#ff4632'); circle(ctx, cx + 6, cy - 2, 2.5, '#ff4632');
        break;
      }
      case 'archer': {
        ctx.strokeStyle = color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, 9, -Math.PI / 2.4, Math.PI / 2.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 3, cy - 8); ctx.lineTo(cx - 3, cy + 8); ctx.stroke();
        circle(ctx, cx, cy, 3.5, '#e8e3d5');
        break;
      }
      case 'voidmage': {
        poly(ctx, [[cx - 9, cy + 9], [cx, cy - 11], [cx + 9, cy + 9]], color, '#2a1548');
        circle(ctx, cx, cy - 1, 3, '#ffe08a');
        break;
      }
      case 'bomber': {
        const puls = e.st.fuseWarn ? 1 + Math.sin(time * 20) * 0.15 : 1;
        circle(ctx, cx, cy, 7 * puls, color, '#7a2200', 2);
        ctx.strokeStyle = '#5a2a00'; ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.quadraticCurveTo(cx + 4, cy - 12, cx + 2, cy - 14); ctx.stroke();
        break;
      }
      default: {
        // BOSS 与未知类型：大圆环 + 名字
        const bossCol = e.def?.color || '#fff';
        const r = e.boss ? 16 + Math.sin(time * 3) * 2 : 10;
        ctx.save(); ctx.shadowColor = bossCol; ctx.shadowBlur = 16;
        circle(ctx, cx, cy, r, null, bossCol, 3.5);
        circle(ctx, cx, cy, r * 0.55, bossCol);
        ctx.restore();
        break;
      }
    }
    if (e.st.frozen) {
      ctx.strokeStyle = 'rgba(190,234,255,.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(cx - 11, cy - 11, 22, 22);
    }
    // BOSS 血条
    if (e.boss) {
      const bw = 56;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - bw / 2, cy - 26, bw, 5);
      ctx.fillStyle = color; ctx.fillRect(cx - bw / 2, cy - 26, bw * Math.max(0, e.hp / e.maxHp), 5);
      const bossNm = (window.EchoLang && window.EchoLang.isEN() && e.def && e.def.nameE) ? e.def.nameE : e.name;
      ctx.fillStyle = '#fff'; ctx.font = '10px "ZCOOL QingKe HuangYou",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(bossNm, cx, cy - 30);
    } else if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - 10, cy - 14, 20, 3);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(cx - 10, cy - 14, 20 * Math.max(0, e.hp / e.maxHp), 3);
    }
    ctx.restore();
  }

  /* ---------------- 玩家 ---------------- */
  function drawPlayer(ctx, game, pal, time) {
    const p = game.player;
    const cx = p.px * TS + TS / 2, cy = p.py * TS + TS / 2;
    const clsCol = { knight: '#8fe388', ranger: '#ffd27d', shadow: '#c084fc' }[game.classId] || '#fff';
    const blink = game.invulnTurns > 0 && Math.floor(time * 12) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.4;
    ctx.shadowColor = clsCol; ctx.shadowBlur = 12;
    circle(ctx, cx, cy, 10, clsCol, '#0a0a0a', 2);
    ctx.shadowBlur = 0;
    // 面向指示
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(cx + p.facing[0] * 4, cy + p.facing[1] * 4, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // 星火充能环
    if (p.sparkCharge >= 3) {
      ctx.strokeStyle = '#ffd27d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 14, time * 3 % (Math.PI * 2), (time * 3 % (Math.PI * 2)) + Math.PI * 1.5); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 小地图 ---------------- */
  function drawMinimap(mctx, game, canvas) {
    const L = game.level;
    const scale = Math.min(canvas.width / L.w, canvas.height / L.h);
    mctx.clearRect(0, 0, canvas.width, canvas.height);
    mctx.fillStyle = 'rgba(8,10,16,.85)';
    mctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const t = L.grid[y * L.w + x];
        if (t === T.WALL) continue;
        mctx.fillStyle = 'rgba(140,160,150,.4)';
        mctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    for (const s of L.shards) {
      if (s.got) continue;
      mctx.fillStyle = '#8fe388';
      mctx.fillRect(s.x * scale - 1, s.y * scale - 1, scale + 2, scale + 2);
    }
    mctx.fillStyle = '#7fd8ff';
    mctx.fillRect(L.exit.x * scale - 1, L.exit.y * scale - 1, scale + 2, scale + 2);
    // 压力板（金点）与关闭的栅栏门（橙块）——方便寻找机关
    for (const p of L.plates) { mctx.fillStyle = '#ffd27d'; mctx.fillRect(p.x * scale - 1, p.y * scale - 1, scale + 2, scale + 2); }
    for (const g of L.gates) {
      if (g.open) continue;
      mctx.fillStyle = '#ff9a4d'; mctx.fillRect(g.x * scale, g.y * scale, scale, scale);
    }
    for (const e of game.enemies) {
      if (e.dead) continue;
      mctx.fillStyle = e.boss ? '#ff4632' : 'rgba(255,107,107,.8)';
      mctx.fillRect(e.x * scale, e.y * scale, scale, scale);
    }
    if (game.echo && game.echo.alive && game.echo.spawned) {
      mctx.fillStyle = '#e4ccff';
      mctx.fillRect(game.echo.x * scale, game.echo.y * scale, scale, scale);
    }
    mctx.fillStyle = '#fff';
    mctx.fillRect(game.player.x * scale - 1, game.player.y * scale - 1, scale + 2, scale + 2);
  }

  window.EchoRender = { render, drawMinimap, TS };
})();
