/* =====================================================================
   spec.js — 项目配置：改这一个文件就能出一支新片（品牌、配色、文案、节奏、HUD）
   时间表 TL 以"拍"为单位定义，改 bpm 或增减词卡时自动重排；scenes.js / score.js 都只引用 TL，不写死秒数。
   ===================================================================== */
'use strict';
const SPEC = {
  title: 'NOVA Brand Motion',
  width: 1920, height: 1080, fps: 30,
  bpm: 120,                       // 节拍：所有场景切换都落在拍点上
  seed: 20260927,                 // 所有随机的种子；改它会得到另一套粒子布局

  brand: {
    latin: 'Nova',                // 拉丁字标（蓝图场景按小写逐字母拼装；留空则跳过拼装直接用中文名）
    cn: '新星',                   // 中文名（可为空）
    tagline: '让每个想法发光',     // 主标语（逐字打出；可为空）
    taglineEn: 'LIGHT UP EVERY IDEA',   // 英文副标语（可为空）
    logo: null,                   // 官方标识图片（可选）：{ src: 'logo.png', height: 220, tint: true }
                                  //   tint=true 时按主色/白色着色（适合单色 alpha PNG）；多色 logo 设 tint:false
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    fontCN: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    wordmarkWidth: null,          // 字标目标宽度 px（默认 = 字母数 × 槽宽 × 0.95，与基本件字形对齐）
  },

  colors: {
    primary: '#1F5EFF',           // 品牌主色：徽标底、词卡底、基本件的弧线
    primaryName: 'NOVA BLUE',     // 蓝图标注里显示的色名
    ink: '#141418',               // 墨色：蓝图上的直线与标注
    gray: '#7A7A80',              // 斜线
    paper: '#F2EFE6',             // 蓝图底色（浅色场景）
    accent: '#F2C46B',            // 光效暖色（星座、拖尾、纸屑）
    dark: '#07070B',              // 暗场底色
  },

  // 概念词卡：默认 3 张（每张 4 拍）。改张数时后面的场景自动顺延。onPrimary=true 的卡用主色做满屏底
  words: [
    { cn: '探索', en: 'EXPLORE' },
    { cn: '创造', en: 'CREATE', onPrimary: true },
    { cn: '点亮', en: 'IGNITE' },
  ],

  // 启动阶段左上角的打字机日志（0–3 s）
  boot: ['> NOVA MOTION SYSTEM  v1.0', '> WEBGL2 · CANVAS2D · WEB AUDIO', '> TIMELINE @ 30 fps  ·  120 BPM', '> IGNITE'],

  hud: {
    show: true,
    topLeft: ['NOVA MOTION SYSTEM  v1.0', 'WEBGL2 · CANVAS2D · WEB AUDIO'],
    topRight: null,               // null = 自动 "1920×1080 · 30 FPS · SEED …"
    bottomLeft: 'NOVA · BRAND MOTION · 2026',
    credits: 'NOVA BRAND MOTION  ·  WEBGL2 + CANVAS2D  ·  WEB AUDIO OFFLINE RENDER  ·  HEADLESS CHROME → FFMPEG',
    headerFadeIn: 3.15,           // 左上标题在启动日志淡出后再淡入（秒）；0 = 一直显示
    spectrum: true,
  },

  // 蓝图场景里三个基本件的标签
  primitives: [
    { label: 'RING / 环', spec: 'Ø140  R70' },
    { label: 'BAR / 柱', spec: 'H200  W22' },
    { label: 'ANGLE / 角', spec: '∠ 94°' },
  ],
  blueprintTitle: 'BLUEPRINT · 基本件装配',
  sparkLabel: 'SPARK · 0.001 lm',

  music: { outGain: 0.75 },       // 输出增益：-14 LUFS 左右；verify.py 量完再微调
  scramble: null,                 // 乱码字符池 { cn: '...', en: '...' }，null 用默认
};

// ---- 时间表（单位：拍）------------------------------------------------------
const BEAT = 60 / SPEC.bpm;
function makeTimeline(S) {
  const b = n => n * BEAT;
  const nCards = S.words.length, shift = (nCards - 3) * 4;          // 每张词卡 4 拍
  const letters = (S.brand.latin || '').length;
  const step = letters ? Math.min(0.8, 4.4 / letters) : 0.8;        // 字母盖下的间隔：多字母时压缩到 4.4 拍内
  const T = {
    boot: b(0), ignite: b(2), ring: b(5),
    constel: b(6), implode: b(14.8),
    cards: Array.from({ length: nCards }, (_, i) => b(16 + i * 4)), cardDur: b(4), cardsEnd: b(16 + nCards * 4),
    blueprint: b(28 + shift), primIn: [b(28.6 + shift), b(29.4 + shift), b(30.2 + shift)], primOut: b(31.8 + shift),
    build: b(32 + shift), letters: Array.from({ length: Math.max(letters, 1) }, (_, i) => b(32.4 + shift + i * step)),
    morph: b(37.2 + shift), outline: b(39.2 + shift), flood: b(40.4 + shift),
    reveal: b(42 + shift), cn: b(44.8 + shift), tagline: b(46.8 + shift), en: b(50 + shift),
    outro: b(53 + shift), ping: b(56.8 + shift), fade: b(58 + shift), end: b(60 + shift),
  };
  return T;
}
const TL = makeTimeline(SPEC);
SPEC.duration = TL.end;           // 时长由时间表决定（120 BPM、3 张词卡 = 30.0 s）

// verify.py 的核对项：应有明显音频起音的画面切点 + 各时刻的底色类型
SPEC.verify = {
  cues: [...TL.cards, TL.reveal],
  colors: [
    { t: 0.05, kind: 'dark' },
    ...(SPEC.words.some(w => w.onPrimary) ? [{ t: TL.cards[SPEC.words.findIndex(w => w.onPrimary)] + 1.0, kind: 'primary' }] : []),
    { t: TL.blueprint + 3.0, kind: 'light' },
    { t: TL.reveal + 3.0, kind: 'dark' },
    { t: TL.end - 0.1, kind: 'black' },
  ],
};
