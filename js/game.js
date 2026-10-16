'use strict';
// ============================================================================
//  BOUNCY TOWER — an Icy Tower tribute. Game logic, physics, HUD, menus and main loop.
//  (Save keys keep the original 'icytower.*' names so existing saves carry over.)
// ============================================================================
(() => {
  // ------------------------------------------------------------------ consts
  const W = 640, H = 480, WALL = 72, LX = WALL, RX = W - WALL, GAP = 80;
  const DT = 1000 / 60;

  // Physics (per 1/60 s tick)
  const GRAV = 0.5, MAXFALL = 14;
  const ACC = 0.26, AIR_ACC = 0.24, TURN = 0.5, AIR_TURN = 0.16, FRICTION = 0.38, MAXV = 9.5;
  const JUMP_BASE = 10.1, JUMP_K = 0.92, SPIN_V = 16.6;
  const WALL_BOUNCE = 0.8;   // fraction of horizontal speed kept when bouncing off a wall
  const FOOT = 10, HALF = 13, COYOTE = 6, JBUF = 7;
  const COMBO_MAX = 180;
  const SPEEDS = [0.7, 1.15, 1.65, 2.2, 2.75, 3.35];
  const HURRY = 30 * 60;
  const RANKS = [[200, 'NO WAY!'], [140, 'SPLENDID!'], [100, 'FANTASTIC!'], [70, 'EXTREME!'], [50, 'AMAZING!'],
                 [35, 'WOW!'], [25, 'SUPER!'], [15, 'GREAT!'], [7, 'SWEET!'], [4, 'GOOD!']];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mod = (a, n) => ((a % n) + n) % n;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ----------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const settings = Object.assign({ music: 5, sfx: 8, voice: true, touch: 'auto', name: '' }, store.get('icytower.settings', {}));
  const DEFAULT_SCORES = [
    ['HAROLD', 2400, 160, 22], ['FROSTY', 1900, 130, 18], ['DAISY', 1500, 110, 15], ['DAVE', 1200, 90, 13],
    ['YETI', 950, 75, 11], ['PENGU', 700, 60, 9], ['CHILLY', 500, 42, 8], ['SNOWY', 340, 30, 6],
    ['ICICLE', 200, 20, 0], ['ROOKIE', 100, 10, 0]
  ].map(([name, score, floor, combo]) => ({ name, score, floor, combo }));
  let scores = store.get('icytower.scores', null);
  if (!Array.isArray(scores) || !scores.length) scores = DEFAULT_SCORES.slice();
  function saveSettings() { store.set('icytower.settings', settings); SFX.setVolumes(settings.music / 10, settings.sfx / 10, settings.voice); }
  SFX.setVolumes(settings.music / 10, settings.sfx / 10, settings.voice);
  // ------------------------------------------------------------------ canvas
  let scale = 1, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    scale = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
  }
  addEventListener('resize', resize); resize();

  // ------------------------------------------------------------------ assets
  const A = {};
  function buildAssets() {
    A.wallL = GFX.buildWall(1234, -1);
    A.wallR = GFX.buildWall(98765, 1);
    A.bg = GFX.buildBG();
    A.logo = GFX.logo();
    A.ledge = GFX.platform(0, 72, 42);
  }

  // ------------------------------------------------------------------- input
  const K = {}, KP = {};
  const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'Tab']);
  let nameBuf = '';
  function gesture() {
    const first = !SFX.ready;
    SFX.init();
    if (first || !SFX.music.playing) SFX.music.start();
  }
  let usedKeys = false;
  addEventListener('keydown', e => {
    gesture();
    usedKeys = true;
    if (state === 'name') {
      const inField = document.activeElement === nameInput;
      nameKey(e);
      if (!inField || e.key === 'Enter' || e.key === 'Escape') e.preventDefault();
      return;
    }
    if (BLOCK.has(e.code)) e.preventDefault();
    if (!K[e.code]) KP[e.code] = true;
    K[e.code] = true;
  });
  addEventListener('keyup', e => { K[e.code] = false; });
  addEventListener('blur', () => { for (const k in K) K[k] = false; autoPause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { autoPause(); SFX.suspend(true); } else SFX.suspend(false);
  });
  function autoPause() { if (state === 'game' && G && !G.over && !G.paused) { G.paused = true; SFX.music.duck(true); } }

  // Pointer / touch
  const pointers = new Map();
  let click = null, mouse = null;
  let hadTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  const touch = { left: false, right: false, jump: false, jumpP: false };
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', e => {
    gesture();
    if (e.pointerType === 'touch') { hadTouch = true; usedKeys = false; }
    const p = toGame(e);
    pointers.set(e.pointerId, p);
    click = p;
    if (touchUI() && state === 'game' && G && !G.over && !G.paused && zoneOf(p) === 'jump') touch.jumpP = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const p = toGame(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (e.pointerType === 'mouse') mouse = p;
  });
  const up = e => { pointers.delete(e.pointerId); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // 'auto': show the pad on touch devices until the player uses the keyboard
  function touchUI() { return settings.touch === 'on' || (settings.touch === 'auto' && hadTouch && !usedKeys); }
  function zoneOf(p) {
    if (p.y < 70 && p.x > W - 70) return 'pause';
    if (p.x >= W / 2) return 'jump';
    if (p.y < H * 0.35) return null;
    return p.x < 112 ? 'left' : 'right';
  }
  function updateTouch() {
    touch.left = touch.right = touch.jump = false;
    if (!touchUI() || state !== 'game') return;
    for (const p of pointers.values()) {
      const z = zoneOf(p);
      if (z === 'left') touch.left = true;
      else if (z === 'right') touch.right = true;
      else if (z === 'jump') touch.jump = true;
    }
  }

  const inp = {
    left: () => K.ArrowLeft || K.KeyA || touch.left,
    right: () => K.ArrowRight || K.KeyD || touch.right,
    jump: () => K.Space || K.ArrowUp || K.KeyW || touch.jump,
    jumpP: () => KP.Space || KP.ArrowUp || KP.KeyW || touch.jumpP
  };
  const pressed = (...c) => c.some(k => KP[k]);
  const hit = (r, p = click) => p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  // ------------------------------------------------------------------- world
  // `style` shifts only the look (floor material + tint); layout/difficulty follow the real floor number.
  class World {
    constructor(seed, style = 0) {
      this.plats = new Map(); this.top = -1;
      this.seed = seed != null ? seed : Math.floor(Math.random() * 1e9);
      this.r = GFX.rng(this.seed);
      this.style = style;
    }
    gen(n) {
      const zone = Math.floor(n / 100), mat = Math.min(zone + this.style, GFX.MATS.length - 1);
      if (n % 100 === 0) return { n, x1: LX - 12, x2: RX + 12, y: -n * GAP, mat, full: true };
      const lv = Math.min(zone, 9);
      const minW = Math.max(64, 128 - lv * 8), maxW = Math.max(96, 256 - lv * 18);
      const w = Math.round((minW + this.r() * (maxW - minW)) / 8) * 8;
      const x1 = LX + Math.round(this.r() * (RX - LX - w) / 8) * 8;
      return { n, x1, x2: x1 + w, y: -n * GAP, mat };
    }
    ensure(maxN) { while (this.top < maxN) { this.top++; this.plats.set(this.top, this.gen(this.top)); } }
    prune(minN) { for (const k of this.plats.keys()) if (k < minN) this.plats.delete(k); }
  }

  // -------------------------------------------------------------- game state
  let state = 'loading';
  let G = null;
  let optSel = 0, scoreHi = -1, stateT = 0;

  // ---- floor styles: passing the zone above one unlocks it (reach 200 -> ICE, the 100-199 style)
  const STYLE_NAMES = ['STONE', 'ICE', 'WOOD', 'METAL', 'GUM', 'BONE', 'VINES', 'PIPES', 'CLOUDS', 'RAINBOW', 'GLASS'];
  let bestFloor = Math.max(0, store.get('icytower.best', 0) | 0);
  function bestFloorEver() { return bestFloor; }
  const unlockedStyles = (floor = bestFloor) => clamp(Math.floor(floor / 100), 1, STYLE_NAMES.length); // count incl. STONE
  function recordFloor(f) { if (f > bestFloor) { bestFloor = f; store.set('icytower.best', bestFloor); } }
  settings.style = clamp(settings.style | 0, 0, unlockedStyles() - 1);
  let menu = { sel: 0, t: 0, cam: -H + 40, world: new World(7, settings.style), flakes: [] };
  function restyleMenu() { menu.world = new World(7, settings.style); menu.cam = -H + 40; }

  function newGame() {
    const world = new World(undefined, settings.style);
    world.ensure(12);
    G = {
      world, cam: { y: -H + 40, py: -H + 40 },
      p: { x: W / 2, y: 0, px: W / 2, py: 0, vx: 0, vy: 0, ground: true, plat: 0, facing: 1, rot: 0, prot: 0, spin: false, spinV: 0,
           phase: 0, idleT: 0, coyote: 0, jbuf: 0, from: 0, landT: 0, blinkT: 120, edge: 0 },
      started: false, time: 0, level: 0, floor: 0, comboPts: 0,
      combo: { on: false, floors: 0, jumps: 0, timer: 0 },
      bestCombo: 0, msgs: [], parts: [], over: false, overT: 0, paused: false, tick: 0,
      prevBest: bestFloorEver(), recordShown: false, shake: 0, qualifies: false, final: 0
    };
    state = 'game';
    SFX.music.duck(false);
  }
  const score = () => G.floor * 10 + G.comboPts;

  // ------------------------------------------------------------------ physics
  function tickGame() {
    if (G.over) { tickOver(); return; }
    if (pressed('Escape', 'KeyP') || (touchUI() && click && zoneOf(click) === 'pause' && !G.paused)) {
      G.paused = !G.paused; SFX.music.duck(G.paused); SFX.fx.move();
      click = null;
    }
    if (G.paused) {
      if (pressed('KeyQ') || hit(PAUSE_BTNS.quit)) { SFX.fx.back(); toMenu(); }
      else if (hit(PAUSE_BTNS.resume)) { G.paused = false; SFX.music.duck(false); }
      return;
    }
    G.tick++;
    const p = G.p, w = G.world;
    p.px = p.x; p.py = p.y; p.prot = p.rot; G.cam.py = G.cam.y;

    // --- horizontal
    const dir = (inp.right() ? 1 : 0) - (inp.left() ? 1 : 0);
    if (dir) {
      if (p.vx * dir < 0) p.vx += dir * (p.ground ? ACC + TURN : AIR_ACC + AIR_TURN);
      else p.vx += dir * (p.ground ? ACC : AIR_ACC);
    } else if (p.ground) {
      p.vx = Math.abs(p.vx) <= FRICTION ? 0 : p.vx - Math.sign(p.vx) * FRICTION;
    }
    p.vx = clamp(p.vx, -MAXV, MAXV);
    p.x += p.vx;
    if (p.x < LX + HALF) { p.x = LX + HALF; wallHit(-1); }
    else if (p.x > RX - HALF) { p.x = RX - HALF; wallHit(1); }
    if (p.ground) { if (dir) p.facing = dir; }
    else if (Math.abs(p.vx) > 0.6) p.facing = Math.sign(p.vx);
    else if (dir) p.facing = dir;

    // --- jumping
    if (inp.jumpP()) p.jbuf = JBUF;
    if ((p.ground || p.coyote > 0) && (p.jbuf > 0 || inp.jump())) jump();
    if (p.jbuf > 0) p.jbuf--;

    // --- vertical
    if (p.ground) {
      const pl = w.plats.get(p.plat);
      if (!pl || p.x + FOOT < pl.x1 || p.x - FOOT > pl.x2) {
        p.ground = false; p.coyote = COYOTE; p.from = p.plat; p.vy = 0;
      }
    }
    if (!p.ground) {
      if (p.coyote > 0) p.coyote--;
      p.vy = Math.min(MAXFALL, p.vy + GRAV);
      const oy = p.y; p.y += p.vy;
      if (p.vy > 0) {
        const nTop = Math.floor(-oy / GAP), nBot = Math.ceil(-p.y / GAP);
        for (let n = nTop; n >= nBot; n--) {
          const pl = w.plats.get(n);
          if (pl && pl.y >= oy && pl.y <= p.y && p.x + FOOT >= pl.x1 && p.x - FOOT <= pl.x2) { land(pl); break; }
        }
      }
      if (!p.ground && p.spin) p.rot += p.spinV;
    }

    // --- animation bookkeeping
    if (p.landT > 0) p.landT--;
    if (p.ground) p.phase += Math.abs(p.vx) * 0.075 + (Math.abs(p.vx) > 0.3 ? 0.04 : 0);
    p.edge = 0;
    if (p.ground && Math.abs(p.vx) < 0.3 && !dir) {
      const pl = w.plats.get(p.plat);
      if (pl && !pl.full) {
        if (p.x < pl.x1 + 1) p.edge = -1;
        else if (p.x > pl.x2 - 1) p.edge = 1;
        if (p.edge) p.facing = p.edge;
      }
    }
    p.idleT = (p.ground && !dir && Math.abs(p.vx) < 0.3 && !p.edge) ? p.idleT + 1 : 0;
    if (--p.blinkT < -7) p.blinkT = 90 + Math.random() * 160;

    // --- combo timer
    if (G.combo.on && --G.combo.timer <= 0) endCombo();

    // --- camera / tower speed
    if (!G.started && G.floor >= 5) G.started = true;
    if (G.started) {
      G.time++;
      if (G.time % HURRY === 0 && G.level < SPEEDS.length - 1) {
        G.level++;
        G.msgs = G.msgs.filter(m => m.type !== 'hurry');
        G.msgs.push({ type: 'hurry', text: 'HURRY UP!', t: 0, dur: 130 });
        SFX.fx.hurry();
      }
      G.cam.y -= SPEEDS[G.level];
    }
    const target = p.y - 175;
    if (target < G.cam.y) G.cam.y += (target - G.cam.y) * 0.14;
    if (p.y - 75 < G.cam.y) G.cam.y = p.y - 75;

    w.ensure(Math.ceil(-(G.cam.y - 160) / GAP));
    w.prune(Math.floor(-(G.cam.y + H + 160) / GAP));

    // --- effects
    if (!p.ground && (G.combo.on || p.spin) && G.tick % 2 === 0) {
      G.parts.push({ kind: 'star', x: p.x + rand(-8, 8), y: p.y - 26 + rand(-10, 10), vx: rand(-0.6, 0.6) - p.vx * 0.1, vy: rand(-0.6, 0.6),
                     life: 32, max: 32, size: rand(3, 5.5), color: `hsl(${(G.tick * 9) % 360},100%,65%)`, rot: rand(0, 6), vr: rand(-0.2, 0.2), g: 0.02 });
    }
    tickParts();
    tickMsgs();

    // --- death
    if (p.y - 64 > G.cam.y + H) gameOver();
  }

  function wallHit(side) {
    const p = G.p;
    if (!p.ground && Math.abs(p.vx) > 1) {
      const sp = Math.abs(p.vx);
      p.vx = -p.vx * WALL_BOUNCE;
      p.facing = -side;
      if (p.spin) p.spinV = -p.spinV;
      if (sp > 3) {
        SFX.fx.wall();
        for (let i = 0; i < 8; i++) {
          G.parts.push({ kind: 'spark', x: side < 0 ? LX : RX, y: p.y - 30 + rand(-14, 14), vx: -side * rand(1, 4), vy: rand(-2.5, 2.5),
                         life: 18, max: 18, size: rand(2, 3.5), color: '#fff6b0', g: 0.1 });
        }
      }
    } else p.vx = 0;
  }

  function jump() {
    const p = G.p, sp = Math.abs(p.vx);
    const v0 = JUMP_BASE + sp * JUMP_K;
    p.vy = -v0; p.ground = false; p.coyote = 0; p.jbuf = 0;
    p.from = p.plat;
    p.spin = v0 >= SPIN_V;
    p.rot = 0;
    p.spinV = (p.vx >= 0 ? 1 : -1) * 0.21;
    p.landT = 0;
    SFX.fx.jump(clamp(sp / MAXV, 0, 1));
    for (let i = 0; i < 4; i++) {
      G.parts.push({ kind: 'dust', x: p.x + rand(-8, 8), y: p.y - 2, vx: rand(-1, 1) - p.vx * 0.15, vy: rand(-1, -0.2),
                     life: 20, max: 20, size: rand(3, 5), color: 'rgba(230,236,255,', g: -0.01 });
    }
  }

  function land(pl) {
    const p = G.p, v = p.vy;
    p.y = pl.y; p.vy = 0; p.ground = true; p.plat = pl.n; p.spin = false; p.rot = 0; p.prot = 0; p.landT = 7;
    const gained = pl.n - p.from;
    if (pl.n > G.floor) {
      const oldHundreds = Math.floor(G.floor / 100);
      G.floor = pl.n;
      const before = unlockedStyles();
      recordFloor(G.floor);   // saved immediately, so quitting mid-run keeps the unlock
      const after = unlockedStyles();
      const record = !G.recordShown && G.prevBest >= 10 && G.floor > G.prevBest;
      if (record) G.recordShown = true;
      if (Math.floor(G.floor / 100) > oldHundreds) {
        // one banner per landing: an unlock beats "new record", which beats nothing
        const sub = after > before
          ? (after - before > 1 ? `${after - before} FLOOR STYLES UNLOCKED!` : `${STYLE_NAMES[after - 1]} FLOOR STYLE UNLOCKED!`)
          : (record ? 'NEW RECORD!' : '');
        info(`FLOOR ${Math.floor(G.floor / 100) * 100}!`, sub);
        if (sub) SFX.fx.record(); else SFX.fx.milestone();
      } else if (record) { info('NEW RECORD!'); SFX.fx.record(); }
    }
    if (gained >= 2) {
      const c = G.combo;
      if (!c.on) { c.on = true; c.floors = 0; c.jumps = 0; }
      c.floors += gained; c.jumps++; c.timer = COMBO_MAX;
      SFX.fx.comboStep(c.jumps);
    } else if (G.combo.on) endCombo();
    SFX.fx.land(v);
    if (v > 5) {
      const n = Math.min(10, Math.floor(v / 2));
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        G.parts.push({ kind: 'dust', x: p.x + s * rand(4, 10), y: p.y - 2, vx: s * rand(0.6, 2.2), vy: rand(-0.9, -0.1),
                       life: 24, max: 24, size: rand(3, 6), color: 'rgba(230,236,255,', g: 0.0 });
      }
    }
  }

  function endCombo() {
    const c = G.combo;
    if (c.on && c.jumps >= 2) {
      G.comboPts += c.floors * c.floors;
      G.bestCombo = Math.max(G.bestCombo, c.floors);
      const idx = RANKS.findIndex(([th]) => c.floors >= th);
      const word = RANKS[idx][1], rank = RANKS.length - 1 - idx;
      G.msgs = G.msgs.filter(m => m.type !== 'combo');
      G.msgs.push({ type: 'combo', text: word, sub: `${c.floors} FLOORS`, rank, t: 0, dur: 160 });
      SFX.fx.comboEnd(rank);
      setTimeout(() => SFX.fx.say(word.replace(/!/g, '').toLowerCase(), 0.1 + rank * 0.01, 0.82), 260);
      for (let i = 0; i < 26 + rank * 6; i++) {
        const a = rand(0, Math.PI * 2), s = rand(2, 7 + rank * 0.5);
        G.parts.push({ kind: 'star', screen: true, x: W / 2, y: 190, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 50, max: 50,
                       size: rand(3, 7), color: `hsl(${rand(0, 360)},100%,65%)`, rot: rand(0, 6), vr: rand(-0.3, 0.3), g: 0.12 });
      }
    } else if (c.on) SFX.fx.comboBreak();
    c.on = false; c.floors = 0; c.jumps = 0; c.timer = 0;
  }

  function info(text, sub = '') {
    G.msgs = G.msgs.filter(m => m.type !== 'info');
    G.msgs.push({ type: 'info', text, sub, t: 0, dur: sub ? 200 : 120 });
  }

  function tickParts() {
    const ps = G ? G.parts : [];
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.x += q.vx; q.y += q.vy; q.vy += q.g || 0; q.vx *= 0.98;
      if (q.rot !== undefined) q.rot += q.vr || 0;
      if (--q.life <= 0) ps.splice(i, 1);
    }
  }
  function tickMsgs() {
    for (let i = G.msgs.length - 1; i >= 0; i--) if (++G.msgs[i].t >= G.msgs[i].dur) G.msgs.splice(i, 1);
  }

  function gameOver() {
    if (G.combo.on) endCombo();
    G.over = true; G.overT = 0;
    G.final = score();
    G.qualifies = scores.length < 10 || G.final > scores[scores.length - 1].score;
    G.p.vy = Math.min(G.p.vy, 2);
    SFX.fx.gameOver();
    SFX.music.duck(true);
  }

  const OVER_BTNS = { again: { x: 150, y: 384, w: 160, h: 40 }, menu: { x: 330, y: 384, w: 160, h: 40 } };
  const PAUSE_BTNS = { resume: { x: 230, y: 250, w: 180, h: 44 }, quit: { x: 230, y: 304, w: 180, h: 44 } };

  function tickOver() {
    G.overT++; G.tick++;
    const p = G.p;
    p.px = p.x; p.py = p.y; G.cam.py = G.cam.y; p.prot = p.rot;
    p.vy = Math.min(MAXFALL, p.vy + GRAV * 0.6); p.y += p.vy;
    tickParts(); tickMsgs();
    if (G.overT < 70) return;
    const again = pressed('Space', 'Enter') || hit(OVER_BTNS.again);
    const toM = pressed('Escape') || hit(OVER_BTNS.menu);
    if (again || toM) {
      SFX.fx.select();
      if (G.qualifies) { startNameEntry(toM ? 'menu' : 'again'); }
      else if (again) newGame();
      else toMenu();
    }
  }

  // --------------------------------------------------------------- name entry
  // A hidden <input> receives the text so IME / on-screen keyboards work too.
  let nameNext = 'menu';
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.maxLength = 12; nameInput.autocomplete = 'off'; nameInput.spellcheck = false;
  nameInput.setAttribute('aria-label', 'Your name');
  nameInput.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0;width:10px;height:10px;';
  document.body.appendChild(nameInput);
  const cleanName = s => s.toUpperCase().replace(/[^A-Z0-9 _\-.!?]/g, '').slice(0, 12);
  nameInput.addEventListener('input', () => {
    const v = cleanName(nameInput.value);
    if (v !== nameBuf) SFX.fx.type();
    nameBuf = v; nameInput.value = v;
  });
  function startNameEntry(next) {
    nameNext = next;
    nameBuf = settings.name || '';
    state = 'name';
    if (touchUI() && hadTouch) {
      setTimeout(() => {
        const v = window.prompt('NEW HIGH SCORE! Enter your name:', nameBuf);
        nameBuf = cleanName(v || nameBuf || 'HAROLD');
        submitName();
      }, 50);
    } else {
      nameInput.value = nameBuf;
      nameInput.focus();
    }
  }
  function nameKey(e) {
    if (e.key === 'Enter') submitName();
    else if (e.key === 'Escape') { nameBuf = ''; submitName(); }
    else if (document.activeElement !== nameInput) {
      nameInput.focus();
      if (e.key === 'Backspace') { nameBuf = nameBuf.slice(0, -1); nameInput.value = nameBuf; SFX.fx.type(); }
      else if (e.key.length === 1 && nameBuf.length < 12) { nameBuf = cleanName(nameBuf + e.key); nameInput.value = nameBuf; SFX.fx.type(); }
    }
  }
  function submitName() {
    if (state !== 'name') return;
    nameInput.blur();
    const name = nameBuf.trim() || 'HAROLD';
    settings.name = name; saveSettings();
    const entry = { name, score: G.final, floor: G.floor, combo: G.bestCombo };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    scoreHi = scores.indexOf(entry);
    store.set('icytower.scores', scores);
    SFX.fx.record();
    state = 'scores'; stateT = 0;
    scoresNext = nameNext;
  }
  let scoresNext = 'menu';

  // -------------------------------------------------------------------- menus
  const MAIN = ['START GAME', 'HIGH SCORES', 'OPTIONS', 'HOW TO PLAY'];
  const itemRect = (i, y0, gap) => ({ x: W / 2 - 140, y: y0 + i * gap - 34, w: 280, h: 42 });
  function toMenu() { state = 'menu'; stateT = 0; SFX.music.duck(false); G = null; }

  function tickMenu() {
    menu.t++; stateT++;
    menu.cam -= 0.45;
    menu.world.ensure(Math.ceil(-(menu.cam - 100) / GAP));
    menu.world.prune(Math.floor(-(menu.cam + H + 100) / GAP));
    if (menu.flakes.length < 70) menu.flakes.push({ x: rand(0, W), y: -10, vy: rand(0.4, 1.3), ph: rand(0, 6), s: rand(1, 2.8) });
    menu.flakes.forEach(f => { f.y += f.vy; f.x += Math.sin(f.ph += 0.02) * 0.4; });
    menu.flakes = menu.flakes.filter(f => f.y < H + 10);

    const n = MAIN.length;
    if (pressed('ArrowUp', 'KeyW')) { menu.sel = (menu.sel + n - 1) % n; SFX.fx.move(); }
    if (pressed('ArrowDown', 'KeyS', 'Tab')) { menu.sel = (menu.sel + 1) % n; SFX.fx.move(); }
    if (mouse) { for (let i = 0; i < n; i++) if (hit(itemRect(i, 292, 46), mouse) && menu.sel !== i) { menu.sel = i; SFX.fx.move(); } mouse = null; }
    let go = pressed('Enter', 'Space');
    if (click) for (let i = 0; i < n; i++) if (hit(itemRect(i, 292, 46))) { menu.sel = i; go = true; }
    if (go && stateT > 5) {
      SFX.fx.select();
      switch (menu.sel) {
        case 0: newGame(); break;
        case 1: state = 'scores'; scoreHi = -1; scoresNext = 'menu'; stateT = 0; break;
        case 2: state = 'options'; optSel = 0; stateT = 0; break;
        case 3: state = 'help'; stateT = 0; break;
      }
    }
  }

  const OPTS = [
    { label: 'FLOOR STYLE', style: true, lr: true, val: () => STYLE_NAMES[settings.style],
      change: d => { settings.style = mod(settings.style + (d || 1), unlockedStyles()); restyleMenu(); } },
    { label: 'MUSIC', val: () => settings.music, bar: true, change: d => { settings.music = clamp(settings.music + d, 0, 10); } },
    { label: 'SOUND', val: () => settings.sfx, bar: true, change: d => { settings.sfx = clamp(settings.sfx + d, 0, 10); SFX.fx.jump(0.3); } },
    { label: 'VOICE', val: () => settings.voice ? 'ON' : 'OFF', change: () => { settings.voice = !settings.voice; if (settings.voice) setTimeout(() => SFX.fx.say('sweet'), 50); } },    { label: 'TOUCH PAD', val: () => settings.touch.toUpperCase(), change: d => { const o = ['auto', 'on', 'off']; settings.touch = o[mod(o.indexOf(settings.touch) + (d || 1), 3)]; } },
    { label: 'FULLSCREEN', val: () => document.fullscreenElement ? 'ON' : 'OFF', change: () => toggleFS() },
    { label: 'BACK' }
  ];
  function toggleFS() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { /* not allowed */ }
  }
  const OPT_Y = 140, OPT_GAP = 44;
  function tickOptions() {
    menuBgTick();
    const n = OPTS.length;
    if (pressed('ArrowUp', 'KeyW')) { optSel = (optSel + n - 1) % n; SFX.fx.move(); }
    if (pressed('ArrowDown', 'KeyS', 'Tab')) { optSel = (optSel + 1) % n; SFX.fx.move(); }
    if (mouse) { for (let i = 0; i < n; i++) if (hit(itemRect(i, OPT_Y, OPT_GAP), mouse) && optSel !== i) { optSel = i; SFX.fx.move(); } mouse = null; }
    const o = OPTS[optSel];
    let d = 0;
    if (pressed('ArrowLeft', 'KeyA')) d = -1;
    if (pressed('ArrowRight', 'KeyD')) d = 1;
    let go = pressed('Enter', 'Space');
    if (click) for (let i = 0; i < n; i++) {
      const r = itemRect(i, OPT_Y, OPT_GAP);
      if (hit({ x: r.x - 60, y: r.y, w: r.w + 120, h: r.h })) { optSel = i; go = true; if (OPTS[i].bar || OPTS[i].lr) { d = click.x < W / 2 + 40 ? -1 : 1; go = false; } }
    }
    if (pressed('Escape') || (go && !OPTS[optSel].change)) { SFX.fx.back(); state = 'menu'; stateT = 0; return; }
    const cur = OPTS[optSel];
    if ((d || go) && cur.change) { cur.change(d || 1); saveSettings(); SFX.fx.move(); }
  }

  function tickScores() {
    menuBgTick(); stateT++;
    if (stateT > 10 && (pressed('Enter', 'Space', 'Escape') || click)) {
      SFX.fx.back();
      if (scoresNext === 'again') newGame(); else { state = 'menu'; stateT = 0; }
    }
  }
  function tickHelp() {
    menuBgTick(); stateT++;
    if (stateT > 10 && (pressed('Enter', 'Space', 'Escape') || click)) { SFX.fx.back(); state = 'menu'; stateT = 0; }
  }
  function menuBgTick() {
    menu.t++;
    menu.cam -= 0.45;
    menu.world.ensure(Math.ceil(-(menu.cam - 100) / GAP));
    menu.world.prune(Math.floor(-(menu.cam + H + 100) / GAP));
  }

  // ===================================================================== RENDER
  function drawTower(camY, world, zoneTint = true) {
    // background bricks (parallax)
    const bo = mod(-camY * 0.5, 240);
    for (let y = bo - 240; y < H; y += 240) for (let x = 0; x < W; x += 240) ctx.drawImage(A.bg, x, y, 240, 240);
    if (zoneTint) {
      const f = -(camY + H / 2) / GAP, zone = clamp(Math.floor(f / 100), 0, GFX.TINTS.length - 1);
      const into = f - zone * 100, k = clamp((into - 90) / 10, 0, 1);
      const tint = (zi, a) => {
        if (zi <= 0 || a <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = a;
        ctx.fillStyle = GFX.TINTS[Math.min(zi, GFX.TINTS.length - 1)]; ctx.fillRect(0, 0, W, H); ctx.restore();
      };
      const st = world.style || 0;
      tint(zone + st, 0.55 * (1 - k)); tint(zone + 1 + st, 0.55 * k);
    }
    // soft light gradient
    ctx.fillStyle = GFX.lin(ctx, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.35)'], [0.5, 'rgba(255,255,255,0.03)'], [1, 'rgba(0,0,0,0.35)']]);
    ctx.fillRect(LX, 0, RX - LX, H);

    // platforms
    for (const pl of world.plats.values()) {
      const sy = pl.y - camY;
      if (sy < -60 || sy > H + 50) continue;
      if (pl.n === 0) {
        ctx.fillStyle = GFX.lin(ctx, 0, sy, 0, sy + 120, [[0, '#4a5068'], [1, '#1c1f2c']]);
        ctx.fillRect(0, sy + 8, W, H);
      }
      if (!pl.img) pl.img = GFX.platform(pl.mat, pl.x2 - pl.x1, pl.n * 7919 + world.seed);
      ctx.drawImage(pl.img.c, pl.x1 + pl.img.ox, sy + pl.img.oy, pl.img.w, pl.img.h);
      if (pl.n % 10 === 0 && pl.n > 0) {
        const cx = clamp((pl.x1 + pl.x2) / 2, LX + 34, RX - 34);
        GFX.sign(ctx, cx, sy + 22, pl.n);
      }
    }
  }
  function drawWalls(camY) {
    const wo = mod(-camY, 480);
    for (let y = wo - 480; y < H; y += 480) {
      ctx.drawImage(A.wallL, 0, y, WALL, 480);
      ctx.drawImage(A.wallR, RX, y, WALL, 480);
    }
  }

  function heroKind(p) {
    if (G && G.over) return 'dead';
    if (!p.ground) return p.spin ? 'spin' : (p.vy < 2 ? 'jump' : 'fall');
    if (p.landT > 0 && Math.abs(p.vx) < 4) return 'land';
    if (Math.abs(p.vx) > 0.3) return 'run';
    if (p.edge) return 'edge';
    return 'idle';
  }

  function renderGame(a) {
    const camY = lerp(G.cam.py, G.cam.y, a);
    const p = G.p;
    ctx.save();
    drawTower(camY, G.world);
    // personal best marker
    if (G.prevBest >= 10) {
      const by = -G.prevBest * GAP - camY;
      if (by > -40 && by < H + 40) {
        ctx.strokeStyle = 'rgba(255,230,80,0.5)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(LX, by - 30); ctx.lineTo(RX, by - 30); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // particles (world)
    drawParts(camY, false);
    // hero
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a) - camY;
    const kind = heroKind(p);
    const scared = G.started && p.ground && (p.y - G.cam.y) > H - 70;
    const P = GFX.pose(kind, G.tick, { phase: p.phase, speed: Math.abs(p.vx), idleT: p.idleT, blink: p.blinkT < 0, scared });
    const rot = p.spin ? lerp(p.prot, p.rot, a) : 0;
    GFX.hero(ctx, x, y, p.facing, rot, P);
    drawWalls(camY);
    if (G.prevBest >= 10) {
      const by = -G.prevBest * GAP - camY - 30;
      if (by > -40 && by < H + 40) {
        ctx.fillStyle = '#140c22'; GFX.rr(ctx, RX - 4, by - 12, 64, 24, 6); ctx.fill();
        ctx.fillStyle = '#ffd84a'; GFX.rr(ctx, RX - 2, by - 10, 60, 20, 5); ctx.fill();
        ctx.fillStyle = '#140c22'; ctx.font = `14px ${GFX.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('BEST', RX + 28, by + 1);
      }
    }
    drawHUD();
    drawMsgs();
    drawParts(0, true);
    if (touchUI() && !G.over) drawTouchPad();
    if (G.paused) drawPause();
    if (G.over) drawOver();
    ctx.restore();
  }

  function drawParts(camY, screen) {
    for (const q of G.parts) {
      if (!!q.screen !== screen) continue;
      const t = q.life / q.max, x = q.x, y = q.y - camY;
      if (q.kind === 'dust') {
        ctx.fillStyle = q.color + (0.55 * t).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, q.size * (1.6 - t * 0.6), 0, 7); ctx.fill();
      } else if (q.kind === 'star') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot); ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = q.color; GFX.star5(ctx, 0, 0, q.size, q.size * 0.45); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0, 0, q.size * 0.25, 0, 7); ctx.fill();
        ctx.restore();
      } else if (q.kind === 'spark') {
        ctx.globalAlpha = t; ctx.fillStyle = q.color;
        ctx.fillRect(x - q.size / 2, y - q.size / 2, q.size, q.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawHUD() {
    // ---- clock
    const cx = 40, cy = 46;
    const hurry = G.msgs.find(m => m.type === 'hurry');
    ctx.save(); ctx.translate(cx, cy);
    if (hurry && hurry.t < 90) ctx.rotate(Math.sin(hurry.t * 1.3) * 0.12);
    // bells
    [-1, 1].forEach(s => {
      ctx.save(); ctx.rotate(s * 0.7);
      ctx.fillStyle = '#140c22'; ctx.beginPath(); ctx.arc(0, -33, 10, Math.PI, 0); ctx.fill();
      ctx.fillStyle = GFX.lin(ctx, 0, -42, 0, -32, [[0, '#fff2a8'], [1, '#c8901e']]); ctx.beginPath(); ctx.arc(0, -33, 8, Math.PI, 0); ctx.fill();
      ctx.restore();
    });
    ctx.fillStyle = '#140c22'; ctx.beginPath(); ctx.arc(0, 0, 31, 0, 7); ctx.fill();
    ctx.fillStyle = GFX.lin(ctx, -20, -30, 20, 30, [[0, '#ffe38a'], [0.5, '#e0a43a'], [1, '#8a5a12']]); ctx.beginPath(); ctx.arc(0, 0, 29, 0, 7); ctx.fill();
    ctx.fillStyle = '#140c22'; ctx.beginPath(); ctx.arc(0, 0, 23.5, 0, 7); ctx.fill();
    ctx.fillStyle = GFX.lin(ctx, 0, -22, 0, 22, [[0, '#ffffff'], [1, '#d8e2f0']]); ctx.beginPath(); ctx.arc(0, 0, 22.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#140c22';
    for (let i = 0; i < 12; i++) {
      const an = i * Math.PI / 6, r1 = i % 3 ? 18.5 : 16;
      ctx.save(); ctx.rotate(an); ctx.fillRect(-1, -21, 2, 21 - r1); ctx.restore();
    }
    const frac = G.started ? (G.time % HURRY) / HURRY : 0;
    ctx.save(); ctx.rotate(frac * Math.PI * 2);
    ctx.fillStyle = '#d0201a'; ctx.strokeStyle = '#140c22'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-2.2, 3); ctx.lineTo(0, -19); ctx.lineTo(2.2, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#140c22'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-8, -10, 8, 4, -0.6, 0, 7); ctx.fill();
    ctx.restore();

    // ---- combo meter
    const bx = 27, by = 88, bw = 26, bh = 150;
    ctx.fillStyle = '#140c22'; GFX.rr(ctx, bx - 3, by - 3, bw + 6, bh + 6, 8); ctx.fill();
    ctx.fillStyle = GFX.lin(ctx, bx, 0, bx + bw, 0, [[0, '#1d2236'], [0.5, '#2c3350'], [1, '#1d2236']]); GFX.rr(ctx, bx, by, bw, bh, 6); ctx.fill();
    const c = G.combo, k = c.on ? c.timer / COMBO_MAX : 0;
    if (k > 0) {
      const fh = bh * k;
      ctx.save(); GFX.rr(ctx, bx, by, bw, bh, 6); ctx.clip();
      ctx.fillStyle = GFX.lin(ctx, 0, by, 0, by + bh, [[0, '#fffa9a'], [0.35, '#ffd23a'], [0.7, '#ff8a1e'], [1, '#ff3b2a']]);
      ctx.fillRect(bx, by + bh - fh, bw, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx + 4, by + bh - fh, 5, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(bx, by + bh - fh, bw, 2);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 6; i++) ctx.fillRect(bx, by + i * bh / 6, bw, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; GFX.rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 6); ctx.stroke();

    // ---- combo star
    if (c.on) {
      const pulse = 1 + Math.sin(G.tick * 0.3) * 0.06;
      ctx.save(); ctx.translate(40, 274); ctx.scale(pulse, pulse); ctx.rotate(Math.sin(G.tick * 0.05) * 0.15);
      ctx.fillStyle = '#140c22'; GFX.star5(ctx, 0, 0, 33, 18); ctx.fill();
      ctx.fillStyle = GFX.lin(ctx, 0, -30, 0, 30, [[0, '#fff7a0'], [0.5, '#ffd23a'], [1, '#ff8a1e']]); GFX.star5(ctx, 0, 0, 29, 15.5); ctx.fill();
      ctx.restore();
      GFX.text(ctx, String(c.floors), 40, 282, c.floors > 99 ? 17 : 22, '#ffffff', { align: 'center', stroke: 4 });
      GFX.text(ctx, 'COMBO', 40, 322, 13, '#ffe14a', { align: 'center', stroke: 3 });
    }

    // ---- score
    const s = 'SCORE: ' + score();
    if (touchUI()) GFX.text(ctx, s, W - 80, 30, 22, '#ffffff', { align: 'right' });
    else GFX.text(ctx, s, 12, H - 12, 26, '#ffffff');
  }

  function easeOutBack(t) { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

  function drawMsgs() {
    for (const m of G.msgs) {
      const t = m.t, out = Math.max(0, (t - (m.dur - 18)) / 18);
      ctx.save();
      if (m.type === 'hurry') {
        const s = t < 16 ? easeOutBack(t / 16) : 1;
        ctx.translate(W / 2, 205 - out * 240); ctx.scale(s, s); ctx.rotate(Math.sin(t * 0.25) * 0.06);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        textGrad(m.text, 0, 0, 60, [[0, '#fff7b0'], [0.5, '#ffcc22'], [1, '#ff6a1a']]);
      } else if (m.type === 'combo') {
        const s = t < 18 ? easeOutBack(t / 18) * 1.0 : 1 + Math.sin((t - 18) * 0.12) * 0.03;
        ctx.globalAlpha = 1 - out;
        ctx.translate(W / 2, 190 - out * 30); ctx.rotate((1 - Math.min(1, t / 18)) * -0.5 + Math.sin(t * 0.08) * 0.04); ctx.scale(s, s);
        const size = 54 + m.rank * 2.5;
        const hue = (t * 6) % 360;
        const stops = m.rank >= 5
          ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((o, i) => [o, `hsl(${(hue + i * 60) % 360},100%,62%)`])
          : [[0, '#ffffff'], [0.45, ['#9ff3ff', '#b6ff8a', '#ffe66a', '#ffb04a', '#ff7ad0'][m.rank]], [1, ['#2a8de0', '#2fb04a', '#e0a010', '#e05a10', '#c02a90'][m.rank]]];
        textGrad(m.text, 0, 0, size, stops, m.rank >= 5);
        GFX.text(ctx, m.sub, 0, 40, 26, '#ffffff', { align: 'center' });
      } else if (m.type === 'info') {
        const s = t < 14 ? easeOutBack(t / 14) : 1;
        ctx.globalAlpha = 1 - out;
        ctx.translate(W / 2, 120); ctx.scale(s, s);
        textGrad(m.text, 0, 0, 40, [[0, '#ffffff'], [0.5, '#a8ecff'], [1, '#3a9cf0']]);
        if (m.sub) GFX.text(ctx, m.sub, 0, 40, 20, Math.floor(t / 8) % 2 ? '#ffe14a' : '#ffffff', { align: 'center', stroke: 4 });
      }
      ctx.restore();
    }
  }

  function textGrad(str, x, y, size, stops, horizontal) {
    ctx.font = `${size}px ${GFX.FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(str, x + 4, y + 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = size * 0.2; ctx.strokeText(str, x + 4, y + 5);
    ctx.strokeStyle = '#140c22'; ctx.lineWidth = size * 0.2; ctx.strokeText(str, x, y);
    const w = ctx.measureText(str).width;
    ctx.fillStyle = horizontal ? GFX.lin(ctx, x - w / 2, 0, x + w / 2, 0, stops) : GFX.lin(ctx, 0, y - size * 0.45, 0, y + size * 0.4, stops);
    ctx.fillText(str, x, y);
    ctx.save(); ctx.beginPath(); ctx.rect(x - w, y - size * 0.6, w * 2, size * 0.3); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(str, x, y); ctx.restore();
  }

  function drawTouchPad() {
    const held = { left: touch.left, right: touch.right, jump: touch.jump };
    const btn = (x, y, r, dirn, on) => {
      ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
      if (dirn === 'up') { ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y + 8); ctx.lineTo(x - 14, y + 8); }
      else { const s = dirn === 'left' ? -1 : 1; ctx.moveTo(x + s * 14, y); ctx.lineTo(x - s * 9, y - 13); ctx.lineTo(x - s * 9, y + 13); }
      ctx.closePath(); ctx.fill();
    };
    btn(56, H - 60, 38, 'left', held.left);
    btn(150, H - 60, 38, 'right', held.right);
    btn(W - 80, H - 66, 48, 'up', held.jump);
    // pause button
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(W - 34, 34, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(W - 41, 25, 5, 18); ctx.fillRect(W - 32, 25, 5, 18);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = '#140c22'; GFX.rr(ctx, x - 3, y - 3, w + 6, h + 6, 16); ctx.fill();
    ctx.fillStyle = GFX.lin(ctx, 0, y, 0, y + h, [[0, 'rgba(40,70,140,0.95)'], [1, 'rgba(18,28,70,0.95)']]); GFX.rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,255,0.6)'; ctx.lineWidth = 2; GFX.rr(ctx, x + 4, y + 4, w - 8, h - 8, 11); ctx.stroke();
  }
  function button(r, label, sel) {
    ctx.fillStyle = '#140c22'; GFX.rr(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 12); ctx.fill();
    ctx.fillStyle = sel ? GFX.lin(ctx, 0, r.y, 0, r.y + r.h, [[0, '#fff3a0'], [1, '#f0a020']]) : GFX.lin(ctx, 0, r.y, 0, r.y + r.h, [[0, '#9ad8ff'], [1, '#2a78d0']]);
    GFX.rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    GFX.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 8, 20, '#ffffff', { align: 'center', stroke: 4, shadow: false });
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(5,8,20,0.6)'; ctx.fillRect(0, 0, W, H);
    textGrad('PAUSED', W / 2, 180, 64, [[0, '#ffffff'], [0.5, '#a8ecff'], [1, '#3a9cf0']]);
    button(PAUSE_BTNS.resume, 'RESUME', true);
    button(PAUSE_BTNS.quit, 'QUIT', false);
    GFX.text(ctx, 'ESC / P: RESUME    Q: QUIT', W / 2, 390, 15, '#cfe6ff', { align: 'center', stroke: 3 });
  }

  function drawOver() {
    const t = G.overT;
    ctx.fillStyle = `rgba(5,8,20,${Math.min(0.6, t / 60)})`; ctx.fillRect(0, 0, W, H);
    const s = t < 20 ? easeOutBack(t / 20) : 1;
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(s, s); ctx.rotate(Math.sin(t * 0.06) * 0.03);
    textGrad('GAME OVER', 0, 0, 68, [[0, '#ffffff'], [0.45, '#ffb0a0'], [1, '#e02a2a']]);
    ctx.restore();
    if (t < 30) return;
    const k = Math.min(1, (t - 30) / 15);
    ctx.save(); ctx.globalAlpha = k;
    panel(170, 168, 300, 196);
    const rows = [['FLOOR', G.floor], ['BEST COMBO', G.bestCombo], ['SCORE', G.final]];
    rows.forEach(([l, v], i) => {
      GFX.text(ctx, l, 196, 212 + i * 40, 24, '#a8ecff', { stroke: 4 });
      GFX.text(ctx, String(v), 444, 212 + i * 40, 26, '#ffffff', { align: 'right', stroke: 4 });
    });
    if (G.qualifies && Math.floor(t / 20) % 2 === 0) GFX.text(ctx, 'NEW HIGH SCORE!', W / 2, 344, 24, '#ffe14a', { align: 'center' });
    if (t >= 70) {
      button(OVER_BTNS.again, G.qualifies ? 'CONTINUE' : 'PLAY AGAIN', true);
      button(OVER_BTNS.menu, 'MENU', false);
      if (!touchUI()) GFX.text(ctx, 'SPACE: ' + (G.qualifies ? 'CONTINUE' : 'PLAY AGAIN') + '    ESC: MENU', W / 2, 456, 14, '#cfe6ff', { align: 'center', stroke: 3 });
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- menu draw
  function drawMenuBG(dim = 0.45) {
    drawTower(menu.cam, menu.world);
    drawWalls(menu.cam);
    ctx.fillStyle = `rgba(6,10,28,${dim})`; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const f of menu.flakes) { ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function renderMenu() {
    drawMenuBG(0.4);
    // logo
    const lb = Math.sin(menu.t * 0.03) * 3;
    ctx.drawImage(A.logo.c, (W - A.logo.w) / 2, 18 + lb, A.logo.w, A.logo.h);
    // twinkles on logo
    for (let i = 0; i < 4; i++) {
      const ph = (menu.t * 0.02 + i * 0.25) % 1, r = GFX.rng(Math.floor(menu.t * 0.02 + i * 0.25) * 13 + i);
      const sx = 130 + r() * 380, sy = 40 + r() * 140 + lb, s = Math.sin(ph * Math.PI) * 5;
      ctx.fillStyle = '#fff'; GFX.star(ctx, sx, sy, s, 0.3);
    }
    // items
    MAIN.forEach((label, i) => {
      const sel = i === menu.sel, y = 292 + i * 46;
      const sc = sel ? 1 + Math.sin(menu.t * 0.15) * 0.04 : 1;
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(sc, sc);
      GFX.text(ctx, label, 0, 0, sel ? 36 : 30, sel ? '#ffe14a' : '#ffffff', { align: 'center' });
      if (sel) {
        ctx.font = `36px ${GFX.FONT}`; const tw = ctx.measureText(label).width;
        [-1, 1].forEach(s => {
          ctx.save(); ctx.translate(s * (tw / 2 + 24), -13); ctx.rotate(menu.t * 0.08 * s);
          ctx.fillStyle = '#140c22'; GFX.star5(ctx, 0, 0, 12, 6); ctx.fill();
          ctx.fillStyle = '#ffe14a'; GFX.star5(ctx, 0, 0, 9, 4.2); ctx.fill();
          ctx.restore();
        });
      }
      ctx.restore();
    });
    // hero on his ledge
    const hx = 500, hy = 446;
    ctx.drawImage(A.ledge.c, hx - 36 + A.ledge.ox, hy + A.ledge.oy, A.ledge.w, A.ledge.h);
    const P = GFX.pose('idle', menu.t, { idleT: menu.t + 140, blink: (menu.t % 200) < 7 });
    GFX.hero(ctx, hx, hy, -1, 0, P, 1.25);
    GFX.text(ctx, 'INSPIRED BY ICY TOWER BY FREE LUNCH DESIGN', W / 2, H - 8, 11, 'rgba(200,220,255,0.75)', { align: 'center', stroke: 2, shadow: false });
    if (!SFX.ready) {
      const a = 0.6 + Math.sin(menu.t * 0.1) * 0.4;
      ctx.globalAlpha = a;
      GFX.text(ctx, hadTouch ? 'TAP TO ENABLE SOUND' : 'PRESS ANY KEY FOR SOUND', W / 2, 240, 16, '#a8ecff', { align: 'center', stroke: 3 });
      ctx.globalAlpha = 1;
    }
  }

  function renderOptions() {
    drawMenuBG(0.6);
    textGrad('OPTIONS', W / 2, 70, 54, [[0, '#ffffff'], [0.5, '#a8ecff'], [1, '#3a9cf0']]);
    OPTS.forEach((o, i) => {
      const sel = i === optSel, y = OPT_Y + i * OPT_GAP;
      const col = sel ? '#ffe14a' : '#ffffff';
      if (!o.change) { GFX.text(ctx, o.label, W / 2, y, sel ? 32 : 28, col, { align: 'center' }); return; }
      GFX.text(ctx, o.label, 120, y, 26, col);
      if (o.style) {
        A.stylePrev = A.stylePrev || [];
        const pv = A.stylePrev[settings.style] || (A.stylePrev[settings.style] = GFX.platform(settings.style, 64, 99));
        ctx.drawImage(pv.c, 322 + pv.ox, y - 14 + pv.oy, pv.w, pv.h);
        GFX.text(ctx, o.val(), 520, y, 26, col, { align: 'right' });
      } else if (o.bar) {
        const v = o.val();
        for (let k = 0; k < 10; k++) {
          const x = 330 + k * 18, h = 8 + k * 2;
          ctx.fillStyle = '#140c22'; GFX.rr(ctx, x - 1.5, y - h - 1.5, 15, h + 3, 3); ctx.fill();
          ctx.fillStyle = k < v ? (sel ? '#ffe14a' : '#7fd6ff') : '#2c3350'; GFX.rr(ctx, x, y - h, 12, h, 2); ctx.fill();
        }
      } else GFX.text(ctx, o.val(), 520, y, 26, col, { align: 'right' });
      if (sel) {
        GFX.text(ctx, '<', 302, y, 24, '#ffe14a', { align: 'center' });
        GFX.text(ctx, '>', 540, y, 24, '#ffe14a', { align: 'center' });
      }
    });
    if (OPTS[optSel].style) {
      const n = unlockedStyles();
      const hint = n < STYLE_NAMES.length
        ? `${n}/${STYLE_NAMES.length} UNLOCKED  -  REACH FLOOR ${(n + 1) * 100} TO UNLOCK ${STYLE_NAMES[n]}`
        : `ALL ${STYLE_NAMES.length} FLOOR STYLES UNLOCKED!`;
      GFX.text(ctx, hint, W / 2, H - 44, 14, '#ffe14a', { align: 'center', stroke: 3 });
    }
    GFX.text(ctx, 'UP/DOWN SELECT   LEFT/RIGHT CHANGE   ESC BACK', W / 2, H - 18, 14, '#cfe6ff', { align: 'center', stroke: 3 });
  }

  function renderScores() {
    drawMenuBG(0.62);
    textGrad('HIGH SCORES', W / 2, 56, 50, [[0, '#ffffff'], [0.5, '#ffe68a'], [1, '#f0a020']]);
    const y0 = 112;
    GFX.text(ctx, 'NAME', 140, y0, 15, '#a8ecff', { stroke: 3 });
    GFX.text(ctx, 'FLOOR', 380, y0, 15, '#a8ecff', { align: 'right', stroke: 3 });
    GFX.text(ctx, 'COMBO', 455, y0, 15, '#a8ecff', { align: 'right', stroke: 3 });
    GFX.text(ctx, 'SCORE', 545, y0, 15, '#a8ecff', { align: 'right', stroke: 3 });
    scores.forEach((s, i) => {
      const y = y0 + 32 + i * 30;
      const hl = i === scoreHi;
      if (hl && Math.floor(menu.t / 12) % 2 === 0) { ctx.fillStyle = 'rgba(255,225,74,0.18)'; GFX.rr(ctx, 86, y - 24, 470, 30, 8); ctx.fill(); }
      const col = hl ? '#ffe14a' : (i === 0 ? '#ffd84a' : '#ffffff');
      GFX.text(ctx, `${i + 1}.`, 128, y, 22, col, { align: 'right' });
      GFX.text(ctx, s.name, 140, y, 22, col);
      GFX.text(ctx, String(s.floor), 380, y, 22, col, { align: 'right' });
      GFX.text(ctx, String(s.combo), 455, y, 22, col, { align: 'right' });
      GFX.text(ctx, String(s.score), 545, y, 22, col, { align: 'right' });
    });
    GFX.text(ctx, 'PRESS ENTER', W / 2, H - 14, 15, '#cfe6ff', { align: 'center', stroke: 3 });
  }

  function renderHelp() {
    drawMenuBG(0.7);
    textGrad('HOW TO PLAY', W / 2, 54, 48, [[0, '#ffffff'], [0.5, '#a8ecff'], [1, '#3a9cf0']]);
    const L = [
      ['#ffe14a', 'LEFT / RIGHT', 'RUN - BUILD UP SPEED!'],
      ['#ffe14a', 'SPACE / UP', 'JUMP - FASTER RUN = HIGHER JUMP'],
      ['#ffe14a', 'ESC / P', 'PAUSE'],
      null,
      ['#7fd6ff', 'WALLS', 'BOUNCE OFF THEM MID-AIR TO KEEP YOUR SPEED'],
      ['#7fd6ff', 'COMBOS', 'JUMP 2+ FLOORS AT A TIME, AGAIN AND AGAIN,'],
      ['#7fd6ff', '', 'BEFORE THE COMBO METER RUNS OUT'],
      ['#7fd6ff', 'SCORE', '10 x FLOOR + (COMBO FLOORS)² PER COMBO'],
      ['#7fd6ff', 'HURRY!', 'AT FLOOR 5 THE TOWER STARTS SCROLLING'],
      ['#7fd6ff', '', 'AND SPEEDS UP EVERY 30 SECONDS'],
      ['#7fd6ff', 'DON\'T FALL', 'OFF THE BOTTOM OF THE SCREEN!']
    ];
    L.forEach((l, i) => {
      if (!l) return;
      const y = 112 + i * 30;
      GFX.text(ctx, l[1], 210, y, 18, l[0], { align: 'right', stroke: 3 });
      GFX.text(ctx, l[2], 226, y, 16, '#ffffff', { stroke: 3 });
    });
    GFX.text(ctx, 'PRESS ENTER', W / 2, H - 14, 15, '#cfe6ff', { align: 'center', stroke: 3 });
  }

  function renderName() {
    renderGame(1);
    ctx.fillStyle = 'rgba(5,8,20,0.55)'; ctx.fillRect(0, 0, W, H);
    panel(130, 150, 380, 180);
    textGrad('NEW HIGH SCORE!', W / 2, 190, 34, [[0, '#ffffff'], [0.5, '#ffe68a'], [1, '#f0a020']]);
    GFX.text(ctx, 'ENTER YOUR NAME:', W / 2, 238, 18, '#a8ecff', { align: 'center', stroke: 3 });
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; GFX.rr(ctx, 170, 254, 300, 44, 10); ctx.fill();
    const cur = Math.floor(performance.now() / 400) % 2 ? '_' : ' ';
    GFX.text(ctx, nameBuf + cur, W / 2, 288, 30, '#ffffff', { align: 'center' });
    GFX.text(ctx, 'PRESS ENTER WHEN DONE', W / 2, 318, 13, '#cfe6ff', { align: 'center', stroke: 3, shadow: false });
  }

  function renderLoading() {
    ctx.fillStyle = '#0b0f1e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a8ecff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Loading...', W / 2, H / 2);
  }

  // -------------------------------------------------------------- main loop
  function tick() {
    updateTouch();
    switch (state) {
      case 'menu': tickMenu(); break;
      case 'options': tickOptions(); break;
      case 'scores': tickScores(); break;
      case 'help': tickHelp(); break;
      case 'game': tickGame(); break;
      case 'name': if (G) { G.overT++; } menu.t++; break;
    }
    for (const k in KP) delete KP[k];
    click = null; touch.jumpP = false;
  }
  function render(a) {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    switch (state) {
      case 'loading': renderLoading(); break;
      case 'menu': renderMenu(); break;
      case 'options': renderOptions(); break;
      case 'scores': renderScores(); break;
      case 'help': renderHelp(); break;
      case 'game': renderGame(G.paused || G.over ? 1 : a); break;
      case 'name': renderName(); break;
    }
  }
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(100, now - last); last = now;
    let n = 0;
    while (acc >= DT && n < 8) { tick(); acc -= DT; n++; }
    if (n >= 8) acc = 0;
    render(acc / DT);
  }

  // ------------------------------------------------------------------- boot
  const fontReady = (document.fonts && document.fonts.load)
    ? Promise.race([document.fonts.load(`40px ${GFX.FONT}`), new Promise(r => setTimeout(r, 2500))]).catch(() => {})
    : Promise.resolve();
  requestAnimationFrame(frame);
  fontReady.then(() => {
    buildAssets();
    menu.world.ensure(12);
    state = 'menu';
  });

  // debug / testing hook
  window.__icy = { get G() { return G; }, get state() { return state; }, newGame, K, KP };
})();
