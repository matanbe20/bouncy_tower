'use strict';
// ============================================================================
//  Graphics: procedurally drawn tower, platforms, hero and logo.
// ============================================================================
const GFX = (() => {
  const RS = 2;                 // supersampling for cached bitmaps
  const W = 640, WALL = 72;
  const FONT = '"Luckiest Guy", "Arial Black", Impact, sans-serif';

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * RS); c.height = Math.ceil(h * RS);
    const g = c.getContext('2d'); g.scale(RS, RS);
    return { c, g };
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function lin(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }
  function speckle(g, w, h, r, n, a) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * r()})` : `rgba(0,0,0,${a * r()})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  }

  // ------------------------------------------------------------- tower walls
  function stoneBlock(g, x, y, w, h, r) {
    const L = 50 + r() * 14, hue = 218 + r() * 10;
    g.save(); rr(g, x, y, w, h, 3); g.clip();
    g.fillStyle = lin(g, x, y, x + w * 0.3, y + h, [[0, `hsl(${hue},12%,${L + 8}%)`], [1, `hsl(${hue},14%,${L - 8}%)`]]);
    g.fillRect(x, y, w, h);
    speckle(g, w, h, r, 0, 0);
    for (let i = 0; i < w * h / 40; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.12 * r()})` : `rgba(0,0,0,${0.18 * r()})`;
      g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // bevel
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, w, 2.5); g.fillRect(x, y, 2.5, h);
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x, y + h - 3.5, w, 3.5); g.fillRect(x + w - 3, y, 3, h);
    // crack
    if (r() < 0.25) {
      g.strokeStyle = 'rgba(20,22,30,0.55)'; g.lineWidth = 1;
      g.beginPath(); let cx = x + r() * w, cy = y + 2; g.moveTo(cx, cy);
      for (let i = 0; i < 4; i++) { cx += (r() - 0.5) * 10; cy += h / 5; g.lineTo(cx, cy); }
      g.stroke();
    }
    g.restore();
  }

  function buildWall(seed, side) {
    const TH = 480; const { c, g } = mk(WALL, TH); const r = rng(seed);
    g.fillStyle = '#1a1c26'; g.fillRect(0, 0, WALL, TH);
    let y = 0;
    while (y < TH) {
      let h = 30 + Math.floor(r() * 18);
      if (TH - y - h < 30) h = TH - y;
      if (r() < 0.55) {
        const sx = 22 + Math.floor(r() * 30);
        stoneBlock(g, 1.5, y + 1.5, sx - 3, h - 3, r);
        stoneBlock(g, sx + 1.5, y + 1.5, WALL - sx - 3, h - 3, r);
      } else stoneBlock(g, 1.5, y + 1.5, WALL - 3, h - 3, r);
      y += h;
    }
    // shading toward the playfield
    const inner = side < 0 ? WALL : 0;
    const gr = side < 0
      ? lin(g, WALL - 18, 0, WALL, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']])
      : lin(g, 0, 0, 18, 0, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    g.fillStyle = gr; g.fillRect(side < 0 ? WALL - 18 : 0, 0, 18, TH);
    const og = side < 0
      ? lin(g, 0, 0, 22, 0, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']])
      : lin(g, WALL - 22, 0, WALL, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
    g.fillStyle = og; g.fillRect(side < 0 ? 0 : WALL - 22, 0, 22, TH);
    g.fillStyle = '#0c0d13'; g.fillRect(inner - (side < 0 ? 2 : 0), 0, 2, TH);
    return c;
  }

  // ------------------------------------------------------- background bricks
  function buildBG() {
    const TW = 240, TH = 240, BW = 40, BH = 20;
    const { c, g } = mk(TW, TH);
    g.fillStyle = '#12141c'; g.fillRect(0, 0, TW, TH);
    for (let row = 0; row < TH / BH; row++) {
      const off = row % 2 ? BW / 2 : 0;
      for (let col = -1; col <= TW / BW; col++) {
        const key = ((col % 6) + 6) % 6;
        const r = rng(row * 97 + key * 13 + 5);
        const x = col * BW + off + 1, y = row * BH + 1, w = BW - 2, h = BH - 2;
        const L = 20 + r() * 8 + (r() < 0.08 ? -6 : 0);
        g.save(); rr(g, x, y, w, h, 2); g.clip();
        g.fillStyle = `hsl(${222 + r() * 12},16%,${L}%)`; g.fillRect(x, y, w, h);
        for (let i = 0; i < 26; i++) {
          g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.06 * r()})` : `rgba(0,0,0,${0.15 * r()})`;
          g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r());
        }
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, y, w, 2);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + h - 3, w, 3);
        g.restore();
      }
    }
    return c;
  }

  // --------------------------------------------------------------- platforms
  const T = 16;
  const MATS = ['stone', 'ice', 'wood', 'metal', 'gum', 'bone', 'vine', 'pipe', 'cloud', 'rainbow', 'glass'];
  const TINTS = ['#000000', '#3fa8ff', '#c27a34', '#8a9bb3', '#ff58b0', '#d6c08a', '#3fc25a', '#22a07a', '#bfe6ff', '#b05cff', '#7ff0ff'];
  const PAD_X = 10, PAD_T = 14, PAD_B = 32;

  function shadow(g, w) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, 3, T - 1, w, 10, 5); g.fill();
  }
  function slab(g, w, outline, stops, rad = 4) {
    g.fillStyle = outline; rr(g, -1.5, -1.5, w + 3, T + 3, rad + 1.5); g.fill();
    g.save(); rr(g, 0, 0, w, T, rad); g.clip();
    g.fillStyle = lin(g, 0, 0, 0, T, stops); g.fillRect(0, 0, w, T);
  }

  const drawMat = {
    stone(g, w, r) {
      shadow(g, w);
      slab(g, w, '#1c1f2b', [[0, '#d2d8e3'], [0.45, '#a0a8b8'], [1, '#69718a']]);
      let x = r() * 10 - 10;
      while (x < w) {
        const bw = 20 + Math.floor(r() * 22);
        g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${(r() * 0.12).toFixed(3)})` : `rgba(0,0,0,${(r() * 0.12).toFixed(3)})`;
        g.fillRect(x, 0, bw, T);
        if (x + bw < w - 5) {
          g.fillStyle = 'rgba(28,31,43,0.8)'; g.fillRect(x + bw - 1, 2, 2, T - 2);
          g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + bw + 1, 3, 1, T - 5);
        }
        x += bw;
      }
      speckle(g, w, T, r, w * 0.6, 0.2);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 1, w, 2);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, T - 3, w, 3);
      g.restore();
    },
    ice(g, w, r) {
      shadow(g, w);
      // icicles
      for (let x = 4 + r() * 6; x < w - 4; x += 5 + r() * 10) {
        const len = 4 + Math.pow(r(), 2) * 20, hw = 2 + r() * 2.5;
        g.fillStyle = lin(g, 0, T, 0, T + len, [[0, 'rgba(230,250,255,0.95)'], [1, 'rgba(120,205,245,0.55)']]);
        g.strokeStyle = 'rgba(30,90,140,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - hw, T); g.lineTo(x + hw, T); g.lineTo(x + 0.3, T + len); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x - hw * 0.5, T, 1, len * 0.5);
      }
      slab(g, w, '#174a74', [[0, '#f6feff'], [0.35, '#a6e6f8'], [1, '#3f9fd3']], 5);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      for (let x = r() * 30; x < w + 20; x += 22 + r() * 30) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 7, 0); g.lineTo(x - 4, T); g.lineTo(x - 11, T); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.8;
      for (let i = 0; i < w / 40; i++) {
        let cx = r() * w, cy = 4 + r() * 6; g.beginPath(); g.moveTo(cx, cy);
        for (let j = 0; j < 3; j++) { cx += (r() - 0.3) * 8; cy += (r() - 0.5) * 5; g.lineTo(cx, cy); }
        g.stroke();
      }
      g.fillStyle = 'rgba(0,40,80,0.18)'; g.fillRect(0, T - 4, w, 4);
      g.restore();
      // snow cap
      const snowSeed = Math.floor(r() * 1e9);
      const snowTop = () => {
        const sr = rng(snowSeed); let x = -1;
        g.moveTo(-1, 2);
        while (x < w + 1) { const s = 6 + sr() * 8; g.quadraticCurveTo(x + s / 2, -3 - sr() * 2.5, Math.min(w + 1, x + s), 1 + sr()); x += s; }
      };
      g.fillStyle = '#ffffff';
      g.beginPath(); snowTop(); g.lineTo(w + 1, 4); g.lineTo(-1, 4); g.closePath(); g.fill();
      g.strokeStyle = '#174a74'; g.lineWidth = 1.2;
      g.beginPath(); snowTop(); g.stroke();
      g.fillStyle = 'rgba(160,220,255,0.6)'; g.fillRect(0, 3, w, 1.2);
    },
    wood(g, w, r) {
      shadow(g, w);
      slab(g, w, '#3a1f0c', [[0, '#e3a062'], [0.5, '#b06c33'], [1, '#6d3c16']], 3);
      for (let row = 0; row < 2; row++) {
        const y0 = row * T / 2;
        let x = -r() * 30;
        while (x < w) {
          const bw = 40 + r() * 50;
          g.fillStyle = `rgba(${r() < 0.5 ? '255,220,170' : '60,25,0'},${(r() * 0.15).toFixed(3)})`; g.fillRect(x, y0, bw, T / 2);
          g.strokeStyle = 'rgba(70,35,10,0.45)'; g.lineWidth = 0.7;
          for (let k = 0; k < 2; k++) {
            const gy = y0 + 2 + r() * (T / 2 - 4);
            g.beginPath(); g.moveTo(x + 2, gy); g.quadraticCurveTo(x + bw / 2, gy + (r() - 0.5) * 4, x + bw - 2, gy + (r() - 0.5) * 2); g.stroke();
          }
          if (x + bw < w) {
            g.fillStyle = '#3a1f0c'; g.fillRect(x + bw - 0.75, y0, 1.5, T / 2);
            g.fillStyle = '#2a2a2a';
            g.beginPath(); g.arc(x + bw - 4, y0 + T / 4, 1.3, 0, 7); g.arc(x + bw + 4, y0 + T / 4, 1.3, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + bw - 4.6, y0 + T / 4 - 0.8, 0.8, 0.8); g.fillRect(x + bw + 3.4, y0 + T / 4 - 0.8, 0.8, 0.8);
          }
          x += bw;
        }
      }
      g.fillStyle = '#3a1f0c'; g.fillRect(0, T / 2 - 0.75, w, 1.5);
      g.fillStyle = 'rgba(255,230,190,0.55)'; g.fillRect(0, 1, w, 1.5); g.fillRect(0, T / 2 + 0.75, w, 1);
      g.restore();
    },
    metal(g, w, r) {
      shadow(g, w);
      slab(g, w, '#20252d', [[0, '#f4f7fa'], [0.35, '#b9c1cc'], [0.7, '#7d8693'], [1, '#4b535f']], 2);
      for (let x = 32 + r() * 30; x < w - 8; x += 56 + r() * 30) {
        g.fillStyle = 'rgba(20,25,30,0.7)'; g.fillRect(x, 0, 1.2, T);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 1.2, 0, 1, T);
      }
      for (let x = 7; x < w - 3; x += 14) {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 0.6, T / 2 + 0.8, 2.3, 0, 7); g.fill();
        g.fillStyle = lin(g, x - 2, T / 2 - 2, x + 2, T / 2 + 2, [[0, '#ffffff'], [1, '#8a93a0']]);
        g.beginPath(); g.arc(x, T / 2, 2.1, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 1, w, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, T - 2.5, w, 2.5);
      g.restore();
    },
    gum(g, w, r) {
      shadow(g, w);
      g.fillStyle = '#7a1745';
      for (let x = 6 + r() * 10; x < w - 6; x += 10 + r() * 22) {
        const l = 3 + r() * 12, dw = 2.5 + r() * 2.5;
        g.fillStyle = '#7a1745'; rr(g, x - dw - 1.2, T - 4, dw * 2 + 2.4, l + 2.4, dw + 1.2); g.fill();
        g.fillStyle = '#e8459a'; rr(g, x - dw, T - 4, dw * 2, l, dw); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - dw * 0.4, T, 1, l * 0.5);
      }
      const bumps = [];
      for (let x = 0; x < w; x += 7 + r() * 8) bumps.push([x + 3, 3 + r() * 2, 4 + r() * 3]);
      g.fillStyle = '#7a1745';
      rr(g, -1.5, 1.5, w + 3, T + 0, 6); g.fill();
      bumps.forEach(([x, y, s]) => { g.beginPath(); g.arc(Math.min(x, w - s + 1), y, s + 1.5, 0, 7); g.fill(); });
      const fill = lin(g, 0, -4, 0, T, [[0, '#ffc6e4'], [0.4, '#ff6cb6'], [1, '#c92a7e']]);
      g.fillStyle = fill;
      rr(g, 0, 3, w, T - 3, 5); g.fill();
      bumps.forEach(([x, y, s]) => { g.beginPath(); g.arc(Math.min(x, w - s + 1), y, s, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(255,255,255,0.75)';
      bumps.forEach(([x, y, s], i) => { if (i % 2 === 0) { g.beginPath(); g.ellipse(Math.min(x, w - s + 1) - s * 0.35, y - s * 0.4, s * 0.35, s * 0.2, -0.5, 0, 7); g.fill(); } });
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < w / 12; i++) { g.beginPath(); g.arc(r() * w, 6 + r() * (T - 9), 0.8 + r() * 1.5, 0, 7); g.fill(); }
    },
    bone(g, w, r) {
      shadow(g, w);
      const bones = []; let x = 0;
      while (x < w - 4) { let L = 30 + r() * 18; if (w - x - L < 24) L = w - x; bones.push([x, L]); x += L; }
      const shape = (pad) => {
        bones.forEach(([bx, L]) => {
          rr(g, bx + 5 - pad, 4 - pad, L - 10 + pad * 2, 8 + pad * 2, 3); g.fill();
          [[bx + 5, 4], [bx + 5, 12], [bx + L - 5, 4], [bx + L - 5, 12]].forEach(([cx, cy]) => { g.beginPath(); g.arc(cx, cy, 4.3 + pad, 0, 7); g.fill(); });
        });
      };
      g.fillStyle = '#4b3a22'; shape(1.5);
      g.fillStyle = lin(g, 0, 0, 0, T, [[0, '#fffaf0'], [0.6, '#eadbb6'], [1, '#c3ad7c']]); shape(0);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      bones.forEach(([bx, L]) => { g.fillRect(bx + 7, 5, L - 14, 1.2); g.beginPath(); g.arc(bx + 4, 2.5, 1.3, 0, 7); g.arc(bx + L - 6, 2.5, 1.3, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(90,60,20,0.3)';
      bones.forEach(([bx, L]) => g.fillRect(bx + 8, 10, L - 16, 1));
    },
    vine(g, w, r) {
      shadow(g, w);
      // hanging vines
      for (let x = 6 + r() * 12; x < w - 4; x += 12 + r() * 26) {
        const len = 8 + r() * 22, sway = (r() - 0.5) * 8;
        g.strokeStyle = '#1d5a22'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, T - 2); g.quadraticCurveTo(x + sway, T + len / 2, x + sway * 0.5, T + len); g.stroke();
        g.strokeStyle = '#46b04c'; g.lineWidth = 1.5; g.stroke();
        for (let k = 1; k <= 2; k++) {
          const ly = T + len * k / 3, lx = x + sway * 0.6 * k / 2;
          g.fillStyle = '#1d5a22'; g.beginPath(); g.ellipse(lx + (k % 2 ? 3 : -3), ly, 3.6, 2, k % 2 ? 0.5 : -0.5, 0, 7); g.fill();
          g.fillStyle = '#5fc64f'; g.beginPath(); g.ellipse(lx + (k % 2 ? 3 : -3), ly, 2.6, 1.3, k % 2 ? 0.5 : -0.5, 0, 7); g.fill();
        }
      }
      slab(g, w, '#2a1608', [[0, '#a8693a'], [0.5, '#7a4521'], [1, '#4a2810']], 6);
      g.strokeStyle = 'rgba(30,12,2,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < w / 14; i++) { const x = r() * w, y = 6 + r() * 8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + r() * 10, y + (r() - 0.5) * 2); g.stroke(); }
      g.restore();
      // leafy top
      for (let pass = 0; pass < 2; pass++) {
        for (let x = -2; x < w + 2; x += 5) {
          const rr2 = rng(Math.floor(x * 7 + w));
          const a = (rr2() - 0.5) * 1.4, s = 4 + rr2() * 2.5, y = 1 + rr2() * 3;
          g.fillStyle = pass ? (rr2() < 0.5 ? '#4cb84f' : '#6fd35a') : '#164a1a';
          g.beginPath(); g.ellipse(x, y, s + (pass ? 0 : 1.2), s * 0.55 + (pass ? 0 : 1.2), a, 0, 7); g.fill();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = 2; x < w; x += 9) { g.beginPath(); g.ellipse(x, 0.5, 1.8, 0.8, -0.4, 0, 7); g.fill(); }
    },
    pipe(g, w, r) {
      shadow(g, w);
      slab(g, w, '#123418', [[0, '#d2ffb4'], [0.3, '#6ccf52'], [0.75, '#2e8a2a'], [1, '#1a521a']], 7);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 3, w, 1.5);
      g.restore();
      for (let x = 20 + r() * 20; x < w - 10; x += 54 + r() * 24) {
        g.fillStyle = '#123418'; rr(g, x - 5.5, -3.5, 11, T + 7, 2.5); g.fill();
        g.fillStyle = lin(g, 0, -2, 0, T + 2, [[0, '#bff59c'], [0.4, '#58b843'], [1, '#1c5c1c']]); rr(g, x - 4, -2, 8, T + 4, 1.5); g.fill();
        g.fillStyle = '#1b3a1b'; g.beginPath(); g.arc(x, 1, 1, 0, 7); g.arc(x, T - 1, 1, 0, 7); g.fill();
      }
    },
    cloud(g, w, r) {
      const puffs = [];
      for (let x = 2; x < w - 2; x += 8 + r() * 7) puffs.push([x, 5 + r() * 2, 6 + r() * 5]);
      puffs.push([w - 4, 6, 6]);
      const bot = [];
      for (let x = 6; x < w - 6; x += 9 + r() * 6) bot.push([x, 11 + r() * 2, 5 + r() * 3]);
      g.fillStyle = 'rgba(80,110,160,0.18)';
      bot.forEach(([x, y, s]) => { g.beginPath(); g.arc(x + 3, y + 6, s, 0, 7); g.fill(); });
      const shape = (p) => {
        [...puffs, ...bot].forEach(([x, y, s]) => { g.beginPath(); g.arc(x, y, s + p, 0, 7); g.fill(); });
        rr(g, 0 - p, 3 - p, w + p * 2, 10 + p * 2, 5); g.fill();
      };
      g.fillStyle = '#7f9fc8'; shape(1.5);
      g.fillStyle = '#ffffff'; shape(0);
      g.save(); g.beginPath(); g.rect(-20, 9, w + 40, 30); g.clip();
      g.fillStyle = 'rgba(170,200,240,0.55)'; shape(0); g.restore();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      puffs.forEach(([x, y, s], i) => { if (i % 3 === 0) { g.beginPath(); g.arc(x - s * 0.3, y - s * 0.4, s * 0.3, 0, 7); g.fill(); } });
    },
    rainbow(g, w, r) {
      shadow(g, w);
      g.fillStyle = '#2a1a3a'; rr(g, -1.5, -1.5, w + 3, T + 3, 7); g.fill();
      g.save(); rr(g, 0, 0, w, T, 6); g.clip();
      const cols = ['#ff4b4b', '#ff9f3a', '#ffe14a', '#5fd85a', '#4aa8ff', '#a46bff'];
      cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * T / 6, w, T / 6 + 0.5); });
      g.fillStyle = lin(g, 0, 0, 0, T, [[0, 'rgba(255,255,255,0.45)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.25)']]);
      g.fillRect(0, 0, w, T);
      g.restore();
      g.fillStyle = '#ffffff';
      for (let x = 8 + r() * 10; x < w - 4; x += 18 + r() * 22) star(g, x, 3 + r() * 10, 2.6, 1);
    },
    glass(g, w, r) {
      g.fillStyle = 'rgba(0,0,0,0.15)'; rr(g, 3, T - 1, w, 8, 4); g.fill();
      g.fillStyle = 'rgba(180,235,255,0.32)'; rr(g, 0, 0, w, T, 3); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.5; rr(g, 0, 0, w, T, 3); g.stroke();
      g.strokeStyle = 'rgba(90,170,220,0.9)'; g.lineWidth = 1; rr(g, 1.8, 1.8, w - 3.6, T - 3.6, 2); g.stroke();
      g.save(); rr(g, 0, 0, w, T, 3); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let x = r() * 20; x < w + 20; x += 26 + r() * 30) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, 0); g.lineTo(x - 6, T); g.lineTo(x - 10, T); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x + 7, 0); g.lineTo(x + 8.5, 0); g.lineTo(x - 1.5, T); g.lineTo(x - 3, T); g.closePath(); g.fill();
      }
      g.restore();
      g.fillStyle = '#fff';
      for (let x = 10 + r() * 30; x < w - 4; x += 40 + r() * 40) star(g, x, 2, 2.4, 1);
    }
  };

  function star(g, x, y, s, inner = 0.4) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, rad = i % 2 ? s * inner * 0.45 : s * 1.6;
      g.lineTo(x + Math.sin(a) * rad, y - Math.cos(a) * rad);
    }
    g.closePath(); g.fill();
  }
  function star5(g, x, y, R, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, rad = i % 2 ? r : R;
      g.lineTo(x + Math.sin(a) * rad, y - Math.cos(a) * rad);
    }
    g.closePath();
  }

  function platform(mat, w, seed) {
    const { c, g } = mk(w + PAD_X * 2, PAD_T + T + PAD_B);
    g.translate(PAD_X, PAD_T);
    drawMat[MATS[mat]](g, w, rng(seed));
    return { c, ox: -PAD_X, oy: -PAD_T, w: w + PAD_X * 2, h: PAD_T + T + PAD_B };
  }

  // Floor number plaque (every 10 floors)
  function sign(g, x, y, n) {
    const txt = String(n);
    g.font = `15px ${FONT}`;
    const tw = Math.max(30, g.measureText(txt).width + 16);
    // chains
    g.strokeStyle = '#2b2b33'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - tw / 2 + 6, y - 6); g.lineTo(x - tw / 2 + 6, y + 2); g.moveTo(x + tw / 2 - 6, y - 6); g.lineTo(x + tw / 2 - 6, y + 2); g.stroke();
    g.fillStyle = '#1a1208'; rr(g, x - tw / 2 - 1.5, y - 0.5, tw + 3, 22, 5); g.fill();
    g.fillStyle = lin(g, 0, y, 0, y + 20, [[0, '#f0c070'], [1, '#a8682a']]); rr(g, x - tw / 2, y + 1, tw, 19, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x - tw / 2 + 3, y + 2.5, tw - 6, 1.5);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a1d05'; g.fillText(txt, x, y + 12.5);
  }

  // ------------------------------------------------------------- text helper
  function text(g, str, x, y, size, fill, opts = {}) {
    g.font = `${size}px ${FONT}`;
    g.textAlign = opts.align || 'left';
    g.textBaseline = opts.base || 'alphabetic';
    g.lineJoin = 'round';
    const sw = opts.stroke !== undefined ? opts.stroke : Math.max(3, size * 0.16);
    if (opts.shadow !== false) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(str, x + size * 0.06, y + size * 0.08);
      if (sw) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = sw; g.strokeText(str, x + size * 0.06, y + size * 0.08); }
    }
    if (sw) { g.strokeStyle = opts.outline || '#140c22'; g.lineWidth = sw; g.strokeText(str, x, y); }
    g.fillStyle = fill; g.fillText(str, x, y);
  }

  // ================================================================== HERO
  const C = {
    out: '#1a1222', skin: '#ffd3a8', skinD: '#e8a878', cap: '#2f72e6', capD: '#1b4bb0',
    shirt: '#ff4f3f', shirtD: '#c43226', pants: '#3b4ca8', pantsD: '#29357a',
    shoe: '#ffffff', shoeD: '#cfd5e2', sole: '#ff4f3f', hair: '#4a2a14'
  };
  const HIP = 14, THIGH = 7, SHIN = 7, TORSO = 11, UARM = 6.5, FARM = 6.5;   // ~49px tall, big-head proportions

  function pose(kind, t, o = {}) {
    const P = { lean: 0, tilt: 0, back: [-0.1, 0.35], front: [0.1, 0.35], legB: [-0.06, 0.04], legF: [0.08, 0.04], eyes: 'open', mouth: 'smile', look: [0.8, 0], ground: true, bob: 0 };
    switch (kind) {
      case 'idle': {
        const b = Math.sin(t * 0.06);
        P.bob = b * 0.5;
        P.back = [-0.14, 0.4 + b * 0.06]; P.front = [0.14, 0.4 - b * 0.06];
        const it = o.idleT || 0;
        // looks around after standing still for a while
        if (it > 150) {
          const ph = Math.floor((it - 150) / 70) % 4;
          P.look = [[0, 0.2], [-1, 0], [0, 0.2], [1, -0.4]][ph];
          if (ph === 0 || ph === 2) { P.mouth = 'grin'; }
        }
        if (it > 400 && Math.floor(it / 300) % 2 === 1) { // tapping foot impatiently
          const tap = Math.max(0, Math.sin(t * 0.35));
          P.legF = [0.25 + tap * 0.25, 0.2 + tap * 0.15]; P.mouth = 'flat';
          P.front = [-0.35, 1.9]; P.back = [0.35, 1.9];
        }
        break;
      }
      case 'run': {
        const ph = o.phase || 0, s = Math.min(1, (o.speed || 0) / 9);
        P.lean = 0.1 + 0.16 * s;
        const amp = 0.55 + 0.4 * s;
        P.legF = [Math.sin(ph) * amp, 0.2 + (0.6 + 0.8 * s) * Math.max(0, Math.cos(ph))];
        P.legB = [Math.sin(ph + Math.PI) * amp, 0.2 + (0.6 + 0.8 * s) * Math.max(0, Math.cos(ph + Math.PI))];
        P.front = [-Math.sin(ph) * amp * 0.9, 1.3];
        P.back = [Math.sin(ph) * amp * 0.9, 1.3];
        P.mouth = s > 0.8 ? 'grin' : 'smile';
        P.look = [1, 0];
        break;
      }
      case 'land':
        P.lean = 0.2; P.legF = [0.7, 1.4]; P.legB = [0.55, 1.3]; P.front = [0.6, 0.6]; P.back = [-0.5, 0.6]; P.mouth = 'grin';
        break;
      case 'jump':
        P.ground = false; P.lean = 0.05; P.legF = [1.05, 1.8]; P.legB = [0.2, 0.9];
        P.front = [3.35, -0.25]; P.back = [2.45, 0.45]; P.mouth = 'grin'; P.look = [1, -1];
        break;
      case 'fall': {
        P.ground = false; const f = Math.sin(t * 0.35) * 0.25;
        P.legF = [0.35, 0.55]; P.legB = [-0.25, 0.35];
        P.front = [1.9 + f, 0.3]; P.back = [-1.9 - f, 0.3]; P.mouth = 'o'; P.look = [0.6, 1];
        break;
      }
      case 'spin':
        P.ground = false; P.legF = [1.7, 2.5]; P.legB = [1.5, 2.4]; P.front = [1.2, 1.5]; P.back = [1.0, 1.6];
        P.eyes = 'happy'; P.mouth = 'grin';
        break;
      case 'edge': {
        const a = t * 0.5;
        P.lean = 0.28 + Math.sin(t * 0.3) * 0.12;
        P.front = [a, 0.15]; P.back = [a + Math.PI, 0.15];
        P.legF = [-0.1, 0]; P.legB = [-0.2, 0];
        P.eyes = 'wide'; P.mouth = 'o'; P.look = [1, 1];
        break;
      }
      case 'dead':
        P.ground = false; P.front = [3.45, -0.2]; P.back = [-2.6, 0.2]; P.legF = [0.5, 1.0]; P.legB = [-0.3, 0.5];
        P.eyes = 'x'; P.mouth = 'o';
        break;
      case 'cheer': {
        const b = Math.abs(Math.sin(t * 0.15));
        P.front = [2.8, 0.2 + b * 0.4]; P.back = [-2.8, 0.2 + b * 0.4]; P.mouth = 'grin'; P.eyes = 'happy'; P.bob = b * 3;
        break;
      }
    }
    if (o.blink && (P.eyes === 'open')) P.eyes = 'blink';
    if (o.scared) { P.eyes = 'wide'; P.mouth = 'o'; }
    return P;
  }

  function limb(g, x, y, a1, l1, a2, l2, w, c1, c2) {
    const x1 = x + Math.sin(a1) * l1, y1 = y + Math.cos(a1) * l1;
    const x2 = x1 + Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = C.out; g.lineWidth = w + 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = c2; g.lineWidth = w;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = c1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
    return [x2, y2];
  }

  function leg(g, hx, hy, L, pants, shoe) {
    const a1 = L[0], a2 = L[0] - L[1];
    const [fx, fy] = limb(g, hx, hy, a1, THIGH, a2, SHIN, 6, pants, pants);
    // shoe, oriented perpendicular to the shin
    g.save(); g.translate(fx, fy); g.rotate(-a2);
    g.fillStyle = C.out; g.beginPath(); g.ellipse(2.8, -0.6, 6.8, 4.3, 0, 0, 7); g.fill();
    g.fillStyle = shoe; g.beginPath(); g.ellipse(2.8, -1, 5.4, 3.0, 0, 0, 7); g.fill();
    g.fillStyle = C.sole; g.fillRect(-2.4, 1, 10.4, 1.6);
    g.fillStyle = C.sole; g.beginPath(); g.ellipse(3.4, -1.6, 1.8, 1.1, 0, 0, 7); g.fill();
    g.restore();
  }

  function arm(g, sx, sy, A, sleeve) {
    const [hx, hy] = limb(g, sx, sy, A[0], UARM, A[0] + A[1], FARM, 5, sleeve, C.skin);
    g.fillStyle = C.out; g.beginPath(); g.arc(hx, hy, 4.4, 0, 7); g.fill();
    g.fillStyle = C.skin; g.beginPath(); g.arc(hx, hy, 3.0, 0, 7); g.fill();
  }

  function head(g, P) {
    // back hair
    g.fillStyle = C.hair; g.beginPath(); g.ellipse(-8, 2, 4, 6, 0.3, 0, 7); g.fill();
    // face
    g.fillStyle = C.out; g.beginPath(); g.arc(0, 0, 12.6, 0, 7); g.fill();
    g.fillStyle = C.skin; g.beginPath(); g.arc(0, 0, 11.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(232,150,110,0.35)'; g.beginPath(); g.ellipse(7, 5, 3, 1.8, 0, 0, 7); g.fill();
    // ear
    g.fillStyle = C.out; g.beginPath(); g.ellipse(-3, 2, 3.6, 4.3, 0, 0, 7); g.fill();
    g.fillStyle = C.skin; g.beginPath(); g.ellipse(-3, 2, 2.4, 3.1, 0, 0, 7); g.fill();
    g.fillStyle = C.skinD; g.beginPath(); g.ellipse(-2.6, 2.2, 1, 1.6, 0, 0, 7); g.fill();
    // nose
    g.fillStyle = C.out; g.beginPath(); g.ellipse(11.3, 2, 3.5, 3, 0, 0, 7); g.fill();
    g.fillStyle = C.skin; g.beginPath(); g.ellipse(11.2, 1.8, 2.4, 2, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(11, 1, 0.8, 0, 7); g.fill();
    // eyes
    const [lx, ly] = P.look;
    [[3.6, -2.6, 0.9], [8.6, -2.8, 1]].forEach(([ex, ey, sc]) => {
      const wide = P.eyes === 'wide';
      const rx = (wide ? 3.4 : 2.9) * sc, ry = (wide ? 4.6 : 4.0) * sc;
      if (P.eyes === 'blink' || P.eyes === 'happy') {
        g.strokeStyle = C.out; g.lineWidth = 1.6; g.lineCap = 'round';
        g.beginPath();
        if (P.eyes === 'blink') { g.moveTo(ex - rx, ey + 0.5); g.quadraticCurveTo(ex, ey + 2, ex + rx, ey + 0.5); }
        else { g.moveTo(ex - rx, ey + 1); g.quadraticCurveTo(ex, ey - 3, ex + rx, ey + 1); }
        g.stroke();
      } else if (P.eyes === 'x') {
        g.strokeStyle = C.out; g.lineWidth = 1.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - 2, ey - 2); g.lineTo(ex + 2, ey + 2); g.moveTo(ex + 2, ey - 2); g.lineTo(ex - 2, ey + 2); g.stroke();
      } else {
        g.fillStyle = C.out; g.beginPath(); g.ellipse(ex, ey, rx + 1, ry + 1, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, 7); g.fill();
        const pr = wide ? 1.2 : 1.6;
        g.fillStyle = '#111'; g.beginPath(); g.ellipse(ex + lx * (rx - pr - 0.3), ey + ly * (ry - pr * 1.4 - 0.3), pr, pr * 1.45, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + lx * (rx - pr - 0.3) + 0.5, ey + ly * (ry - pr * 1.4 - 0.3) - 0.9, 0.55, 0, 7); g.fill();
      }
    });
    // mouth
    g.strokeStyle = C.out; g.lineWidth = 1.5; g.lineCap = 'round';
    switch (P.mouth) {
      case 'smile': g.beginPath(); g.arc(7.5, 5, 3.4, 0.25 * Math.PI, 0.8 * Math.PI); g.stroke(); break;
      case 'flat': g.beginPath(); g.moveTo(5, 7.5); g.lineTo(9.5, 7); g.stroke(); break;
      case 'grin':
        g.fillStyle = '#5a1020'; g.beginPath(); g.moveTo(3.5, 5.2); g.quadraticCurveTo(7.5, 12.5, 11, 5); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(4.6, 5.3, 5.6, 1.6);
        break;
      case 'o':
        g.fillStyle = '#5a1020'; g.beginPath(); g.ellipse(7.8, 7.4, 2.1, 2.8, 0, 0, 7); g.fill(); g.stroke();
        break;
    }
    // cap
    g.fillStyle = C.out;
    g.beginPath(); g.arc(0.5, -3, 13.4, Math.PI * 0.98, Math.PI * 2.02); g.closePath(); g.fill();
    g.fillStyle = C.cap;
    g.beginPath(); g.arc(0.5, -3, 12, Math.PI * 1.0, Math.PI * 2.0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-3, -11, 4.5, 2.2, -0.4, 0, 7); g.fill();
    g.fillStyle = C.capD; g.fillRect(-11.5, -5.3, 24, 2.6);
    // brim
    g.fillStyle = C.out;
    g.beginPath(); g.moveTo(6, -6.8); g.quadraticCurveTo(18, -8.6, 23.5, -4.8); g.quadraticCurveTo(23, -1.4, 18, -2.2); g.lineTo(6, -2.2); g.closePath(); g.fill();
    g.fillStyle = C.capD;
    g.beginPath(); g.moveTo(7, -5.6); g.quadraticCurveTo(18, -7.2, 22, -4.6); g.quadraticCurveTo(21.4, -3, 18, -3.4); g.lineTo(7, -3.4); g.closePath(); g.fill();
    g.fillStyle = C.out; g.beginPath(); g.arc(0.5, -15.6, 2.3, 0, 7); g.fill();
    g.fillStyle = C.capD; g.beginPath(); g.arc(0.5, -15.6, 1.3, 0, 7); g.fill();
    // star logo
    g.fillStyle = '#ffe14a'; star5(g, -4, -8.5, 3.2, 1.4); g.fill();
  }

  function hero(g, x, y, facing, rot, P, scale = 1) {
    g.save();
    g.translate(x, y);
    if (scale !== 1) g.scale(scale, scale);
    g.translate(0, -23); g.rotate(rot); g.scale(facing, 1); g.translate(0, 23);
    const footY = L => -HIP + Math.cos(L[0]) * THIGH + Math.cos(L[0] - L[1]) * SHIN;
    let off = P.ground ? -Math.max(footY(P.legF), footY(P.legB)) : 0;
    off -= P.bob || 0;
    const hx = 0, hy = -HIP + off;
    const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
    const sx = hx + sL * TORSO, sy = hy - cL * TORSO;
    const ax = hx + sL * (TORSO - 2), ay = hy - cL * (TORSO - 2);

    leg(g, hx - 2, hy, P.legB, C.pantsD, C.shoeD);
    arm(g, ax - 1, ay, P.back, C.shirtD);
    // torso
    g.lineCap = 'round';
    g.strokeStyle = C.out; g.lineWidth = 16.5;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(sx, sy); g.stroke();
    g.strokeStyle = C.shirt; g.lineWidth = 13.5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(hx + 3 + sL * 4, hy - cL * 4); g.lineTo(sx + 3, sy + 1); g.stroke();
    // shorts / waist
    g.strokeStyle = C.pants; g.lineWidth = 13.5; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(hx - sL * 1.5, hy + cL * 1.5); g.lineTo(hx + sL * 3.5, hy - cL * 3.5); g.stroke();
    g.fillStyle = '#222'; g.save(); g.translate(hx + sL * 3.5, hy - cL * 3.5); g.rotate(P.lean); g.fillRect(-6.75, -1.4, 13.5, 1.8); g.restore();
    g.lineCap = 'round';
    leg(g, hx + 2, hy, P.legF, C.pants, C.shoe);
    // head
    const hd = TORSO + 9.5;
    g.save(); g.translate(hx + sL * hd, hy - cL * hd); g.rotate(P.lean * 0.5 + P.tilt);
    head(g, P);
    g.restore();
    arm(g, ax + 1, ay, P.front, C.shirt);
    g.restore();
  }

  // ================================================================== LOGO
  function logo() {
    const w = 560, h = 190;
    const { c, g } = mk(w, h);
    const lines = [['BOUNCY', 74, 74], ['TOWER', 96, 168]];
    lines.forEach(([str, size, y]) => {
      g.font = `${size}px ${FONT}`;
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
      const spacing = size * 0.02;
      const widths = [...str].map(ch => g.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (str.length - 1);
      let x0 = (w - total) / 2;
      const pos = []; let xx = x0;
      widths.forEach(cw => { pos.push(xx); xx += cw + spacing; });
      // drop shadow
      g.fillStyle = 'rgba(0,0,10,0.55)';
      [...str].forEach((ch, i) => g.fillText(ch, pos[i] + 5, y + 7));
      // icicles below letters
      [...str].forEach((ch, i) => {
        const r = rng(i * 31 + size);
        const n = 2 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) {
          const ix = pos[i] + widths[i] * (0.2 + 0.6 * (k + r() * 0.6) / n), len = 10 + r() * 20;
          g.fillStyle = '#0a2a5c';
          g.beginPath(); g.moveTo(ix - 5.5, y - 6); g.lineTo(ix + 5.5, y - 6); g.lineTo(ix, y + len + 2); g.closePath(); g.fill();
          g.fillStyle = lin(g, 0, y - 6, 0, y + len, [[0, '#e8fbff'], [1, '#6cc6f2']]);
          g.beginPath(); g.moveTo(ix - 3.8, y - 6); g.lineTo(ix + 3.8, y - 6); g.lineTo(ix, y + len - 1); g.closePath(); g.fill();
        }
      });
      // outline
      g.strokeStyle = '#0a2a5c'; g.lineWidth = size * 0.2;
      [...str].forEach((ch, i) => g.strokeText(ch, pos[i], y));
      g.strokeStyle = '#ffffff'; g.lineWidth = size * 0.07;
      [...str].forEach((ch, i) => g.strokeText(ch, pos[i], y));
      // fill
      g.fillStyle = lin(g, 0, y - size * 0.8, 0, y, [[0, '#ffffff'], [0.35, '#c8f2ff'], [0.62, '#5ab8f5'], [1, '#2464d8']]);
      [...str].forEach((ch, i) => g.fillText(ch, pos[i], y));
      // inner gloss
      g.save();
      g.beginPath(); g.rect(0, y - size * 0.8, w, size * 0.32); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      [...str].forEach((ch, i) => g.fillText(ch, pos[i], y));
      g.restore();
      // snow caps
      [...str].forEach((ch, i) => {
        const r = rng(i * 17 + size * 3);
        const top = y - size * 0.74, cx = pos[i] + widths[i] / 2, cw = widths[i] * 0.78;
        g.fillStyle = '#0a2a5c';
        g.beginPath(); g.ellipse(cx, top, cw / 2 + 3, 9 + 3, 0, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(cx, top, cw / 2, 9, 0, Math.PI, 0);
        for (let k = 0; k <= 4; k++) { const bx = cx + cw / 2 - k * cw / 4; g.quadraticCurveTo(bx + cw / 8, top + 4 + r() * 6, bx, top + 1); }
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(170,215,255,0.8)'; g.beginPath(); g.ellipse(cx + cw * 0.12, top - 1, cw * 0.28, 2.2, 0, 0, Math.PI); g.fill();
      });
    });
    return { c, w, h };
  }

  return { RS, MATS, TINTS, FONT, T, rng, rr, lin, mk, buildWall, buildBG, platform, sign, text, hero, pose, logo, star, star5 };
})();
