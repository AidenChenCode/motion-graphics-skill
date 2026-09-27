/* =====================================================================
   scenes.js — 默认分镜（五幕，3 张词卡时 30 s @ 120 BPM），全部由 SPEC / TL 驱动
     0 启动    ：HUD 打字机日志 → 火花点火 → 冲击环
     1 星座    ：光点从中心飞出 → 连线成网 → 流光拖尾 → 内爆回中心
     2 词卡    ：N 张概念词卡（乱码入场 + RGB 分离 + 纸屑 + 冲击环）
     3 蓝图    ：浅色底 + 网格；三个基本件被标注 → 游标沿弧线逐字母"盖下" → 变形成字标 → 描边 → 主色灌入成徽标
     4 揭示/收尾：白闪 + 镜头光条，徽标匹配剪辑落位，中文名模糊入场，标语逐字打出，整体缩小，淡出
   要改分镜：改这个文件（配合 references/effects-cookbook.md），时间点一律引用 TL，不写死秒数。
   ===================================================================== */
'use strict';
const b = n => n * BEAT;
const PRIM = hexRGB(C.primary), ACC = hexRGB(C.accent), PAPER = hexRGB(C.paper), DARK = hexRGB(C.dark);
const PRIM_G = PRIM.map(v => Math.min(1, v * 0.9 + 0.15));                  // 主色的发光版
const PRIM_DARK = '#' + PRIM.map(v => Math.round(v * 140).toString(16).padStart(2, '0')).join('');
const LATIN = (SPEC.brand.latin || '').toLowerCase();
const NL = Math.max(LATIN.length, 1);
const SLOT_W = Math.min(158, 1000 / NL), GK = 1.3 * SLOT_W / 158, BASE_Y = 640;   // 蓝图字母槽宽 / 字框缩放 / 基线
if (!SPEC.brand.wordmarkWidth) SPEC.brand.wordmarkWidth = LATIN ? Math.round(NL * SLOT_W * 0.95) : 600;
const cardOf = t => { for (let i = SPEC.words.length - 1; i >= 0; i--) if (t >= TL.cards[i]) return i; return -1; };
const inCards = t => t >= TL.cards[0] && t < TL.cardsEnd;

// ---- 外观：底色 / 颗粒 / 暗角 / 主题（HUD 据此选前景色）------------------------
PROJECT.look = t => {
  if (t >= TL.blueprint && t < TL.reveal) return { bg: PAPER, grain: 0.022, vig: 0.22, theme: 'light' };
  if (inCards(t)) {
    if (SPEC.words[cardOf(t)].onPrimary) return { bg: PRIM, grain: 0.03, vig: 0.35, theme: 'primary' };
    return { bg: [0.043, 0.043, 0.063], grain: 0.05, vig: 0.55, theme: 'dark' };
  }
  return { bg: DARK, grain: 0.05, vig: 0.55, theme: 'dark' };
};

// ---- 粒子数据（种子固定，位置是 t 的闭式函数）-----------------------------------
const DUST = (() => { const R = mulberry32(SPEC.seed + 11); const a = []; for (let i = 0; i < 240; i++) a.push({ x: R() * W, y: R() * H, s: 1.2 + R() * 2.4, p1: R() * 6.28, p2: R() * 6.28, sp: 0.4 + R() }); return a; })();
const NODES = (() => {
  const R = mulberry32(SPEC.seed + 23); const a = [];
  for (let i = 0; i < 84; i++) { const ang = R() * 6.283, rad = Math.sqrt(R()); a.push({ tx: CX + Math.cos(ang) * rad * W * 0.375, ty: CY + Math.sin(ang) * rad * H * 0.333, birth: TL.constel + i * 0.04, prim: R() < 0.22, p: R() * 6.28, s: 2.2 + R() * 2.5 }); }
  return a;
})();
const STREAKS = (() => { const R = mulberry32(SPEC.seed + 37); const a = []; for (let i = 0; i < 6; i++) a.push({ A: 380 + R() * 420, B: 160 + R() * 220, fa: 0.55 + R() * 0.5, fb: 0.75 + R() * 0.7, pa: R() * 6.28, pb: R() * 6.28, birth: TL.constel + 0.4 + i * 0.35 }); return a; })();
const BURST = (() => { const R = mulberry32(SPEC.seed + 51); const a = []; for (let i = 0; i < 170; i++) a.push({ ang: R() * 6.283, v: 420 + R() * 1300, s: 6 + R() * 16, k: R() }); return a; })();
const CONFETTI = (() => { const R = mulberry32(SPEC.seed + 67); const a = []; for (let i = 0; i < 90; i++) a.push({ ang: R() * 6.283, v: 300 + R() * 900, s: 8 + R() * 14, rot: R() * 6.28, spin: (R() - 0.5) * 14, k: R() }); return a; })();

const dustAlpha = t => t < TL.blueprint ? 1 - sat(t, TL.blueprint - 0.3, 0.3) : t < TL.reveal ? 0 : 0.75 * sat(t, TL.reveal, 0.6) * (1 - sat(t, TL.fade, 0.8));
const nodePos = (n, t, imp) => {
  const age = t - n.birth, u = easeOutExpo(clamp(age / 1.3));
  const x = CX + (n.tx - CX) * u + 10 * Math.sin(t * 0.9 + n.p), y = CY + (n.ty - CY) * u + 8 * Math.cos(t * 0.7 + n.p * 2);
  return { x: lerp(x, CX, imp), y: lerp(y, CY, imp), age };
};
// 揭示阶段徽标的几何：从蓝图位置 (580, s=1) 落到揭示位置 (600, s=0.72)，收尾再整体缩小
function revealGeom(t) {
  const u = spring(t - TL.reveal, 9, 0.62), outroS = 1 - 0.12 * easeInOut(sat(t, TL.outro, 1.0));
  return { gy: lerp(580, 600, u), gs: lerp(1, 0.72, u) * outroS };
}
function pingPos(t) { const g = revealGeom(t), r = badgeRect(CX, g.gy, g.gs); return { x: r.x + r.w, y: r.y }; }

// =====================================================================
//  GL 光效层
// =====================================================================
PROJECT.fx = t => {
  const G = GL;
  const da = dustAlpha(t);
  if (da > 0) for (const d of DUST) {
    const x = d.x + 14 * Math.sin(t * 0.21 * d.sp + d.p1), y = d.y + 9 * Math.cos(t * 0.17 * d.sp + d.p2);
    const tw = 0.35 + 0.35 * Math.sin(t * 1.7 * d.sp + d.p1 * 3);
    G.sprite(x, y, d.s * 2.6, d.s * 2.6, 1, 0.93, 0.82, tw * da * 0.35, 0, 1);
  }
  // 点火
  if (t >= TL.ignite && t < TL.constel + 0.2) {
    const age = t - TL.ignite;
    const flick = 0.85 + 0.15 * Math.sin(age * 41) * Math.sin(age * 13.7), pulse = 1 + 0.12 * Math.sin(age * 6.28 * 2);
    const br = easeOutCubic(sat(t, TL.ignite, 0.5)) * flick * (1 - sat(t, TL.constel, 0.2));
    G.sprite(CX, CY, 150 * pulse * br, 150 * pulse * br, 1, 0.72, 0.4, 0.55 * br, 0, 0);
    G.sprite(CX, CY, 46 * br, 46 * br, 1, 0.85, 0.6, 0.9 * br, 0, 0);
    G.sprite(CX, CY, 9 * br, 9 * br, 1, 1, 1, 1.4 * br, 0, 1);
    G.sprite(CX, CY, 260 * br, 3 * br, 1, 0.8, 0.5, 0.35 * br, 0, 2);
  }
  // 星座
  if (t >= TL.constel && t < TL.cards[0]) {
    const imp = easeInCubic(sat(t, TL.implode, TL.cards[0] - TL.implode)), bright = 1 + imp * 1.6;
    const pos = NODES.map(n => t < n.birth ? null : nodePos(n, t, imp));
    NODES.forEach((n, i) => {
      const p = pos[i]; if (!p) return;
      const a = clamp(p.age / 0.4) * bright, c = n.prim ? PRIM_G : ACC;
      G.glow(p.x, p.y, (n.s * 7.5) * (1 - imp * 0.5), c[0], c[1], c[2], 0.85 * a, 1.1);
    });
    const linkR = 200 * (1 - imp * 0.7);
    for (let i = 0; i < NODES.length; i++) {
      if (!pos[i]) continue;
      for (let j = i + 1; j < NODES.length; j++) {
        if (!pos[j]) continue;
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y); if (d > linkR) continue;
        const a = 0.75 * (1 - d / linkR) * clamp(Math.min(pos[i].age, pos[j].age) / 0.6) * (1 - imp * 0.6);
        G.line(pos[i].x, pos[i].y, pos[j].x, pos[j].y, ACC[0], ACC[1] * 0.92, ACC[2] * 0.9, a);
      }
    }
    for (const s of STREAKS) {
      if (t < s.birth) continue;
      const path = tk => ({ x: lerp(CX + s.A * Math.sin(tk * s.fa + s.pa), CX, imp), y: lerp(CY + s.B * Math.sin(tk * s.fb + s.pb), CY, imp) });
      G.trail(t, path, 18, 0.022, 16, ACC[0], ACC[1], ACC[2] * 0.7, 0.5 * sat(t, s.birth, 0.5));
    }
    if (imp > 0) { const ig = Math.sqrt(imp); G.sprite(CX, CY, 60 + 340 * ig, 60 + 340 * ig, 1, 0.75, 0.45, 0.6 * ig, 0, 0); G.sprite(CX, CY, 8 + 30 * ig, 8 + 30 * ig, 1, 1, 1, 1.5 * ig, 0, 1); }
  }
  // 词卡爆发
  TL.cards.forEach((tb, c) => {
    const tau = t - tb; if (tau < 0 || tau > 1.6) return;
    const onP = SPEC.words[c].onPrimary;
    for (const p of BURST) {
      const r = p.v * (1 - Math.exp(-3.2 * tau)) / 3.2;
      const x = CX + Math.cos(p.ang) * r * 1.35, y = CY + Math.sin(p.ang) * r * 0.75;
      const a = Math.pow(clamp(1 - tau / 1.4), 1.6), col = onP ? [1, 0.97, 0.9] : (p.k < 0.3 ? PRIM_G : ACC);
      const sz = p.s * (1 - tau * 0.45);
      G.sprite(x, y, sz * 2.2, sz * 0.9, col[0], col[1], col[2], 0.8 * a, p.ang, 2);
    }
    const fl = Math.exp(-tau * 7);
    G.sprite(CX, CY, 700 * (0.4 + fl), 700 * (0.4 + fl), 1, 0.85, 0.7, (onP ? 0.55 : 0.75) * fl, 0, 0);
  });
  // 揭示：镜头光条 + 徽标底光 + 环绕光点 + 收尾光点
  if (t >= TL.reveal) {
    const tau = t - TL.reveal, fl = Math.exp(-tau * 5.5), endFade = 1 - sat(t, TL.fade, 0.8);
    G.sprite(CX, 600, 1100 * (0.5 + fl), 34, 1, 0.9, 0.85, 1.6 * fl, 0, 2);
    G.sprite(CX, 600, 60, 700 * fl, 1, 0.85, 0.8, 0.7 * fl, 0, 2);
    G.sprite(CX, 600, 520 * (0.6 + fl), 520 * (0.6 + fl), 1, 0.7, 0.6, 0.8 * fl, 0, 0);
    const breathe = 0.11 + 0.03 * Math.sin(tau * 3.14);
    G.sprite(CX, 600, 620, 250, Math.min(1, PRIM[0] * 1.2), PRIM[1], PRIM[2], breathe * sat(tau, 0, 0.8) * endFade, 0, 0);
    const oa = sat(tau, 0.15, 0.4) * (1 - sat(t, TL.fade - 0.4, 1.0));
    if (oa > 0) {
      const tilt = -0.2, rx = 560, ry = 150;
      const path = tk => { const th = 0.9 - tk * 6.283 * 0.42, ex = rx * Math.cos(th), ey = ry * Math.sin(th); return { x: CX + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: 600 + ex * Math.sin(tilt) + ey * Math.cos(tilt) }; };
      G.trail(tau, path, 24, 0.02, 22, ACC[0], ACC[1], ACC[2] * 0.7, 0.55 * oa);
      const h = path(tau); G.sprite(h.x, h.y, 60, 60, ACC[0], ACC[1], ACC[2] * 0.7, 0.35 * oa, 0, 0);
    }
    if (t >= TL.ping) { const p = t - TL.ping, e = Math.exp(-p * 3), pp = pingPos(t); G.sprite(pp.x, pp.y, 40 + 120 * (1 - e), 40 + 120 * (1 - e), PRIM_G[0], PRIM_G[1], PRIM_G[2], 0.5 * e, 0, 0); G.sprite(pp.x, pp.y, 6, 6, 1, 1, 1, 1.2 * e, 0, 1); }
  }
};

// =====================================================================
//  2D 图形层
// =====================================================================
function sceneBoot(t) {
  const out = 1 - sat(t, TL.constel - 0.2, 0.35); if (out <= 0) return;
  const lines = SPEC.boot || [], starts = [b(0.4), b(1.6), b(2.8), b(4.2)];
  ui.save(); ui.globalAlpha = out;
  lines.forEach((s, i) => {
    const t0 = starts[i] ?? b(4.2); if (t < t0) return;
    const n = Math.min(s.length, Math.floor((t - t0) / 0.45 * s.length));
    const cur = (n < s.length && Math.floor(t * 4) % 2 === 0) ? '▌' : '';
    txt(s.slice(0, n) + cur, 30, 44 + i * 26, { font: `500 15px ${MONO}`, color: '#fff', alpha: 0.75, ls: 1 });
  });
  if (t >= TL.ignite) {
    const u = sat(t, TL.ignite, 0.6);
    ui.strokeStyle = '#fff'; ui.lineWidth = 1; ui.globalAlpha = out * 0.4;
    ui.beginPath(); ui.arc(CX, CY, 74, -Math.PI / 2, -Math.PI / 2 + 6.283 * easeOutCubic(u)); ui.stroke();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + t * 0.4; ui.beginPath(); ui.moveTo(CX + Math.cos(a) * 82, CY + Math.sin(a) * 82); ui.lineTo(CX + Math.cos(a) * 96, CY + Math.sin(a) * 96); ui.stroke(); }
    if (SPEC.sparkLabel && t > TL.ignite + 0.6) txt(SPEC.sparkLabel, CX + 118, CY + 5, { font: `500 12px ${MONO}`, alpha: 0.6 * out * sat(t, TL.ignite + 0.6, 0.3), ls: 2 });
  }
  ui.restore();
  ring2d(CX, CY, TL.ring, t, `rgba(${PRIM_G.map(v => Math.round(v * 255)).join(',')},0.9)`, 520, 1.2, 2.5);
  ring2d(CX, CY, TL.ring + 0.12, t, 'rgba(255,200,120,0.7)', 380, 1.0, 1.5);
}

function sceneConstel(t) {
  if (t < TL.constel || t >= TL.cards[0]) return;
  const imp = sat(t, TL.implode, 0.6), fade = 1 - imp;
  ui.save(); ui.globalAlpha = fade;
  const born = NODES.filter(n => t >= n.birth).length;
  txt(`NODES ${pad2(born)} / ${NODES.length}`, CX, 92, { font: `500 13px ${MONO}`, align: 'center', alpha: 0.6, ls: 3 });
  txt('LINKING', CX, 112, { font: `500 11px ${MONO}`, align: 'center', alpha: 0.35, ls: 4 });
  for (const i of [7, 31, 58]) {
    const n = NODES[i]; if (t < n.birth + 1.3) continue;
    const a = sat(t, n.birth + 1.3, 0.4), p = nodePos(n, t, 0);
    ui.strokeStyle = '#fff'; ui.globalAlpha = fade * 0.45 * a; ui.lineWidth = 1;
    ui.beginPath(); ui.arc(p.x, p.y, 16, 0, 6.283); ui.stroke();
    ui.beginPath(); ui.moveTo(p.x + 16, p.y); ui.lineTo(p.x + 40, p.y - 18); ui.lineTo(p.x + 92, p.y - 18); ui.stroke();
    txt(`N-${pad2(i)}`, p.x + 44, p.y - 23, { font: `500 11px ${MONO}`, alpha: 0.8, ls: 2 });
  }
  ui.restore();
  ring2d(CX, CY, TL.constel + b(2), t, 'rgba(255,200,120,0.5)', 640, 1.4, 1.2);
  ring2d(CX, CY, TL.constel + b(6), t, `rgba(${PRIM_G.map(v => Math.round(v * 255)).join(',')},0.6)`, 640, 1.4, 1.2);
  if (imp > 0) ring2d(CX, CY, TL.implode + 0.3, t, 'rgba(255,220,180,0.6)', 200, 0.5, 2);
}

function sceneCards(t, frame) {
  if (!inCards(t)) return;
  const c = cardOf(t), card = SPEC.words[c], tau = t - TL.cards[c], last = c === SPEC.words.length - 1, onP = !!card.onPrimary;
  const p = sat(tau, 0, 0.3), sc = 0.94 + 0.06 * spring(tau, 14, 0.5);
  const exitZoom = last ? 1 + 0.08 * easeInCubic(sat(t, TL.cardsEnd - 0.4, 0.4)) : 1;
  ui.save();
  ui.translate(CX, CY); ui.scale(sc * exitZoom, sc * exitZoom); ui.translate(-CX, -CY);
  txt(pad2(c + 1), W - 140, 900, { font: `800 720px ${SANS}`, color: onP ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.08)', align: 'right', ls: -30 });
  const rw = 560 * easeOutExpo(sat(tau, 0.05, 0.5));
  ui.strokeStyle = onP ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)'; ui.lineWidth = 1.5;
  ui.beginPath(); ui.moveTo(CX - rw, 396); ui.lineTo(CX + rw, 396); ui.moveTo(CX - rw, 634); ui.lineTo(CX + rw, 634); ui.stroke();
  txt(`${pad2(c + 1)}  /  ${pad2(SPEC.words.length)}`, CX, 372, { font: `500 15px ${MONO}`, align: 'center', alpha: 0.7 * sat(tau, 0.1, 0.3), ls: 6 });
  const word = p < 1 ? scramble(card.cn, CN_POOL, p, frame, c * 999) : card.cn;
  const dx = 22 * (1 - p), fontCN = `600 250px ${CN}`;
  if (dx > 0.5) {
    txt(word, CX - dx, 592, { font: fontCN, color: onP ? 'rgba(255,240,200,0.7)' : `rgba(${PRIM_G.map(v => Math.round(v * 255)).join(',')},0.75)`, align: 'center', ls: 12 });
    txt(word, CX + dx, 592, { font: fontCN, color: onP ? 'rgba(0,0,0,0.45)' : 'rgba(60,240,255,0.75)', align: 'center', ls: 12 });
  }
  txt(word, CX, 592, { font: fontCN, color: '#fff', align: 'center', ls: 12 });
  const en = p < 1 ? scramble(card.en, EN_POOL, p, frame, c * 77 + 5) : card.en;
  txt(en, CX, 700, { font: `500 40px ${SANS}`, color: onP ? 'rgba(255,255,255,0.85)' : C.accent, align: 'center', ls: 18, alpha: sat(tau, 0.08, 0.3) });
  if (last) { const uw = 300 * easeOutExpo(sat(tau, 0.4, 0.5)); ui.fillStyle = onP ? '#fff' : C.primary; ui.fillRect(CX - uw / 2, 726, uw, 6); }
  ui.restore();
  ui.save();
  for (const q of CONFETTI) {
    if (tau > 1.7) break;
    const r = q.v * (1 - Math.exp(-2.6 * tau)) / 2.6;
    const x = CX + Math.cos(q.ang) * r * 1.4, y = CY + Math.sin(q.ang) * r * 0.8 + 260 * tau * tau;
    const col = onP ? (q.k < 0.5 ? '#fff' : q.k < 0.8 ? C.accent : PRIM_DARK) : (q.k < 0.4 ? '#fff' : q.k < 0.75 ? C.accent : C.primary);
    ui.globalAlpha = clamp(1 - (tau - 1.0) / 0.7); ui.fillStyle = col;
    ui.translate(x, y); ui.rotate(q.rot + q.spin * tau);
    ui.beginPath(); ui.moveTo(0, -q.s * 0.6); ui.lineTo(q.s * 0.55, q.s * 0.4); ui.lineTo(-q.s * 0.55, q.s * 0.4); ui.closePath(); ui.fill();
    ui.setTransform(1, 0, 0, 1, 0, 0);
  }
  ui.restore();
  ring2d(CX, CY, TL.cards[c], t, onP ? 'rgba(255,255,255,0.8)' : 'rgba(255,200,140,0.8)', 1100, 0.9, 3);
}

function sceneBlueprint(t, frame) {
  if (t < TL.blueprint || t >= TL.reveal) return;
  const gw = W * easeOutExpo(sat(t, TL.blueprint, 0.9));
  ui.save(); ui.strokeStyle = C.ink; ui.lineWidth = 1;
  for (let x = 0; x <= gw; x += 60) { ui.globalAlpha = x % 240 === 0 ? 0.11 : 0.05; ui.beginPath(); ui.moveTo(x, 0); ui.lineTo(x, H); ui.stroke(); }
  for (let y = 0; y <= H; y += 60) { ui.globalAlpha = y % 240 === 0 ? 0.11 : 0.05; ui.beginPath(); ui.moveTo(0, y); ui.lineTo(gw, y); ui.stroke(); }
  ui.restore();
  if (SPEC.blueprintTitle) txt(SPEC.blueprintTitle, CX, 140, { font: `500 13px ${MONO}`, color: C.ink, align: 'center', alpha: 0.55 * sat(t, TL.blueprint + 0.2, 0.4), ls: 5 });

  // 阶段 A：三个基本件
  const primOut = easeInBack(sat(t, TL.primOut, 0.2));
  if (primOut < 1) {
    const prims = [
      { x: CX - 400, c: A(0, 0, 70, -P / 2, 1.5 * P), t0: TL.primIn[0] },
      { x: CX, c: L(0, -100, 0, 100), t0: TL.primIn[1] },
      { x: CX + 400, c: L(-80, -75, 0, 75), c2: L(0, 75, 80, -75), t0: TL.primIn[2] },
    ];
    prims.forEach((p, i) => {
      if (t < p.t0) return;
      const age = t - p.t0, s = (0.6 + 0.4 * spring(age, 15, 0.45)) * (1 - primOut), lab = (SPEC.primitives || [])[i] || {};
      ui.save(); ui.translate(p.x, 500); ui.scale(s, s); ui.globalAlpha = sat(age, 0, 0.1);
      drawPart(p.c, easeOutCubic(sat(age, 0, 0.35)), 22); if (p.c2) drawPart(p.c2, easeOutCubic(sat(age, 0.15, 0.35)), 22);
      ui.restore();
      const la = sat(age, 0.3, 0.3) * (1 - primOut);
      if (lab.label) txt(lab.label, p.x, 655, { font: `600 18px ${SANS}`, color: C.ink, align: 'center', alpha: la, ls: 4 });
      if (lab.spec) txt(lab.spec, p.x, 682, { font: `500 12px ${MONO}`, color: C.gray || '#7A7A80', align: 'center', alpha: la, ls: 2 });
      ui.save(); ui.globalAlpha = la * 0.6; dim(p.x - 90, 405, p.x + 90, 405, '', 1); ui.restore();
    });
  }

  // 阶段 B：游标沿弧线走过，逐字母盖下
  const morph = sat(t, TL.morph, 0.5), primWordA = 1 - morph;
  if (t >= TL.build - 0.3 && primWordA > 0) {
    const x0 = CX - (NL - 1) / 2 * SLOT_W, x1 = CX + (NL - 1) / 2 * SLOT_W;
    const u = clamp((t - TL.build) / (TL.morph - TL.build - 0.2));
    ui.save(); ui.globalAlpha = primWordA * sat(t, TL.build - 0.3, 0.3) * 0.5;
    ui.setLineDash([3, 9]); ui.strokeStyle = C.ink; ui.lineWidth = 1.2;
    ui.beginPath(); ui.moveTo(x0, 420); ui.quadraticCurveTo(CX, 200, x1, 420); ui.stroke(); ui.setLineDash([]);
    ui.restore();
    const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * CX + u * u * x1, by = (1 - u) * (1 - u) * 420 + 2 * (1 - u) * u * 200 + u * u * 420;
    if (t < TL.morph + 0.3) {
      const fa = sat(t, TL.build - 0.3, 0.3) * (1 - sat(t, TL.morph, 0.3));
      ui.save(); ui.globalAlpha = fa; ui.fillStyle = C.primary; ui.beginPath(); ui.arc(bx, by, 14, 0, 6.283); ui.fill();
      ui.strokeStyle = C.primary; ui.lineWidth = 1; ui.globalAlpha = fa * 0.5; ui.beginPath(); ui.arc(bx, by, 24, 0, 6.283); ui.stroke(); ui.restore();
      txt('CURSOR', bx, by - 34, { font: `500 11px ${MONO}`, color: C.primary, align: 'center', alpha: fa * 0.8, ls: 3 });
    }
    ui.save(); ui.globalAlpha = primWordA;
    for (let i = 0; i < LATIN.length; i++) {
      const tb = TL.letters[i]; if (t < tb) continue;
      drawGlyph(LATIN[i], CX + (i - (NL - 1) / 2) * SLOT_W - 50 * GK, BASE_Y - 120 * GK, GK, t - tb);
      ring2d(CX + (i - (NL - 1) / 2) * SLOT_W, BASE_Y - 50, tb, t, `rgba(${PRIM.map(v => Math.round(v * 255)).join(',')},0.5)`, 90, 0.5, 1.5);
    }
    ui.restore();
    const la = sat(t, TL.letters[TL.letters.length - 1] + 0.2, 0.3) * primWordA;
    if (la > 0 && LATIN) { ui.save(); ui.globalAlpha = la * 0.7; dim(x0 - SLOT_W / 2, 700, x1 + SLOT_W / 2, 700, `W ${Math.round(NL * SLOT_W)}`, 1); ui.restore(); }
  }

  // 阶段 C：正式字标 → 描边 → 主色灌入
  if (t >= TL.morph) {
    const r = badgeRect(CX, 580, 1), holdScale = 1 + 0.05 * easeInCubic(sat(t, TL.reveal - 0.3, 0.3));
    ui.save(); ui.translate(CX, 580); ui.scale(holdScale, holdScale); ui.translate(-CX, -580);
    const flood = easeInOut(sat(t, TL.flood, 0.55));
    ui.save(); ui.globalAlpha = morph; drawMark(CX, 580, 1, C.primary); ui.restore();
    const ou = easeInOut(sat(t, TL.outline, 0.6));
    if (ou > 0) { const per = 2 * (r.w + r.h); ui.save(); ui.strokeStyle = C.primary; ui.lineWidth = 3; ui.setLineDash([per]); ui.lineDashOffset = per * (1 - ou); rrect(r.x, r.y, r.w, r.h, r.r); ui.stroke(); ui.restore(); }
    if (flood > 0) { ui.save(); ui.beginPath(); ui.rect(r.x, r.y, r.w * flood, r.h); ui.clip(); rrect(r.x, r.y, r.w, r.h, r.r); ui.fillStyle = C.primary; ui.fill(); drawMark(CX, 580, 1, '#fff'); ui.restore(); }
    const aa = sat(t, TL.outline + 0.2, 0.4);
    if (aa > 0) {
      ui.save(); ui.globalAlpha = aa * 0.8;
      txt(`${C.primaryName || 'PRIMARY'}  ·  ${C.primary.toUpperCase()}`, r.x, r.y - 22, { font: `500 12px ${MONO}`, color: C.primary, ls: 2 });
      ui.fillStyle = C.primary; ui.fillRect(r.x + r.w - 60, r.y - 34, 60, 18);
      txt(`R ${r.r}`, r.x + r.w + 14, r.y + 16, { font: `500 12px ${MONO}`, color: C.ink, ls: 1.5 });
      dim(r.x, r.y + r.h + 34, r.x + r.w, r.y + r.h + 34, `W ${Math.round(r.w)}`, 1);
      dim(r.x - 34, r.y, r.x - 34, r.y + r.h, `H ${Math.round(r.h)}`, 1);
      ui.restore();
    }
    ui.restore();
  }
}

function sceneReveal(t) {
  if (t < TL.reveal) return;
  const { gy, gs } = revealGeom(t), endFade = 1 - sat(t, TL.fade, 0.75);
  ui.save(); ui.globalAlpha = endFade;
  drawBadge(CX, gy, gs, 1);
  const cn = SPEC.brand.cn && SPEC.brand.latin ? SPEC.brand.cn : '';
  if (cn) { const e = easeOutExpo(sat(t, TL.cn, 0.7)); if (e > 0) txt(cn, CX, 348 + (1 - e) * 30, { font: `600 200px ${CN}`, color: '#fff', align: 'center', ls: lerp(80, 14, e), alpha: e, blur: (1 - e) * 12 }); }
  if (SPEC.brand.tagline) txt(typewriter(SPEC.brand.tagline, t, TL.tagline), CX, 800, { font: `400 54px ${CN}`, color: '#fff', align: 'center', ls: 6, alpha: 0.92 });
  if (SPEC.brand.taglineEn && t >= TL.en) { const e = easeOutCubic(sat(t, TL.en, 0.6)); txt(SPEC.brand.taglineEn, CX, 852 + (1 - e) * 10, { font: `500 22px ${SANS}`, color: C.accent, align: 'center', ls: 9, alpha: e * 0.9 }); }
  if (SPEC.hud && SPEC.hud.credits && t >= TL.outro + 0.5) txt(SPEC.hud.credits, CX, 960, { font: `500 12px ${MONO}`, color: '#fff', align: 'center', ls: 3, alpha: sat(t, TL.outro + 0.5, 0.8) * 0.5 });
  ui.restore();
  ring2d(CX, 600, TL.reveal, t, 'rgba(255,255,255,0.7)', 1200, 0.8, 3);
  const pp = pingPos(t); ring2d(pp.x, pp.y, TL.ping, t, `rgba(${PRIM_G.map(v => Math.round(v * 255)).join(',')},0.8)`, 160, 0.9, 1.5);
}

PROJECT.draw = (t, frame) => { sceneBoot(t); sceneConstel(t); sceneCards(t, frame); sceneBlueprint(t, frame); sceneReveal(t); };
PROJECT.overlay = t => { flash(t, TL.blueprint); flash(t, TL.reveal); fadeBlack(t, TL.fade, 0.8); };
