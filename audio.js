// 《皮衣求生记》声音：用 Web Audio 实时合成音效与 BGM，不依赖任何音频文件
(() => {
  const KEY = 'jensen_run_audio';
  const cfg = Object.assign({ music: true, sfx: true, volume: 0.7 }, (() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  })());
  const save = () => localStorage.setItem(KEY, JSON.stringify(cfg));

  const MUSIC_LEVEL = 0.65;
  const SFX_LEVEL = 0.9;
  const BPM = 84;
  const STEP = 60 / BPM / 4;   // 十六分音符时长
  const LOOP = 64;             // 4 小节一循环

  let ctx, master, musicBus, sfxBus, echo, noiseBuf;
  let playing = false, timer = null, nextTime = 0, step = 0;
  let tension = false, duckLevel = 1;

  const mf = m => 440 * 2 ** ((m - 69) / 12);

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = cfg.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = cfg.music ? MUSIC_LEVEL : 0;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = cfg.sfx ? SFX_LEVEL : 0;
    sfxBus.connect(master);

    // 旋律用的回声
    echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    echo.connect(fb); fb.connect(echo);
    echo.connect(wet); wet.connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // ───── 基础发声 ─────
  function tone(f, t, dur, o = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    let out = g;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      g.connect(lp);
      out = lp;
    }
    out.connect(o.dest || sfxBus);
    if (o.echo) out.connect(echo);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(t, dur, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'highpass';
    f.frequency.value = o.freq || 6000;
    if (o.q) f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ───── 音效 ─────
  const SFX = {
    click:   t => tone(1300, t, 0.035, { gain: 0.05 }),
    type:    t => tone(1700 + Math.random() * 300, t, 0.016, { type: 'square', gain: 0.008, lp: 2600 }),
    pop:     t => { tone(660, t, 0.08, { type: 'triangle', gain: 0.07 }); tone(990, t + 0.05, 0.1, { type: 'triangle', gain: 0.06 }); },
    confirm: t => { tone(880, t, 0.06, { type: 'triangle', gain: 0.08 }); tone(1320, t + 0.05, 0.12, { type: 'triangle', gain: 0.07 }); },
    up:      t => tone(520, t, 0.18, { gain: 0.09, slide: 880 }),
    down:    t => tone(420, t, 0.22, { type: 'triangle', gain: 0.09, slide: 210 }),
    cash:    t => { tone(1568, t, 0.12, { gain: 0.07 }); tone(2093, t + 0.07, 0.28, { gain: 0.07 }); },
    event:   t => {
      noise(t, 0.4, { ftype: 'bandpass', freq: 800, q: 0.7, gain: 0.05 });
      [60, 64, 67].forEach((m, i) => tone(mf(m), t + 0.03 * i, 0.7, { type: 'triangle', gain: 0.045, attack: 0.03 }));
    },
    day:     t => { tone(mf(48), t, 1.4, { gain: 0.11 }); tone(mf(55), t + 0.18, 1.1, { gain: 0.06 }); },
    alarm:   t => {
      for (let i = 0; i < 3; i++) {
        tone(880, t + i * 0.24, 0.11, { type: 'square', gain: 0.045, lp: 2400 });
        tone(660, t + i * 0.24 + 0.12, 0.11, { type: 'square', gain: 0.045, lp: 2400 });
      }
    },
  };

  const ENDING = {
    good:   t => { [60, 64, 67, 72].forEach((m, i) => tone(mf(m), t + i * 0.12, 1.2, { type: 'triangle', gain: 0.08 })); [48, 55].forEach(m => tone(mf(m), t + 0.5, 1.8, { gain: 0.08, attack: 0.05 })); },
    normal: t => { [60, 67, 64, 72].forEach((m, i) => tone(mf(m), t + i * 0.16, 0.9, { type: 'triangle', gain: 0.07 })); },
    hidden: t => { [72, 74, 76, 78, 80, 84].forEach((m, i) => tone(mf(m), t + i * 0.09, 0.8, { gain: 0.05, echo: true })); },
    bad:    t => { [67, 63, 60, 55].forEach((m, i) => tone(mf(m), t + i * 0.22, 0.9, { type: 'triangle', gain: 0.08 })); },
    dead:   t => {
      // 接口短路的噼啪声 + 低频下坠
      for (let i = 0; i < 9; i++) noise(t + i * 0.05 + Math.random() * 0.03, 0.04, { ftype: 'bandpass', freq: 1500 + Math.random() * 2500, q: 2, gain: 0.12 });
      tone(110, t + 0.45, 1.6, { type: 'sawtooth', gain: 0.07, slide: 30, lp: 600 });
    },
  };

  // ───── BGM：慢速 lo-fi，四小节循环；热度过高时换成小调 ─────
  const CHORDS = {
    calm:  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],   // Fmaj7 Em7 Dm7 Cmaj7
    tense: [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]],   // Dm7 Bbmaj7 Gm7 A7
  };
  const BASS = { calm: [41, 40, 38, 36], tense: [38, 34, 31, 33] };
  const SCALE = { calm: [72, 74, 76, 79, 81], tense: [74, 77, 79, 81, 84] };

  function playStep(s, t) {
    const mode = tension ? 'tense' : 'calm';
    const bar = Math.floor(s / 16) % 4;
    const pos = s % 16;
    const bus = musicBus;

    if (pos === 0) {
      CHORDS[mode][bar].forEach((m, i) => {
        tone(mf(m), t, STEP * 16, { type: 'triangle', gain: 0.03, attack: 0.35, lp: tension ? 900 : 1500, dest: bus, detune: i % 2 ? 6 : -6 });
      });
    }
    // 贝斯
    if ([0, 6, 8, 14].includes(pos)) {
      const root = BASS[mode][bar] - 12 + (pos === 14 ? 7 : 0);
      tone(mf(root), t, STEP * 2.5, { gain: pos === 0 ? 0.13 : 0.09, attack: 0.01, dest: bus });
    }
    // 底鼓（软）
    if (pos === 0 || pos === 8) tone(110, t, 0.2, { gain: 0.12, slide: 42, dest: bus });
    // 边击
    if (pos === 4 || pos === 12) noise(t, 0.07, { ftype: 'bandpass', freq: 1900, q: 1.2, gain: 0.03, dest: bus });
    // 踩镲，带一点摇摆
    if (pos % 2 === 0) {
      const swing = pos % 4 === 2 ? STEP * 0.18 : 0;
      noise(t + swing, 0.035, { freq: 7500, gain: pos % 4 === 2 ? 0.022 : 0.012, dest: bus });
    }
    if (tension && pos % 4 === 0) tone(mf(BASS[mode][bar] - 24), t, STEP * 0.8, { type: 'sawtooth', gain: 0.025, lp: 300, dest: bus });
    // 稀疏的旋律
    if ([2, 7, 10, 13].includes(pos) && Math.random() < (tension ? 0.25 : 0.35)) {
      const m = SCALE[mode][Math.floor(Math.random() * 5)];
      tone(mf(m), t, STEP * 3, { type: 'triangle', gain: 0.03, attack: 0.01, dest: bus, echo: true });
    }
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % LOOP;
    }
  }

  function applyMusicLevel(fast) {
    if (!ctx) return;
    const target = cfg.music && playing ? MUSIC_LEVEL * duckLevel : 0;
    musicBus.gain.setTargetAtTime(target, ctx.currentTime, fast ? 0.05 : 0.4);
  }

  function startMusic() {
    if (!cfg.music || playing || !init()) return;
    playing = true;
    clearInterval(timer);
    nextTime = ctx.currentTime + 0.08;
    step = 0;
    timer = setInterval(schedule, 25);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    applyMusicLevel();
  }

  function stopMusic() {
    if (!playing) return;
    playing = false;
    applyMusicLevel();
    const t = timer;
    setTimeout(() => { if (!playing) clearInterval(t); }, 1500);
  }

  // ───── 对外接口 ─────
  let lastType = 0;
  const Sound = {
    cfg,
    sfx(name) {
      if (!cfg.sfx || !ctx || ctx.state !== 'running' || !SFX[name]) return;
      if (name === 'type') {
        const now = performance.now();
        if (now - lastType < 70) return;
        lastType = now;
      }
      SFX[name](ctx.currentTime + 0.01);
    },
    ending(type) {
      stopMusic();
      if (cfg.sfx && ctx && ENDING[type]) ENDING[type](ctx.currentTime + 0.3);
    },
    startMusic,
    stopMusic,
    duck(on) { duckLevel = on ? 0.45 : 1; applyMusicLevel(); },
    setTension(on) { tension = !!on; },
    setMusic(on) {
      cfg.music = on; save();
      if (on) { if (!playing) startMusic(); else applyMusicLevel(); }
      else stopMusic();
    },
    setSfx(on) { cfg.sfx = on; save(); if (ctx) sfxBus.gain.value = on ? SFX_LEVEL : 0; },
    setVolume(v) { cfg.volume = v; save(); if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
  };
  window.Sound = Sound;

  // 浏览器要求用户操作后才能出声：第一次点击或按键时解锁并开始播放
  const unlock = () => {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // 切到后台时暂停
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  // 所有按钮的点击音
  document.addEventListener('click', e => {
    if (e.target.closest('button:not(:disabled)') && !e.target.closest('#event-choices')) Sound.sfx('click');
  }, true);
})();
