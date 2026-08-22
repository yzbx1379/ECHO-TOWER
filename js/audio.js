/* =========================================================================
 * 《回声之塔 ECHO TOWER》 — js/audio.js
 * 全程序化 WebAudio：合成音效 + 分群系五声音阶环境音乐（零音频素材）。
 * 浏览器挂 window.EchoAudio。
 * ========================================================================= */
(function () {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musBus = null;
  let muted = false, volume = 0.8, musicVolume = 0.5;
  let musicTimer = null, nextNoteTime = 0, step16 = 0;
  let biome = null, intensity = 1;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = musicVolume; musBus.connect(master);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ---------------- 基础合成器 ---------------- */
  function tone(opt) {
    if (!ensure() || muted) return;
    const t0 = opt.at || ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(opt.f0 || 440, t0);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t0 + (opt.dur || 0.1));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opt.dur || 0.1));
    o.connect(g); g.connect(opt.bus || sfxBus);
    o.start(t0); o.stop(t0 + (opt.dur || 0.1) + 0.02);
  }
  function noise(opt) {
    if (!ensure() || muted) return;
    const t0 = opt.at || ctx.currentTime;
    const dur = opt.dur || 0.15;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = opt.ftype || 'lowpass'; f.frequency.value = opt.freq || 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opt.gain || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0);
  }

  /* ---------------- 音效库 ---------------- */
  const SFX = {
    step()      { tone({ type: 'triangle', f0: 190 + Math.random() * 30, f1: 150, dur: 0.05, gain: 0.06 }); },
    bump()      { tone({ type: 'square', f0: 110, f1: 70, dur: 0.08, gain: 0.12 }); },
    shard()     { [523, 659, 784].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.22, gain: 0.14, at: ctx.currentTime + i * 0.07 })); },
    exitOpen()  { [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.12, at: ctx.currentTime + i * 0.09 })); },
    portal()    { tone({ type: 'sine', f0: 220, f1: 1400, dur: 0.45, gain: 0.18 }); },
    hurt()      { noise({ freq: 700, dur: 0.18, gain: 0.3 }); tone({ type: 'sawtooth', f0: 180, f1: 60, dur: 0.2, gain: 0.2 }); },
    hit()       { noise({ freq: 1600, dur: 0.09, gain: 0.24 }); tone({ type: 'square', f0: 300, f1: 120, dur: 0.08, gain: 0.14 }); },
    kill()      { noise({ freq: 500, dur: 0.3, gain: 0.28 }); },
    explode()   { noise({ freq: 300, dur: 0.55, gain: 0.42 }); tone({ type: 'sawtooth', f0: 90, f1: 30, dur: 0.5, gain: 0.3 }); },
    dash()      { noise({ ftype: 'highpass', freq: 2000, dur: 0.12, gain: 0.16 }); },
    laser()     { tone({ type: 'sawtooth', f0: 1200, f1: 300, dur: 0.18, gain: 0.14 }); },
    bolt()      { tone({ type: 'square', f0: 800, f1: 400, dur: 0.1, gain: 0.1 }); },
    gold()      { tone({ type: 'sine', f0: 988, dur: 0.08, gain: 0.12 }); tone({ type: 'sine', f0: 1319, dur: 0.14, gain: 0.1, at: ctx.currentTime + 0.06 }); },
    heal()      { [440, 554, 659].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.25, gain: 0.11, at: ctx.currentTime + i * 0.08 })); },
    echoDie()   { [880, 660, 440, 220].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.2, gain: 0.13, at: ctx.currentTime + i * 0.06 })); },
    plate()     { tone({ type: 'square', f0: 260, f1: 200, dur: 0.12, gain: 0.12 }); },
    gate()      { tone({ type: 'square', f0: 150, f1: 320, dur: 0.25, gain: 0.14 }); },
    spike()     { noise({ ftype: 'highpass', freq: 3000, dur: 0.07, gain: 0.12 }); },
    freeze()    { [1047, 1319, 1568].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.4, gain: 0.1, at: ctx.currentTime + i * 0.1 })); },
    swap()      { tone({ type: 'sine', f0: 600, f1: 200, dur: 0.2, gain: 0.15 }); tone({ type: 'sine', f0: 200, f1: 600, dur: 0.2, gain: 0.15, at: ctx.currentTime + 0.12 }); },
    pulse()     { tone({ type: 'sine', f0: 100, f1: 40, dur: 0.35, gain: 0.3 }); },
    levelup()   { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.13, at: ctx.currentTime + i * 0.09 })); },
    buy()       { tone({ type: 'sine', f0: 700, dur: 0.07, gain: 0.12 }); tone({ type: 'sine', f0: 1050, dur: 0.12, gain: 0.1, at: ctx.currentTime + 0.05 }); },
    ui()        { tone({ type: 'square', f0: 420, dur: 0.04, gain: 0.07 }); },
    bossRoar()  { tone({ type: 'sawtooth', f0: 70, f1: 45, dur: 0.9, gain: 0.34 }); noise({ freq: 240, dur: 0.9, gain: 0.3 }); },
    die()       { [392, 330, 262, 196, 131].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.4, gain: 0.16, at: ctx.currentTime + i * 0.16 })); },
    win()       { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, gain: 0.15, at: ctx.currentTime + i * 0.13 })); },
    tick()      { tone({ type: 'square', f0: 1300, dur: 0.03, gain: 0.05 }); },
  };
  function sfx(name) {
    if (!ensure()) return;
    resume();
    if (!muted && SFX[name]) SFX[name]();
  }

  /* ---------------- 环境音乐（前瞻调度器） ---------------- */
  function startMusic(b) {
    biome = b; intensity = 1;
    if (!ensure()) return;
    resume();
    stopMusic();
    nextNoteTime = ctx.currentTime + 0.1; step16 = 0;
    musicTimer = setInterval(schedule, 90);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function setIntensity(v) { intensity = v; }

  function schedule() {
    if (!ctx || !biome) return;
    const spb = 60 / ((biome.bpm || 84) * (intensity >= 2 ? 1.12 : 1)) / 4; // 十六分音符
    while (nextNoteTime < ctx.currentTime + 0.25) {
      playStep(step16, nextNoteTime);
      nextNoteTime += spb;
      step16 = (step16 + 1) % 32;
    }
  }
  function playStep(s, t) {
    if (muted) return;
    const scale = biome.scale || [0, 3, 5, 7, 10];
    const root = 110; // A2
    const deg = (i) => root * Math.pow(2, (scale[((i % scale.length) + scale.length) % scale.length] + 12 * Math.floor(i / scale.length)) / 12);
    // 低音：每 8 步一个
    if (s % 8 === 0) {
      tone({ type: 'triangle', f0: deg(scale.length - 1) / 2, dur: 0.5, gain: 0.16, at: t, bus: musBus });
    }
    // 琶音
    const pat = [0, 2, 4, 2, 1, 3, 4, 3];
    if (intensity === 1 ? s % 2 === 0 : true) {
      const n = pat[(s / (intensity === 1 ? 2 : 1)) % pat.length | 0];
      if (!(s % 16 === 15)) tone({ type: 'sine', f0: deg(n) * 2, dur: 0.22, gain: 0.05, at: t, bus: musBus });
    }
    // 高潮层：BOSS/战斗加花
    if (intensity >= 2 && s % 4 === 2) {
      tone({ type: 'square', f0: deg((s * 3) % (scale.length * 2)) * 2, dur: 0.12, gain: 0.035, at: t, bus: musBus });
    }
    // 打击点
    if (s % 8 === 4) {
      const t0 = t;
      const buf = ctx.createBuffer(1, 1200, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.value = 0.03;
      src.connect(f); f.connect(g); g.connect(musBus); src.start(t0);
    }
  }

  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : volume; }
  function setVolume(v) { volume = v; if (master && !muted) master.gain.value = v; }
  function setMusicVolume(v) { musicVolume = v; if (musBus) musBus.gain.value = v; }

  window.EchoAudio = { ensure, resume, sfx, startMusic, stopMusic, setIntensity, setMuted, setVolume, setMusicVolume,
    get muted() { return muted; } };
})();
