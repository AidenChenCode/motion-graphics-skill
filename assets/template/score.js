/* =====================================================================
   score.js — 默认配乐（A 小调，120 BPM），与 scenes.js 共用 TL，切点上的声音由构造保证同步
     启动：三声 blip、低频嗡鸣、点火噪声上扬、冲击环低频下落
     星座：抽吸垫音 + 底鼓/hat + 贝斯八分 + 琶音，末尾 riser
     词卡：每张一个和弦重击 + 4 拍垫音，鼓组加拍手；切场前短 sweep
     蓝图：明亮垫音 + 马林巴旋律 + 走针滴答；基本件落地木鱼；字母盖下上行铃音；末尾 riser + 加密 hat
     揭示：大落点 + 宽垫音 + 铃音 + 轻鼓；标语打字 click；收尾垫音 + 收尾铃音；总淡出
   要换曲风：改这里的乐器/音高/节奏；乐器定义在 engine.js 的 makeKit。
   ===================================================================== */
'use strict';
PROJECT.score = kit => {
  const { kick, hat, clap, bass, pluck, bell, marimba, pad, riser, sweep, stab, impact, blip, click, tick, tone, noise, N, NOTE } = kit;
  const eighth = BEAT / 2;
  kit.fadeOut(TL.fade, TL.end - 0.1);

  // ---------- 启动 ----------
  [[b(0.5), 1300], [b(1.1), 1750], [b(1.7), 2300]].forEach(([t, f]) => blip(t, f));
  tone({ f: NOTE(N.A1), type: 'sine', t: 0, dur: TL.cards[0] + 0.2, g: 0.14, a: 1.5, d: 1, s: 1, r: 1.0 });
  tone({ f: 42, type: 'sine', t: TL.ignite, dur: b(4), g: 0.22, a: 0.9, d: 0.4, s: 0.6, r: 0.6 });
  noise({ t: TL.ignite, dur: b(4), g: 0.1, a: b(3.2), r: 0.3, f: 5000, fEnd: 9000, wet: 0.4 });
  tone({ f: 130, pitchTo: 58, pitchDur: 0.25, t: TL.ring, dur: 0.5, g: 0.45, a: 0.003, d: 0.4, s: 0.0001, r: 0.05 });
  noise({ t: TL.ring, dur: 0.5, g: 0.1, f: 2000, r: 0.45, wet: 0.5 });
  pad(b(0.8), TL.cards[0] - b(0.8) - 0.2, [N.A3, N.E4], 0.045, 500, 900);

  // ---------- 星座 ----------
  const grooveEnd = TL.cards[0] - BEAT;
  pad(TL.constel, TL.cards[0] - TL.constel, [N.A3, N.C4, N.E4], 0.07, 800, 1800, true);
  for (let t = TL.constel; t < grooveEnd - 0.01; t += BEAT) { kick(t, 0.6); hat(t + eighth); }
  const bassA = [N.A1, N.A1, N.A2, N.A1, N.A1, N.A1, N.A2, N.C2];
  for (let i = 0, t = TL.constel; t < grooveEnd - 0.01; i++, t += eighth) bass(t, bassA[i % 8]);
  const arpA = [N.A4, N.C5, N.E5, N.A5, N.G5, N.E5, N.D5, N.C5];
  for (let i = 0, t = TL.constel + b(4); t < grooveEnd - 0.01; i++, t += eighth) pluck(t, arpA[i % 8], 0.12);
  riser(TL.cards[0] - b(3), b(3), 0.32);

  // ---------- 词卡（和弦 F / G / Am 轮换）----------
  const chords = [[N.F3, N.A3, N.C4, N.F4], [N.G3, N.B3, N.D4, N.G4], [N.A3, N.C4, N.E4, N.A4]];
  const padChords = [[N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.G4], [N.A3, N.C4, N.E4, N.G4]];
  const bassB = [[N.F1, N.F1, N.F2, N.F1, N.F1, N.F1, N.F2, N.A1], [N.G2 - 12, N.G2 - 12, N.G2, N.G2 - 12, N.G2 - 12, N.G2 - 12, N.G2, N.G2 - 12], [N.A1, N.A1, N.A2, N.A1, N.A1, N.A1, N.A2, N.E2]];
  const arpB = [[N.F4, N.A4, N.C5, N.F5, N.E5, N.C5, N.A4, N.G4], [N.G4, N.B4, N.D5, N.G5, N.D5, N.B4, N.G4, N.D4], [N.A4, N.C5, N.E5, N.A5, N.E5, N.C5, N.A4, N.E4]];
  TL.cards.forEach((tc, c) => {
    const k = c % 3;
    stab(tc, chords[k]); pad(tc, TL.cardDur, padChords[k], 0.075, 900, 2000, true);
    for (let i = 0, t = tc; i < 8; i++, t += eighth) { if (t < TL.cardsEnd - b(0.8)) bass(t, bassB[k][i]); pluck(t, arpB[k][i], 0.11); }
  });
  for (let t = TL.cards[0], i = 0; t < TL.cardsEnd - 0.01; t += BEAT, i++) {
    if (t < TL.cardsEnd - BEAT) kick(t, 0.75);
    hat(t + eighth, 0.13); hat(t + BEAT / 4, 0.05, 0.03); hat(t + BEAT * 0.75, 0.05, 0.03);
    if (i % 2 === 1) clap(t);
  }
  sweep(TL.cardsEnd - BEAT, BEAT, 0.22);

  // ---------- 蓝图 ----------
  pad(TL.blueprint, TL.reveal - TL.blueprint, [N.C4, N.E4, N.G4, N.B4], 0.05, 1600, 2600);
  const mel = [N.C5, N.E5, N.G5, N.A5, N.G5, N.E5, N.D5, N.C5, N.E5, N.G5, N.C6, N.A5, N.G5, N.E5, N.D5, N.E5];
  for (let i = 0, t = TL.blueprint; t < TL.blueprint + b(10) - 0.01; i++, t += eighth) { marimba(t, mel[i % 16], 0.17); click(t + BEAT / 4, 1900, 0.06); }
  for (const t of [TL.blueprint, TL.blueprint + b(4), TL.blueprint + b(8)]) kick(t, 0.5, 140, 50);
  TL.primIn.forEach((t, i) => tick(t, 420 - i * 60, 260 - i * 40));
  const scale = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6];
  if (SPEC.brand.latin) TL.letters.forEach((t, i) => { bell(t, scale[i % 8] + 12 * Math.floor(i / 8), 0.22, 0.6); noise({ t, dur: 0.05, g: 0.12, f: 3500, r: 0.04 }); });
  noise({ t: TL.morph, dur: 0.5, g: 0.12, type: 'bandpass', f: 600, fEnd: 3500, q: 1, r: 0.3, wet: 0.3 });
  noise({ t: TL.outline, dur: 0.6, g: 0.07, type: 'bandpass', f: 2500, fEnd: 5000, q: 2, r: 0.3 });
  tone({ f: NOTE(N.C4), type: 'triangle', t: TL.flood, dur: 0.8, g: 0.18, a: 0.3, d: 0.2, s: 0.6, r: 0.3, wet: 0.4 });
  riser(TL.reveal - b(4.4), b(4.4), 0.36);
  for (let t = TL.reveal - b(4); t < TL.reveal - 0.01; t += BEAT / 4) hat(t, 0.06 + (t - (TL.reveal - b(4))) * 0.05, 0.03);
  for (let t = TL.reveal - b(2); t < TL.reveal - 0.01; t += BEAT / 8) hat(t, 0.06 + (t - (TL.reveal - b(2))) * 0.08, 0.02);

  // ---------- 揭示 ----------
  impact(TL.reveal);
  pad(TL.reveal, TL.outro - TL.reveal + 0.1, [N.F2, N.F3, N.A3, N.C4, N.E4, N.G4], 0.14, 1200, 3200);
  bell(TL.reveal + 0.02, N.E6, 0.22, 1.2);
  for (let t = TL.reveal + b(2); t < TL.outro - 0.01; t += b(2)) kick(t, 0.6, 152, 48);
  for (let t = TL.reveal + BEAT; t < TL.outro - 0.01; t += BEAT) hat(t, 0.09, 0.035);
  const arpC = [N.F4, N.A4, N.C5, N.E5, N.F5, N.E5, N.C5, N.A4], bassC = [N.F1, N.F1, N.F2, N.F1, N.F1, N.F1, N.F2, N.A1];
  for (let i = 0, t = TL.reveal + BEAT; t < TL.outro - 0.01; i++, t += eighth) { pluck(t, arpC[i % 8], 0.12, 0.3); bass(t, bassC[i % 8], 0.22, 0.18); }
  if (SPEC.brand.cn && SPEC.brand.latin) noise({ t: TL.cn, dur: 0.6, g: 0.12, type: 'bandpass', f: 700, fEnd: 3200, q: 1, r: 0.35, wet: 0.3 });
  if (SPEC.brand.tagline) for (let i = 0; i < SPEC.brand.tagline.length; i++) click(TL.tagline + i * 0.075, 3600, 0.07);
  if (SPEC.brand.taglineEn) tone({ f: NOTE(N.G4), type: 'triangle', t: TL.en, dur: 1.4, g: 0.1, a: 0.5, d: 0.3, s: 0.6, r: 0.5, wet: 0.5 });

  // ---------- 收尾 ----------
  pad(TL.outro, TL.end - TL.outro - 0.2, [N.C3, N.G3, N.E4, N.D5], 0.09, 1000, 1800);
  bell(TL.ping, N.E6, 0.22, 1.0); bell(TL.ping + 0.005, N.A5, 0.08, 0.8);
};
