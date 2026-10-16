'use strict';
// ============================================================================
//  Audio: synthesized sound effects, speech call-outs and a jazzy hip-hop loop.
//  Everything is generated at runtime with the Web Audio API (no samples).
// ============================================================================
const SFX = (() => {
  let ac = null, master, sfxBus, musBus, noiseBuf;
  const S = { music: 0.5, sfx: 0.8, voice: true };
  let voice = null;

  // Deep male announcer: try the best-sounding male voices each platform ships, deepest first.
  const MALE_VOICES = [
    /Guy.*Natural/i, /Christopher.*Natural/i, /Eric.*Natural/i, /Roger.*Natural/i, /Davis.*Natural/i,
    /Andrew.*Natural/i, /Brian.*Natural/i, /Steffan.*Natural/i,                  // Edge online voices
    /Google UK English Male/i,                                                 // Chrome
    /Microsoft David/i, /Daniel/i, /Alex/i, /Fred/i, /Microsoft Mark/i,          // Windows / macOS
    /Microsoft George/i, /Microsoft James/i, /Rishi/i, /Aaron/i, /Arthur/i, /Gordon/i, /\bMale\b/i
  ];
  const FEMALE = /Zira|Aria|Jenny|Samantha|Susan|Hazel|Karen|Moira|Tessa|Victoria|Fiona|Female|Libby|Sonia|Michelle|Ana\b|Emma|Ava|Allison/i;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      voice = null;
      for (const re of MALE_VOICES) { voice = vs.find(v => re.test(v.name)); if (voice) break; }
      if (!voice) voice = vs.find(v => !FEMALE.test(v.name)) || vs[0] || null;
    } catch (e) { voice = null; }
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  function init() {
    if (ac) { if (ac.state !== 'running') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ac.destination);
    master = ac.createGain(); master.gain.value = 0.9; master.connect(comp);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musBus = ac.createGain(); musBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
  }

  function applyVolumes() {
    if (!ac) return;
    sfxBus.gain.setTargetAtTime(S.sfx, ac.currentTime, 0.02);
    musBus.gain.setTargetAtTime(M.ducked ? S.music * 0.12 : S.music * 0.5, ac.currentTime, 0.08);
  }
  function setVolumes(music, sfx, v) { S.music = music; S.sfx = sfx; S.voice = v; applyVolumes(); }

  // ---------------------------------------------------------------- helpers
  function env(p, t, a, peak, d) {
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(type, f0, f1, t, dur, peak, dest, a = 0.004, slide) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (slide || dur));
    env(g.gain, t, a, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, type, f0, f1, q, dest) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 0.8;
    const g = ac.createGain(); env(g.gain, t, 0.002, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // A short vocal-ish grunt: sawtooth through two formant filters.
  function grunt(t, f0, f1, dur, peak, form1, form2) {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); env(g.gain, t, 0.012, peak, dur);
    const b1 = ac.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = form1; b1.Q.value = 3;
    const b2 = ac.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = form2; b2.Q.value = 5;
    const g2 = ac.createGain(); g2.gain.value = 0.5;
    o.connect(b1); o.connect(b2); b2.connect(g2); b1.connect(g); g2.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.1);
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function say(text, pitch = 0.15, rate = 0.85) {   // pitch range is 0..2; 0 is the deepest the engine allows
    if (!S.voice || !window.speechSynthesis) return;
    try {
      if (!voice) pickVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, S.sfx * 1.2);
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { /* speech unsupported */ }
  }

  // ---------------------------------------------------------------- effects
  const fx = {
    jump(power) { // power 0..1
      if (!ac) return; const t = ac.currentTime;
      grunt(t, 150 + power * 70, 230 + power * 160, 0.1 + power * 0.05, 0.32, 700 + power * 300, 2300);
      tone('sine', 380 + power * 260, 760 + power * 900, t, 0.11 + power * 0.06, 0.1);
      if (power > 0.62) noise(t + 0.02, 0.38, 0.16, 'bandpass', 500, 3800, 1.6);
    },
    land(v) {
      if (!ac) return; const t = ac.currentTime; const k = Math.min(1, v / 14);
      tone('sine', 150, 52, t, 0.1, 0.22 + k * 0.25);
      noise(t, 0.05 + k * 0.04, 0.08 + k * 0.12, 'lowpass', 1400, 300, 0.7);
    },
    wall() {
      if (!ac) return; const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(560, t + 0.04);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.32);
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 26; lg.gain.value = 38; lfo.connect(lg); lg.connect(o.frequency);
      env(g.gain, t, 0.005, 0.28, 0.32);
      o.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + 0.4); lfo.stop(t + 0.4);
      noise(t, 0.04, 0.12, 'highpass', 2000, 0, 0.7);
    },
    comboStep(n) {
      if (!ac) return; const t = ac.currentTime;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
      const f = mtof(76 + scale[Math.min(n, scale.length - 1)]);
      tone('triangle', f, 0, t, 0.28, 0.16);
      tone('sine', f * 2, 0, t, 0.18, 0.07);
      tone('sine', f * 3.01, 0, t + 0.04, 0.12, 0.04);
    },
    comboEnd(rank) { // rank 0..9
      if (!ac) return; const t = ac.currentTime;
      const chord = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36];
      const n = 3 + Math.min(rank, 7);
      for (let i = 0; i < n; i++) {
        const f = mtof(67 + chord[i]);
        tone('square', f, 0, t + i * 0.055, 0.16, 0.05);
        tone('triangle', f, 0, t + i * 0.055, 0.3, 0.12);
      }
      const tt = t + n * 0.055;
      [0, 4, 7, 12].forEach(s => { tone('triangle', mtof(79 + s), 0, tt, 0.9, 0.08, null, 0.01); tone('sine', mtof(91 + s), 0, tt, 0.6, 0.03); });
      noise(tt, 0.6, 0.05, 'highpass', 6000, 0, 0.5);
    },
    comboBreak() {
      if (!ac) return; const t = ac.currentTime;
      tone('triangle', 520, 260, t, 0.18, 0.08);
    },
    hurry() {
      if (!ac) return; const t = ac.currentTime;
      // alarm-clock bell: rapid strikes of an inharmonic bell
      for (let i = 0; i < 14; i++) bell(t + i * 0.055, i % 2 ? 1760 : 1690, 0.07);
      for (let i = 0; i < 14; i++) bell(t + 1.05 + i * 0.055, i % 2 ? 1760 : 1690, 0.06);
      setTimeout(() => say('Hurry up!', 0.15, 0.95), 120);
    },
    tick() {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 0.025, 0.12, 'bandpass', 3200, 0, 6);
    },
    gameOver() {
      if (!ac) return; const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(170, t + 1.0);
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 7; lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
      env(g.gain, t, 0.02, 0.2, 1.0);
      o.connect(g); g.connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 1.1); lfo.stop(t + 1.1);
      // sad trombone
      const notes = [[55, 0.32], [54, 0.32], [53, 0.32], [52, 1.0]];
      let tt = t + 1.15;
      notes.forEach(([m, d], i) => {
        const oo = ac.createOscillator(), gg = ac.createGain(), lp = ac.createBiquadFilter();
        oo.type = 'sawtooth'; oo.frequency.setValueAtTime(mtof(m), tt);
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, tt); lp.frequency.linearRampToValueAtTime(1600, tt + 0.08); lp.frequency.linearRampToValueAtTime(800, tt + d);
        if (i === notes.length - 1) {
          const v = ac.createOscillator(), vg = ac.createGain();
          v.frequency.value = 5.5; vg.gain.value = 4; v.connect(vg); vg.connect(oo.frequency);
          v.start(tt + 0.2); v.stop(tt + d + 0.1);
        }
        gg.gain.setValueAtTime(0.0001, tt);
        gg.gain.linearRampToValueAtTime(0.16, tt + 0.04);
        gg.gain.setValueAtTime(0.16, tt + d - 0.08);
        gg.gain.exponentialRampToValueAtTime(0.0001, tt + d);
        oo.connect(lp); lp.connect(gg); gg.connect(sfxBus);
        oo.start(tt); oo.stop(tt + d + 0.05);
        tt += d;
      });
    },
    move() {
      if (!ac) return; const t = ac.currentTime;
      tone('square', 880, 0, t, 0.045, 0.05);
      tone('sine', 1320, 0, t, 0.05, 0.05);
    },
    select() {
      if (!ac) return; const t = ac.currentTime;
      tone('triangle', 660, 0, t, 0.09, 0.14);
      tone('triangle', 990, 0, t + 0.07, 0.16, 0.14);
      tone('sine', 1980, 0, t + 0.07, 0.12, 0.04);
    },
    back() {
      if (!ac) return; const t = ac.currentTime;
      tone('triangle', 660, 0, t, 0.08, 0.12);
      tone('triangle', 440, 0, t + 0.06, 0.12, 0.12);
    },
    type() {
      if (!ac) return; const t = ac.currentTime;
      tone('square', 1200 + Math.random() * 200, 0, t, 0.03, 0.04);
    },
    record() {
      if (!ac) return; const t = ac.currentTime;
      [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64]].forEach(([m, d]) => {
        tone('square', mtof(m), 0, t + d, 0.22, 0.05);
        tone('triangle', mtof(m), 0, t + d, 0.3, 0.13);
      });
    },
    milestone() {
      if (!ac) return; const t = ac.currentTime;
      [0, 4, 7, 12].forEach((s, i) => tone('triangle', mtof(72 + s), 0, t + i * 0.08, 0.5, 0.11));
      noise(t + 0.3, 0.5, 0.05, 'highpass', 7000, 0, 0.5);
    },
    say
  };

  function bell(t, f, peak) {
    [[1, 1, 0.5], [2.0, 0.45, 0.3], [2.76, 0.35, 0.25], [5.4, 0.2, 0.12], [8.9, 0.12, 0.07]].forEach(([r, a, d]) => {
      tone('sine', f * r * 0.5, 0, t, d, peak * a, null, 0.001);
    });
  }

  // ================================================================ music
  // Original jazzy boom-bap loop: ii-V-I progression, Rhodes-style chords,
  // walking-ish bass, swung hats and a vibraphone melody.
  const M = { on: false, step: 0, t: 0, loop: 0, timer: null, ducked: false };
  const BPM = 96, ST = 60 / BPM / 4, SWING = 0.17;
  const BARS = [
    [38, [53, 57, 60, 64]], // Dm9
    [43, [53, 59, 64, 69]], // G13
    [36, [52, 55, 59, 62]], // Cmaj9
    [45, [55, 61, 65, 71]], // A7(b13)
    [41, [53, 57, 60, 64]], // Fmaj7
    [40, [52, 55, 59, 62]], // Em7
    [38, [50, 53, 57, 60]], // Dm7
    [43, [53, 59, 62, 65]]  // G7
  ];
  const BASS = [[0, 0, 3], [3, 0, 1], [6, 12, 2], [8, 7, 2], [10, 0, 2], [13, 10, 1], [14, 12, 2]];
  const COMP = [[0, 6], [7, 2], [10, 5]];
  const MEL_A = [
    [0, 0, 69, 2], [0, 2, 72, 2], [0, 4, 76, 3], [0, 8, 74, 2], [0, 10, 72, 2], [0, 12, 69, 4],
    [1, 0, 71, 2], [1, 3, 74, 2], [1, 6, 77, 4], [1, 12, 76, 2], [1, 14, 74, 2],
    [2, 0, 76, 6], [2, 8, 67, 2], [2, 10, 71, 2], [2, 12, 74, 4],
    [3, 0, 73, 3], [3, 4, 76, 2], [3, 6, 79, 4], [3, 12, 77, 2], [3, 14, 76, 2],
    [4, 0, 72, 2], [4, 2, 76, 2], [4, 4, 81, 4], [4, 10, 79, 2], [4, 12, 76, 4],
    [5, 0, 79, 3], [5, 4, 74, 2], [5, 6, 71, 2], [5, 8, 76, 6],
    [6, 0, 77, 2], [6, 2, 76, 2], [6, 4, 74, 2], [6, 6, 72, 2], [6, 8, 69, 6],
    [7, 0, 71, 2], [7, 2, 74, 2], [7, 4, 77, 2], [7, 6, 79, 6]
  ];
  const MEL_B = [
    [0, 6, 81, 2], [0, 10, 79, 4], [1, 6, 77, 2], [1, 10, 74, 4],
    [2, 4, 76, 2], [2, 6, 79, 2], [2, 8, 83, 6], [3, 6, 81, 2], [3, 10, 79, 4],
    [4, 6, 76, 2], [4, 10, 77, 4], [5, 6, 74, 2], [5, 10, 71, 4],
    [6, 4, 69, 2], [6, 6, 72, 2], [6, 8, 74, 4], [7, 8, 71, 2], [7, 10, 74, 2], [7, 12, 79, 4]
  ];
  const melIndex = new Map();
  function indexMel(list, key) { list.forEach(n => { const k = key + ':' + (n[0] * 16 + n[1]); if (!melIndex.has(k)) melIndex.set(k, []); melIndex.get(k).push(n); }); }
  indexMel(MEL_A, 'A'); indexMel(MEL_B, 'B');

  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g.gain, t, 0.002, 0.95, 0.28); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + 0.35);
    noise(t, 0.012, 0.25, 'lowpass', 3000, 0, 0.7, musBus);
  }
  function snare(t, v) {
    noise(t, 0.16, 0.42 * v, 'bandpass', 1900, 0, 0.6, musBus);
    noise(t, 0.06, 0.25 * v, 'highpass', 5000, 0, 0.7, musBus);
    tone('triangle', 200, 150, t, 0.07, 0.3 * v, musBus);
  }
  function hat(t, v, open) { noise(t, open ? 0.2 : 0.035, 0.13 * v, 'highpass', 7500, 0, 0.6, musBus); }
  function bass(t, m, d) {
    const f = mtof(m);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f;
    lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const og = ac.createGain(); og.gain.value = 0.35;
    o.connect(og); og.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.setValueAtTime(0.42, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  }
  function rhodes(t, notes, d) {
    notes.forEach((m, i) => {
      const f = mtof(m), tt = t + i * 0.008;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const mo = ac.createOscillator(), mg = ac.createGain();
      mo.frequency.value = f * 2; mg.gain.setValueAtTime(f * 1.4, tt); mg.gain.exponentialRampToValueAtTime(f * 0.05, tt + 0.3);
      mo.connect(mg); mg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.055, tt + 0.008);
      g.gain.exponentialRampToValueAtTime(0.02, tt + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      o.connect(g); g.connect(musBus);
      o.start(tt); mo.start(tt); o.stop(tt + d + 0.05); mo.stop(tt + d + 0.05);
    });
  }
  function vibe(t, m, d) {
    const f = mtof(m);
    const o = ac.createOscillator(), g = ac.createGain(), trem = ac.createOscillator(), tg = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    trem.frequency.value = 5.2; tg.gain.value = 0.035; trem.connect(tg); tg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
    o.connect(g); g.connect(musBus);
    o.start(t); trem.start(t); o.stop(t + d + 0.6); trem.stop(t + d + 0.6);
    tone('sine', f * 4, 0, t, 0.12, 0.03, musBus, 0.002);
  }

  function playStep(s, t) {
    const bar = s >> 4, st = s & 15, [root, chord] = BARS[bar];
    // drums
    if (st === 0 || st === 7 || st === 10 || (bar % 4 === 3 && st === 15)) kick(t);
    if (st === 4 || st === 12) snare(t, 1);
    if (st === 9 || st === 15) snare(t, 0.18);
    if (bar === 7 && st >= 13) snare(t, 0.35 + (st - 13) * 0.2);
    if (st % 2 === 0) hat(t, st % 4 === 0 ? 1 : 0.6, (st === 14 && bar % 2 === 1));
    else if (st === 7 || st === 11) hat(t, 0.35, false);
    // bass
    BASS.forEach(([bs, semi, len]) => { if (bs === st) bass(t, root + semi, len * ST * 0.95); });
    // chords
    COMP.forEach(([cs, len]) => { if (cs === st) rhodes(t, chord, len * ST * 1.1); });
    // melody: A theme on even loops, answer phrase on odd loops (after first intro loop)
    if (M.loop >= 1) {
      const key = (M.loop % 2 ? 'A' : 'B') + ':' + s;
      const list = melIndex.get(key);
      if (list) list.forEach(n => vibe(t, n[2], n[3] * ST));
    }
  }

  function schedule() {
    if (!M.on || !ac) return;
    if (M.t < ac.currentTime - 0.05) M.t = ac.currentTime + 0.03;
    while (M.t < ac.currentTime + 0.15) {
      playStep(M.step, M.t + ((M.step % 2) ? SWING * ST : 0));
      M.step++;
      if (M.step >= 128) { M.step = 0; M.loop++; }
      M.t += ST;
    }
  }
  const music = {
    start() {
      if (!ac || M.on) return;
      M.on = true; M.step = 0; M.loop = 0; M.t = ac.currentTime + 0.08;
      M.timer = setInterval(schedule, 25); schedule();
    },
    stop() { M.on = false; clearInterval(M.timer); },
    duck(on) { M.ducked = on; applyVolumes(); },
    get playing() { return M.on; }
  };

  function suspend(on) {
    if (!ac) return;
    if (on) ac.suspend(); else ac.resume();
  }

  return { init, setVolumes, suspend, fx, music, get ready() { return !!ac; } };
})();
