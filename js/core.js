/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/core.js
 * 引擎基建：画布与 DPR、输入（键盘+触控）、相机与震屏、粒子、飘字、
 * hitstop、运行时可控随机数、缓动工具。浏览器挂 window.EchoCore。
 * ========================================================================= */
(function () {
  'use strict';

  /* ---------------- 可复现运行时随机 ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 相机 ---------------- */
  const camera = {
    x: 0, y: 0, shakeT: 0, shakeMag: 0,
    follow(tx, ty, lerp) {
      this.x += (tx - this.x) * (lerp == null ? 0.12 : lerp);
      this.y += (ty - this.y) * (lerp == null ? 0.12 : lerp);
    },
    snap(tx, ty) { this.x = tx; this.y = ty; },
    shake(mag, dur) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, dur || 0.25); },
    offset(dt) {
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const m = this.shakeMag * Math.max(0, this.shakeT / 0.25);
        return [m ? (Math.random() * 2 - 1) * m : 0, m ? (Math.random() * 2 - 1) * m : 0];
      }
      this.shakeMag = 0;
      return [0, 0];
    },
  };

  /* ---------------- 粒子 ---------------- */
  const particles = [];
  function burst(wx, wy, color, n, opt) {
    opt = opt || {};
    for (let i = 0; i < (n || 8); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opt.speed || 60) * (0.4 + Math.random());
      particles.push({
        x: wx, y: wy,
        vx: Math.cos(a) * sp + (opt.vx || 0), vy: Math.sin(a) * sp + (opt.vy || 0),
        life: (opt.life || 0.5) * (0.6 + Math.random() * 0.7),
        maxLife: 1, color, size: opt.size || 3, grav: opt.grav || 0, glow: opt.glow !== false,
      });
      particles[particles.length - 1].maxLife = particles[particles.length - 1].life;
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }

  /* ---------------- 飘字 ---------------- */
  const floaters = [];
  function floatText(wx, wy, text, color, big) {
    floaters.push({ x: wx, y: wy, text, color: color || '#fff', life: 0.9, big: !!big, vy: -46 });
  }
  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.92;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  /* ---------------- HitStop（命中停顿） ---------------- */
  const hitstop = { t: 0, stop(d) { this.t = Math.max(this.t, d); }, consume(dt) { const s = Math.min(this.t, dt); this.t -= s; return dt - s; } };

  /* ---------------- 输入 ---------------- */
  const keysDown = new Set();
  const pressQueue = [];
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    Space: 'wait', Enter: 'confirm', Escape: 'pause', KeyP: 'pause',
    KeyQ: 'skill1', KeyE: 'skill2', KeyR: 'skill3',
    KeyJ: 'attack', KeyF: 'attack',
    KeyB: 'bomb', KeyM: 'map', ShiftLeft: 'shift', ShiftRight: 'shift',
  };
  const DIR_ACTIONS = new Set(['up', 'down', 'left', 'right']);
  /* 长按连走：按住方向键后自动重复触发（首延迟 240ms，之后每 125ms 一步） */
  const held = { action: null, next: 0 };
  const REPEAT_DELAY = 240, REPEAT_RATE = 125;
  function bindInput(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        keysDown.add(a);
        pressQueue.push({ action: a, shift: e.shiftKey || keysDown.has('shift') });
        if (DIR_ACTIONS.has(a)) { held.action = a; held.next = performance.now() + REPEAT_DELAY; }
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        keysDown.delete(a);
        if (DIR_ACTIONS.has(a) && held.action === a) held.action = null;
      }
    });
    window.addEventListener('blur', () => { keysDown.clear(); held.action = null; });
    // 触控/虚拟按钮：长按也连走
    window.addEventListener('echo-vbtn', (e) => {
      pressQueue.push({ action: e.detail.action, shift: false });
      if (DIR_ACTIONS.has(e.detail.action)) { held.action = e.detail.action; held.next = performance.now() + REPEAT_DELAY; }
      else if (e.detail.up && held.action === e.detail.action) held.action = null;
    });
    window.addEventListener('echo-vbtn-up', (e) => {
      if (held.action === e.detail.action) held.action = null;
    });
  }
  function popAction() { return pressQueue.shift() || null; }
  function clearActions() { pressQueue.length = 0; }
  /* 主循环每帧调用：若方向被按住且到了触发时间，返回一个合成的移动动作 */
  function takeRepeat(now) {
    if (!held.action) return null;
    if (now >= held.next) {
      held.next = now + REPEAT_RATE;
      return { action: held.action, shift: keysDown.has('shift'), auto: true };
    }
    return null;
  }

  /* ---------------- 缓动 ---------------- */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 画布 ---------------- */
  function setupCanvas(canvas) {
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      canvas.__dpr = dpr;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  /* 渲染坐标：格子 → 像素中心 */
  function cellToPx(x, y, TS) { return [x * TS + TS / 2, y * TS + TS / 2]; }

  window.EchoCore = {
    mulberry32, camera, particles, burst, floaters, floatText,
    updateParticles, updateFloaters, hitstop,
    bindInput, popAction, clearActions, keysDown, takeRepeat,
    easeOutCubic, clamp, lerp, setupCanvas, cellToPx,
  };
})();
