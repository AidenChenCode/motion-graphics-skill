/* =====================================================================
   engine.js — 通用动效引擎（不含任何品牌/分镜内容）
     · WebGL2 光效层：RGBA16F 浮点纹理 HDR 累积 + 实例化精灵(辉光/光核/光条) + 连线，合成 pass 做色调映射/暗角/颗粒
     · Canvas2D 图形层：文字、圆角矩形、冲击环、尺寸标注、乱码文字、基本件字母表(a–z)、字标/徽标、HUD
     · Web Audio 合成器乐器包(kit)：kick/hat/clap/bass/pluck/bell/marimba/pad/riser/stab + 压缩→限制→输出链
     · 预览(PLAY 按钮)与导出接口(__seek / __renderAudioWav / __meta)
   加载顺序：spec.js(定义 SPEC/BEAT/TL) → engine.js → scenes.js(PROJECT.look/fx/draw/overlay) → score.js(PROJECT.score)
   铁律：画面与声音都是时间 t 的纯函数；随机只用带种子的 mulberry32；粒子运动写成闭式，不做逐帧累积。
   ===================================================================== */
'use strict';
const W = SPEC.width, H = SPEC.height, FPS = SPEC.fps, DUR = SPEC.duration, FRAMES = Math.round(DUR * FPS);
const CX = W / 2, CY = H / 2;
const C = SPEC.colors;
const PROJECT = window.PROJECT = {};

// ---- 确定性随机 ---------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash2 = (a, b) => mulberry32((a * 73856093) ^ (b * 19349663))();

// ---- 缓动 / 弹簧 ---------------------------------------------------------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const sat = (t, t0, d) => clamp((t - t0) / d);          // t0 起 d 秒内 0→1
const easeOutCubic = u => 1 - Math.pow(1 - u, 3);
const easeInCubic = u => u * u * u;
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const easeOutExpo = u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
const easeOutBack = u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const easeInBack = u => { const c = 1.70158; return (c + 1) * u * u * u - c * u * u; };
// 闭式欠阻尼弹簧 0→1：w 角频率(越大越快)，z 阻尼比(越小越弹)
function spring(age, w = 16, z = 0.42) {
  if (age <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * age) * (Math.cos(wd * age) + (z * w / wd) * Math.sin(wd * age));
}
const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const pad2 = n => String(n).padStart(2, '0');

// =====================================================================
//  WebGL2 光效层
// =====================================================================
const GL = (() => {
  const cv = document.getElementById('gl'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const spriteP = program(`#version 300 es
    layout(location=0) in vec2 aCorner;
    layout(location=1) in vec2 iPos;
    layout(location=2) in vec2 iSize;
    layout(location=3) in vec4 iColor;
    layout(location=4) in vec2 iRotShape;
    uniform vec2 uRes;
    out vec2 vUv; out vec4 vColor; flat out float vShape;
    void main(){
      float c = cos(iRotShape.x), s = sin(iRotShape.x);
      vec2 p = aCorner * iSize;
      p = vec2(p.x*c - p.y*s, p.x*s + p.y*c);
      vec2 ndc = ((iPos + p) / uRes) * 2.0 - 1.0;
      gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
      vUv = aCorner; vColor = iColor; vShape = iRotShape.y;
    }`, `#version 300 es
    precision highp float;
    in vec2 vUv; in vec4 vColor; flat in float vShape;
    out vec4 o;
    void main(){
      float r2 = dot(vUv, vUv);
      float a;
      if (vShape < 0.5)      a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.55, 1.0, r2));   // 0 柔和辉光
      else if (vShape < 1.5) a = exp(-r2 * 11.0);                                       // 1 光核
      else                   a = exp(-vUv.x*vUv.x*2.2 - vUv.y*vUv.y*16.0);              // 2 各向异性光条
      o = vec4(vColor.rgb * vColor.a * a, 1.0);
    }`);
  const lineP = program(`#version 300 es
    layout(location=0) in vec2 aPos; layout(location=1) in vec4 aCol;
    uniform vec2 uRes; out vec4 vCol;
    void main(){ vec2 n = (aPos/uRes)*2.0-1.0; gl_Position = vec4(n.x, -n.y, 0.0, 1.0); vCol = aCol; }`,
    `#version 300 es
    precision highp float; in vec4 vCol; out vec4 o;
    void main(){ o = vec4(vCol.rgb * vCol.a, 1.0); }`);
  const compP = program(`#version 300 es
    out vec2 vUv;
    void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`,
    `#version 300 es
    precision highp float;
    uniform sampler2D uHdr; uniform vec3 uBg; uniform float uGrain, uVig, uFrame, uExpo;
    in vec2 vUv; out vec4 o;
    float hash(uvec2 q){
      q *= uvec2(1597334677u, 3812015801u);
      uint n = (q.x ^ q.y) * 1597334677u;
      n ^= n >> 16u; n *= 0x7feb352du; n ^= n >> 15u; n *= 0x846ca68bu; n ^= n >> 16u;
      return float(n) * (1.0 / 4294967296.0);
    }
    void main(){
      vec3 hdr = texture(uHdr, vUv).rgb * uExpo;
      vec3 lit = 1.0 - exp(-hdr);                       // 色调映射：HDR 累积 → 0..1
      vec3 c = uBg + lit;
      float d = distance(vUv, vec2(0.5, 0.5));
      c *= 1.0 - uVig * smoothstep(0.32, 0.98, d);      // 暗角
      uvec2 px = uvec2(ivec2(gl_FragCoord.xy) + ivec2(int(uFrame) * 17, int(uFrame) * 31));
      c += (hash(px) - 0.5) * uGrain;                   // 逐帧胶片颗粒（整数哈希，逐帧确定）
      o = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`);
  // HDR 帧缓冲：RGBA16F 浮点纹理（无扩展时退回 RGBA8）
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (hasFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const MAXS = 8000, SPRITE_F = 10;
  const spriteData = new Float32Array(MAXS * SPRITE_F); let spriteN = 0;
  const spriteVao = gl.createVertexArray(); gl.bindVertexArray(spriteVao);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, spriteData.byteLength, gl.DYNAMIC_DRAW);
  const stride = SPRITE_F * 4;
  [[1, 2, 0], [2, 2, 8], [3, 4, 16], [4, 2, 32]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(loc, 1);
  });
  const MAXL = 6000;
  const lineData = new Float32Array(MAXL * 12); let lineN = 0;
  const lineVao = gl.createVertexArray(); gl.bindVertexArray(lineVao);
  const lbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lbuf);
  gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray();

  const api = {
    hasFloat,
    begin() { spriteN = 0; lineN = 0; },
    // 单个精灵。shape: 0 辉光 / 1 光核 / 2 光条(rot 为方向)。颜色 0..1，a 可 >1 表示更亮(HDR)
    sprite(x, y, sx, sy, r, g, b, a, rot = 0, shape = 0) {
      if (spriteN >= MAXS || a <= 0.0005) return;
      const o = spriteN * SPRITE_F;
      spriteData[o] = x; spriteData[o + 1] = y; spriteData[o + 2] = sx; spriteData[o + 3] = sy;
      spriteData[o + 4] = r; spriteData[o + 5] = g; spriteData[o + 6] = b; spriteData[o + 7] = a;
      spriteData[o + 8] = rot; spriteData[o + 9] = shape; spriteN++;
    },
    // 光点 = 辉光 + 白色光核
    glow(x, y, size, r, g, b, a, coreMul = 1) {
      api.sprite(x, y, size, size, r, g, b, a * 0.55, 0, 0);
      api.sprite(x, y, size * 0.22, size * 0.22, 1, 1, 1, a * coreMul, 0, 1);
    },
    // 拖尾：沿 path(tk) 采样 n 个"幽灵"，越旧越小越淡。path 返回 {x,y}
    trail(t, path, n, dt, size, r, g, b, a, head = true) {
      for (let k = 0; k < n; k++) {
        const p = path(t - k * dt), f = Math.pow(1 - k / n, 2);
        api.sprite(p.x, p.y, size * f + 4, size * f + 4, r, g, b, a * f, 0, 0);
        if (k === 0 && head) api.sprite(p.x, p.y, 5, 5, 1, 1, 1, a * 1.6, 0, 1);
      }
    },
    line(x1, y1, x2, y2, r, g, b, a) {
      if (lineN >= MAXL || a <= 0.0005) return;
      const o = lineN * 12;
      lineData.set([x1, y1, r, g, b, a, x2, y2, r, g, b, a], o); lineN++;
    },
    end(bg, grain, vig, frame, expo = 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      if (lineN) {
        gl.useProgram(lineP); gl.uniform2f(gl.getUniformLocation(lineP, 'uRes'), W, H);
        gl.bindVertexArray(lineVao); gl.bindBuffer(gl.ARRAY_BUFFER, lbuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData, 0, lineN * 12);
        gl.drawArrays(gl.LINES, 0, lineN * 2);
      }
      if (spriteN) {
        gl.useProgram(spriteP); gl.uniform2f(gl.getUniformLocation(spriteP, 'uRes'), W, H);
        gl.bindVertexArray(spriteVao); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteData, 0, spriteN * SPRITE_F);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, spriteN);
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(compP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(compP, 'uHdr'), 0);
      gl.uniform3f(gl.getUniformLocation(compP, 'uBg'), bg[0], bg[1], bg[2]);
      gl.uniform1f(gl.getUniformLocation(compP, 'uGrain'), grain);
      gl.uniform1f(gl.getUniformLocation(compP, 'uVig'), vig);
      gl.uniform1f(gl.getUniformLocation(compP, 'uFrame'), frame % 997);
      gl.uniform1f(gl.getUniformLocation(compP, 'uExpo'), expo);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
  };
  return api;
})();

// =====================================================================
//  Canvas2D 图形层
// =====================================================================
const uiCanvas = document.getElementById('ui'); uiCanvas.width = W; uiCanvas.height = H;
const ui = uiCanvas.getContext('2d');
const MONO = (SPEC.fonts && SPEC.fonts.mono) || '"SF Mono", Menlo, Consolas, monospace';
const SANS = SPEC.brand.font || '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
const CN = SPEC.brand.fontCN || '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

// 文字：o = {font, color, alpha, align, baseline, ls(字距 px), blur}
function txt(s, x, y, o = {}) {
  ui.save();
  ui.font = o.font || `500 16px ${MONO}`;
  ui.fillStyle = o.color || '#fff';
  ui.globalAlpha = (o.alpha ?? 1) * ui.globalAlpha;
  ui.textAlign = o.align || 'left';
  ui.textBaseline = o.baseline || 'alphabetic';
  ui.letterSpacing = (o.ls ?? 0) + 'px';
  if (o.blur) ui.filter = `blur(${o.blur}px)`;
  ui.fillText(s, x, y);
  ui.restore();
}
function rrect(x, y, w, h, r) {
  ui.beginPath(); ui.moveTo(x + r, y); ui.arcTo(x + w, y, x + w, y + h, r); ui.arcTo(x + w, y + h, x, y + h, r);
  ui.arcTo(x, y + h, x, y, r); ui.arcTo(x, y, x + w, y, r); ui.closePath();
}
// 冲击环：tBirth 起 dur 秒内从 0 扩到 maxR 并淡出
function ring2d(cx, cy, tBirth, t, color, maxR, dur, lw = 2) {
  const tau = t - tBirth; if (tau < 0 || tau > dur) return;
  const u = tau / dur;
  ui.save(); ui.globalAlpha *= (1 - u); ui.strokeStyle = color; ui.lineWidth = lw * (1 - u * 0.7);
  ui.beginPath(); ui.arc(cx, cy, maxR * easeOutExpo(u), 0, 6.283); ui.stroke(); ui.restore();
}
// 尺寸标注线（蓝图风格）
function dim(x1, y1, x2, y2, label, a, color = C.ink) {
  ui.save(); ui.globalAlpha *= a; ui.strokeStyle = color; ui.lineWidth = 1; ui.setLineDash([]);
  ui.beginPath(); ui.moveTo(x1, y1); ui.lineTo(x2, y2); ui.stroke();
  const vert = Math.abs(x2 - x1) < 1;
  for (const [x, y] of [[x1, y1], [x2, y2]]) { ui.beginPath(); if (vert) { ui.moveTo(x - 6, y); ui.lineTo(x + 6, y); } else { ui.moveTo(x, y - 6); ui.lineTo(x, y + 6); } ui.stroke(); }
  if (label) txt(label, vert ? x1 + 12 : (x1 + x2) / 2, vert ? (y1 + y2) / 2 + 4 : y1 - 10, { font: `500 12px ${MONO}`, color, align: vert ? 'left' : 'center', ls: 1.5 });
  ui.restore();
}
// 乱码文字：p 0→1 逐渐稳定；salt 让不同文字的乱码不同步
const CN_POOL = (SPEC.scramble && SPEC.scramble.cn) || '联创智想造能新未来科技力量数据云端算法芯光';
const EN_POOL = (SPEC.scramble && SPEC.scramble.en) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*';
function scramble(s, pool, p, frame, salt) {
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const r = hash2(frame * 7 + i * 131 + salt, i + 1);
    o += (r < 1 - p) ? pool[Math.floor(hash2(frame + salt, i * 17 + 3) * pool.length)] : s[i];
  }
  return o;
}
// 逐字打字机：t0 起每 cps 秒一个字，可带闪烁光标
function typewriter(s, t, t0, cps = 0.075, cursor = '|') {
  if (t < t0) return '';
  const n = Math.min(s.length, Math.floor((t - t0) / cps) + 1);
  const cur = (cursor && n < s.length && Math.floor(t * 6) % 2 === 0) ? cursor : '';
  return s.slice(0, n) + cur;
}

// ---- 基本件字母表：100×140 字框，基线 y=120，x 高 y=40，上伸 y=12，下伸 y=150 --------
// 部件：line(x1,y1,x2,y2) / arc(cx,cy,r,a0,a1,ccw) / dot(x,y)。着色规则：弧与点=主色，横竖线=墨色，斜线=灰色
const P = Math.PI;
const L = (x1, y1, x2, y2) => ({ k: 'line', x1, y1, x2, y2 });
const A = (cx, cy, r, a0, a1, ccw = false) => ({ k: 'arc', cx, cy, r, a0, a1, ccw });
const D = (x, y) => ({ k: 'dot', x, y });
const RING = (cx, cy, r) => A(cx, cy, r, -P / 2, 1.5 * P);
const GLYPHS = {
  a: [RING(50, 80, 38), L(88, 42, 88, 120)],
  b: [L(18, 12, 18, 120), RING(56, 80, 38)],
  c: [A(50, 80, 38, 0.25 * P, 1.75 * P)],
  d: [RING(44, 80, 38), L(82, 12, 82, 120)],
  e: [RING(50, 80, 38), L(14, 80, 86, 80)],
  f: [L(40, 34, 40, 120), A(62, 34, 22, P, 1.5 * P), L(18, 60, 66, 60)],
  g: [RING(50, 80, 38), L(88, 42, 88, 124), A(62, 124, 26, 0, P)],
  h: [L(18, 12, 18, 120), A(50, 76, 32, P, 2 * P), L(82, 76, 82, 120)],
  i: [L(50, 42, 50, 120), D(50, 20)],
  j: [L(60, 42, 60, 124), A(34, 124, 26, 0, P), D(60, 20)],
  k: [L(18, 12, 18, 120), L(18, 88, 78, 40), L(36, 74, 82, 120)],
  l: [L(50, 12, 50, 120)],
  m: [L(14, 42, 14, 120), A(32, 68, 18, P, 2 * P), L(50, 68, 50, 120), A(68, 68, 18, P, 2 * P), L(86, 68, 86, 120)],
  n: [L(18, 42, 18, 120), A(50, 76, 32, P, 2 * P), L(82, 76, 82, 120)],
  o: [RING(50, 80, 40)],
  p: [L(18, 42, 18, 150), RING(56, 80, 38)],
  q: [RING(44, 80, 38), L(82, 42, 82, 150)],
  r: [L(22, 42, 22, 120), A(54, 74, 32, P, 1.7 * P)],
  s: [A(50, 60, 20, -0.2 * P, 0.6 * P, true), A(50, 100, 20, -0.4 * P, 0.8 * P)],
  t: [L(44, 20, 44, 104), A(64, 104, 20, P, 0.5 * P, true), L(18, 48, 72, 48)],
  u: [L(18, 42, 18, 84), A(50, 84, 32, P, 0, true), L(82, 42, 82, 120)],
  v: [L(12, 42, 50, 120), L(50, 120, 88, 42)],
  w: [L(8, 42, 30, 120), L(30, 120, 50, 60), L(50, 60, 70, 120), L(70, 120, 92, 42)],
  x: [L(14, 42, 86, 120), L(86, 42, 14, 120)],
  y: [L(14, 42, 50, 120), L(86, 42, 32, 150)],
  z: [L(16, 42, 84, 42), L(84, 42, 16, 120), L(16, 120, 84, 120)],
};
function partColor(p) {
  if (p.k !== 'line') return C.primary;
  const diag = Math.abs(p.x2 - p.x1) > 1 && Math.abs(p.y2 - p.y1) > 1;
  return diag ? (C.gray || '#7A7A80') : C.ink;
}
function partCenter(p) {
  if (p.k === 'line') return [(p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2];
  if (p.k === 'arc') return [p.cx, p.cy];
  return [p.x, p.y];
}
// 画一个部件：u = 描画进度 0→1，lw 线宽
function drawPart(p, u, lw = 20) {
  ui.strokeStyle = ui.fillStyle = partColor(p); ui.lineWidth = lw; ui.lineCap = 'round'; ui.lineJoin = 'round';
  ui.beginPath();
  if (p.k === 'line') { ui.moveTo(p.x1, p.y1); ui.lineTo(lerp(p.x1, p.x2, u), lerp(p.y1, p.y2, u)); ui.stroke(); }
  else if (p.k === 'arc') { ui.arc(p.cx, p.cy, p.r, p.a0, lerp(p.a0, p.a1, u), p.ccw); ui.stroke(); }
  else { ui.arc(p.x, p.y, lw * 0.6 * u, 0, 6.283); ui.fill(); }
}
// 画整个字母（各部件按 stagger 依次弹入）。gx,gy 字框左上角；scale 字框缩放；age 自出生的秒数
function drawGlyph(ch, gx, gy, scale, age, stagger = 0.09) {
  const parts = GLYPHS[ch];
  if (!parts) {   // 无基本件定义的字符（数字/中文等）：直接用粗体文字盖下
    const s = 0.5 + 0.5 * spring(age, 15, 0.42);
    ui.save(); ui.translate(gx + 50 * scale, gy + 80 * scale); ui.scale(s, s);
    txt(ch, 0, 40 * scale, { font: `800 ${Math.round(104 * scale)}px ${SANS}`, color: C.ink, align: 'center' });
    ui.restore(); return;
  }
  parts.forEach((p, j) => {
    const a = age - j * stagger; if (a < 0) return;
    const s = 0.5 + 0.5 * spring(a, 15, 0.42);
    const [ccx, ccy] = partCenter(p);
    ui.save(); ui.translate(gx + ccx * scale, gy + ccy * scale); ui.scale(scale * s, scale * s); ui.translate(-ccx, -ccy);
    drawPart(p, easeOutCubic(sat(a, 0, 0.28)));
    ui.restore();
  });
}

// ---- 字标 / 徽标 -------------------------------------------------------------
const LOGO = { img: null };
function loadLogo() {
  return new Promise(res => {
    const l = SPEC.brand.logo; if (!l || !l.src) return res();
    const img = new Image();
    img.onload = () => { LOGO.img = img; res(); };
    img.onerror = () => { console.error('logo image failed to load: ' + l.src); res(); };
    img.src = l.src;
  });
}
const MARK_TEXT = SPEC.brand.latin || SPEC.brand.cn || 'BRAND';     // 无拉丁字标时用中文名做字标
const MARK_FONT = SPEC.brand.latin ? SANS : CN;
let _wm = null;   // 缓存：字标字号使其宽度 ≈ 目标宽度
function wordmark() {
  if (_wm) return _wm;
  const target = SPEC.brand.wordmarkWidth || 900, cap = SPEC.brand.wordmarkMaxSize || 300;
  ui.font = `700 100px ${MARK_FONT}`; ui.letterSpacing = '-2px';
  const w100 = ui.measureText(MARK_TEXT).width;
  const fs = Math.min(cap, Math.round(100 * target / w100));
  ui.letterSpacing = '0px';
  _wm = { fs, font: `700 ${fs}px ${MARK_FONT}`, ls: -fs * 0.02, w: w100 * fs / 100 };
  return _wm;
}
// 标记(字标或 logo 图)的尺寸
function markSize(s = 1) {
  if (LOGO.img) { const h = (SPEC.brand.logo.height || 220) * s; return { w: LOGO.img.width * h / LOGO.img.height, h }; }
  const f = wordmark(); return { w: f.w * s, h: f.fs * 0.96 * s };
}
// 徽标矩形：(cx, cy) 为中心，s 缩放
function badgeRect(cx, cy, s = 1) {
  const m = markSize(s), padX = 70 * s, padY = 50 * s;
  const w = m.w + padX * 2, h = m.h + padY * 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, r: 18 * s, mark: m };
}
const _tint = document.createElement('canvas');
// 画标记：文字字标用 color；logo 图默认按 color 着色（SPEC.brand.logo.tint === false 则原样绘制）
function drawMark(cx, cy, s, color) {
  const m = markSize(s);
  if (LOGO.img) {
    const x = cx - m.w / 2, y = cy - m.h / 2;
    if (SPEC.brand.logo.tint === false) { ui.drawImage(LOGO.img, x, y, m.w, m.h); return; }
    _tint.width = Math.ceil(m.w); _tint.height = Math.ceil(m.h);
    const c = _tint.getContext('2d'); c.clearRect(0, 0, _tint.width, _tint.height);
    c.drawImage(LOGO.img, 0, 0, m.w, m.h);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, _tint.width, _tint.height);
    ui.drawImage(_tint, x, y); return;
  }
  const f = wordmark();
  txt(MARK_TEXT, cx, cy + m.h * 0.5 - f.fs * 0.22 * s, { font: `700 ${f.fs * s}px ${MARK_FONT}`, color, align: 'center', ls: f.ls * s });
}
function drawBadge(cx, cy, s, alpha) {
  const b = badgeRect(cx, cy, s);
  ui.save(); ui.globalAlpha *= alpha;
  rrect(b.x, b.y, b.w, b.h, b.r); ui.fillStyle = C.primary; ui.fill();
  drawMark(cx, cy, s, '#fff');
  ui.restore();
  return b;
}

// ---- HUD（四角信息 + 时间码 + 节拍 + 迷你频谱 + 取景框）----------------------
function hud(t, frame, theme) {
  const h = SPEC.hud; if (!h || h.show === false) return;
  const fg = theme === 'light' ? C.ink : '#fff';
  const g = 1 - sat(t, TL.fade ?? (DUR - 1), 0.6);
  const hdr = h.headerFadeIn ? sat(t, h.headerFadeIn, 0.35) : 1;
  ui.save(); ui.globalAlpha = g;
  if (h.topLeft && h.topLeft[0]) txt(h.topLeft[0], 30, 44, { font: `500 15px ${MONO}`, color: fg, alpha: 0.85 * hdr, ls: 1 });
  if (h.topLeft && h.topLeft[1]) txt(h.topLeft[1], 30, 66, { font: `500 11px ${MONO}`, color: fg, alpha: 0.5 * hdr, ls: 1.5 });
  const ss = Math.floor(t) % 60, ff = frame % FPS;
  txt(`TC 00:00:${pad2(ss)}:${pad2(ff)}`, W - 30, 44, { font: `500 15px ${MONO}`, color: fg, align: 'right', alpha: 0.85, ls: 1 });
  txt(h.topRight ?? `${W}×${H} · ${FPS} FPS · SEED ${SPEC.seed}`, W - 30, 66, { font: `500 11px ${MONO}`, color: fg, align: 'right', alpha: 0.5, ls: 1.5 });
  if (h.bottomLeft) txt(h.bottomLeft, 30, H - 30, { font: `500 11px ${MONO}`, color: fg, alpha: 0.5, ls: 2.5 });
  const bar = Math.floor(t / (BEAT * 4)) + 1, beat = Math.floor(t / BEAT) % 4 + 1;
  txt(`BAR ${pad2(bar)}  BEAT ${beat}`, W - 30, H - 30, { font: `500 11px ${MONO}`, color: fg, align: 'right', alpha: 0.5, ls: 2.5 });
  const music = sat(t, h.spectrumFrom ?? 0, 0.3) * (1 - sat(t, TL.fade ?? (DUR - 1), 0.6));
  if (h.spectrum !== false && music > 0) {
    const bp = (t / BEAT) % 1, env = 0.35 + 0.65 * Math.exp(-bp * 3.2);
    ui.fillStyle = fg;
    for (let i = 0; i < 24; i++) {
      const n = 0.5 + 0.5 * Math.sin(t * (2.3 + i * 0.41) + i * 1.7) * Math.sin(t * 5.1 + i);
      const hh = 3 + 22 * n * env * music;
      ui.globalAlpha = g * 0.45; ui.fillRect(CX - 72 + i * 6, H - 28 - hh, 3, hh);
    }
  }
  ui.strokeStyle = fg; ui.globalAlpha = g * 0.28; ui.lineWidth = 1.5;
  const m = 18, Lc = 26;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx > 0 ? m : W - m, y = sy > 0 ? m : H - m;
    ui.beginPath(); ui.moveTo(x, y + sy * Lc); ui.lineTo(x, y); ui.lineTo(x + sx * Lc, y); ui.stroke();
  }
  ui.restore();
}
// 叠加层辅助：白闪 / 淡入黑
function flash(t, tc, strength = 0.85, k = 16) {
  const tau = t - tc; if (tau < 0 || tau > 0.4) return;
  ui.save(); ui.fillStyle = '#fff'; ui.globalAlpha = strength * Math.exp(-tau * k); ui.fillRect(0, 0, W, H); ui.restore();
}
function fadeBlack(t, t0, dur) {
  const fo = sat(t, t0, dur); if (fo <= 0) return;
  ui.save(); ui.fillStyle = '#000'; ui.globalAlpha = fo; ui.fillRect(0, 0, W, H); ui.restore();
}

// =====================================================================
//  主绘制：t 秒 → 一帧（GL 光效层 → 2D 图形层 → HUD → 叠加层）
// =====================================================================
function draw(t) {
  t = clamp(t, 0, DUR - 1e-6);
  const frame = Math.round(t * FPS);
  const look = PROJECT.look(t);      // { bg:[r,g,b], grain, vig, theme:'dark'|'light'|'primary', expo? }
  GL.begin(); PROJECT.fx(t); GL.end(look.bg, look.grain, look.vig, frame, look.expo ?? 1);
  ui.setTransform(1, 0, 0, 1, 0, 0); ui.globalAlpha = 1; ui.filter = 'none'; ui.letterSpacing = '0px';
  ui.clearRect(0, 0, W, H);
  PROJECT.draw(t, frame, look);
  hud(t, frame, look.theme);
  if (PROJECT.overlay) PROJECT.overlay(t, frame);
  ui.globalAlpha = 1;
}

// =====================================================================
//  音乐：合成器乐器包。所有乐器都按绝对秒调度，与画面共用 TL
// =====================================================================
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);       // MIDI → Hz
const N = { F1: 29, A1: 33, C2: 36, E2: 40, F2: 41, G2: 43, A2: 45, C3: 48, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88 };

function makeKit(ctx, t0) {
  const R = mulberry32(SPEC.seed + 777);
  const M = SPEC.music || {};
  const master = ctx.createGain(); master.gain.value = 1.0;
  // 总线：压缩(胶合) → 限制器(封顶) → 输出增益。Chrome 的 DynamicsCompressor 自带补偿增益，
  // 没有限制器时很容易被推到削波，所以两级都要有；最终响度靠 outGain 调（用 verify.py 量过再定）。
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  const out = ctx.createGain(); out.gain.value = M.outGain ?? 0.75;
  master.connect(comp); comp.connect(lim); lim.connect(out); out.connect(ctx.destination);
  // 延迟发送（拍点同步的 3/4 拍延迟）
  const dly = ctx.createDelay(2); dly.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
  const send = ctx.createGain(); send.gain.value = 0.32;
  dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dly.connect(send); send.connect(master);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  const at = s => t0 + s;

  function tone({ type = 'sine', f, t, dur, g = 0.2, a = 0.005, d = 0.1, s = 0.6, r = 0.2, detune = 0, lp, lpEnd, q = 0.7, dest = master, wet = 0, pitchTo, pitchDur = 0.05 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at(t));
    if (pitchTo) o.frequency.exponentialRampToValueAtTime(pitchTo, at(t + pitchDur));
    o.detune.value = detune;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, at(t));
    e.gain.exponentialRampToValueAtTime(g, at(t + a));
    e.gain.exponentialRampToValueAtTime(Math.max(g * s, 0.0001), at(t + a + d));
    e.gain.setValueAtTime(Math.max(g * s, 0.0001), at(t + Math.max(dur - r, a + d)));
    e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q; fl.frequency.setValueAtTime(lp, at(t)); if (lpEnd) fl.frequency.exponentialRampToValueAtTime(lpEnd, at(t + dur * 0.5)); o.connect(fl); node = fl; }
    node.connect(e); e.connect(dest);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; e.connect(w); w.connect(dly); }
    o.start(at(t)); o.stop(at(t + dur + 0.05));
  }
  function noise({ t, dur, g = 0.2, a = 0.002, r = 0.08, type = 'highpass', f = 6000, fEnd, q = 0.8, dest = master, wet = 0 }) {
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, at(t));
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, at(t + dur));
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, at(t));
    e.gain.linearRampToValueAtTime(g, at(t + a));
    e.gain.setValueAtTime(g, at(t + Math.max(a, dur - r)));
    e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
    src.connect(fl); fl.connect(e); e.connect(dest);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; e.connect(w); w.connect(dly); }
    src.start(at(t), R() * 1.5); src.stop(at(t + dur + 0.05));
  }
  const kit = {
    ctx, master, dly, at, tone, noise, NOTE, N, BEAT,
    // 结尾总淡出
    fadeOut(t1, t2) { master.gain.setValueAtTime(1.0, at(t1)); master.gain.linearRampToValueAtTime(0.0001, at(t2)); },
    kick: (t, g = 0.7, f0 = 170, f1 = 46) => { tone({ f: f0, pitchTo: f1, pitchDur: 0.06, t, dur: 0.32, g, a: 0.002, d: 0.26, s: 0.0001, r: 0.05 }); noise({ t, dur: 0.02, g: g * 0.25, f: 3000, r: 0.015 }); },
    hat: (t, g = 0.12, dur = 0.045) => noise({ t, dur, g, f: 7500, r: dur * 0.8 }),
    clap: (t, g = 0.24) => { for (let k = 0; k < 3; k++) noise({ t: t + k * 0.009, dur: 0.11 + k * 0.03, g: g * (1 - k * 0.2), type: 'bandpass', f: 1300 + k * 400, q: 1.1, r: 0.08, wet: 0.25 }); },
    bass: (t, n, dur = 0.22, g = 0.22) => { tone({ type: 'sawtooth', f: NOTE(n), t, dur, g: g * 0.6, a: 0.004, d: 0.08, s: 0.7, r: 0.06, lp: 520, q: 1.2 }); tone({ type: 'square', f: NOTE(n), t, dur, g: g * 0.35, a: 0.004, d: 0.08, s: 0.7, r: 0.06, lp: 380 }); },
    pluck: (t, n, g = 0.14, dur = 0.34) => { tone({ type: 'sawtooth', f: NOTE(n), t, dur, g, a: 0.003, d: 0.14, s: 0.08, r: 0.1, lp: 3200, lpEnd: 900, q: 1.5, wet: 0.5 }); tone({ type: 'triangle', f: NOTE(n), t, dur, g: g * 0.7, a: 0.003, d: 0.12, s: 0.05, r: 0.1, wet: 0.3 }); },
    bell: (t, n, g = 0.2, dur = 0.5) => { tone({ f: NOTE(n), t, dur, g, a: 0.003, d: 0.2, s: 0.25, r: 0.25, wet: 0.6 }); tone({ f: NOTE(n) * 2.76, t, dur: dur * 0.5, g: g * 0.35, a: 0.002, d: 0.08, s: 0.1, r: 0.1, wet: 0.4 }); tone({ f: NOTE(n) * 4.07, t, dur: dur * 0.3, g: g * 0.15, a: 0.002, d: 0.05, s: 0.05, r: 0.05 }); },
    marimba: (t, n, g = 0.16) => { tone({ f: NOTE(n), t, dur: 0.42, g, a: 0.002, d: 0.16, s: 0.15, r: 0.2, wet: 0.35 }); tone({ f: NOTE(n) * 4, t, dur: 0.12, g: g * 0.3, a: 0.002, d: 0.05, s: 0.1, r: 0.05 }); },
    // 木鱼/敲击：f0→f1 快速下滑的短音
    tick: (t, f0 = 420, f1 = 260, g = 0.28) => tone({ f: f0, pitchTo: f1, pitchDur: 0.05, t, dur: 0.14, g, a: 0.002, d: 0.1, s: 0.05, r: 0.03, wet: 0.35 }),
    // 垫音：两路失谐锯齿 + 低通；pump=true 时按拍抽吸（侧链感）
    pad(t, dur, notes, g = 0.08, lp = 900, lpEnd = 1800, pump = false) {
      const bus = ctx.createGain(); bus.gain.setValueAtTime(g, at(t)); bus.connect(master);
      const w = ctx.createGain(); w.gain.value = 0.25; bus.connect(w); w.connect(dly);
      if (pump) for (let b = t; b < t + dur - 0.01; b += BEAT) { bus.gain.setValueAtTime(g * 0.3, at(b)); bus.gain.linearRampToValueAtTime(g, at(b + BEAT * 0.64)); }
      for (const n of notes) for (const det of [-8, 8]) tone({ type: 'sawtooth', f: NOTE(n), t, dur, g: 0.5, a: 0.9, d: 0.5, s: 0.9, r: 1.6, detune: det, lp, lpEnd, q: 0.5, dest: bus });
    },
    riser: (t, dur, g = 0.3) => { noise({ t, dur, g, a: dur * 0.9, r: 0.05, type: 'bandpass', f: 300, fEnd: 6000, q: 1.2, wet: 0.3 }); tone({ f: 180, pitchTo: 900, pitchDur: dur, t, dur, g: 0.07, a: dur * 0.8, d: 0.05, s: 1, r: 0.05, type: 'triangle' }); },
    // 反向提升（短促上扫，用于切场前）
    sweep: (t, dur = 0.5, g = 0.22) => noise({ t, dur, g, a: dur * 0.9, r: 0.04, type: 'bandpass', f: 800, fEnd: 5000, q: 1 }),
    // 和弦重击：失谐锯齿和弦 + 低频下落 + 噪声
    stab(t, notes) { for (const n of notes) for (const det of [-10, 0, 10]) tone({ type: 'sawtooth', f: NOTE(n), t, dur: 0.6, g: 0.09, a: 0.004, d: 0.3, s: 0.2, r: 0.25, detune: det, lp: 4200, lpEnd: 500, q: 1, wet: 0.35 }); tone({ f: 95, pitchTo: 34, pitchDur: 0.5, t, dur: 0.7, g: 0.45, a: 0.003, d: 0.5, s: 0.0001, r: 0.1 }); noise({ t, dur: 0.35, g: 0.22, f: 2500, r: 0.3, wet: 0.3 }); },
    // 大落点：次低频下潜 + 长镲 + 低频冲击
    impact(t, g = 1) { tone({ f: 72, pitchTo: 27, pitchDur: 1.1, t, dur: 1.6, g: 0.75 * g, a: 0.003, d: 1.4, s: 0.0001, r: 0.1 }); noise({ t, dur: 2.2, g: 0.32 * g, f: 3800, r: 2.1, wet: 0.5 }); noise({ t, dur: 0.12, g: 0.4 * g, type: 'lowpass', f: 900, r: 0.1 }); },
    // 短促高频 blip（HUD、打字机）
    blip: (t, f = 1300, g = 0.09) => tone({ f, t, dur: 0.07, g, a: 0.002, d: 0.04, s: 0.2, r: 0.02, wet: 0.5 }),
    click: (t, f = 3600, g = 0.07) => noise({ t, dur: 0.03, g, type: 'bandpass', f, q: 2.5, r: 0.02 }),
  };
  return kit;
}

async function renderAudioWav() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, sr * DUR, sr);
  PROJECT.score(makeKit(ctx, 0));
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const n = buf.length, bytes = 44 + n * 4, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
  const u8 = new Uint8Array(ab); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// =====================================================================
//  预览 / 导出接口
// =====================================================================
function fit() {
  const st = document.getElementById('stage');
  st.style.width = W + 'px'; st.style.height = H + 'px';
  const s = Math.min(innerWidth / W, innerHeight / H);
  st.style.transform = `translate(${-W * s / 2}px, ${-H * s / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();
const q = new URLSearchParams(location.search);
if (q.has('export')) document.body.classList.add('export');

let ac = null, t0 = 0, raf = 0;
document.getElementById('play').addEventListener('click', () => {
  const btn = document.getElementById('play'); btn.style.display = 'none';
  if (raf) cancelAnimationFrame(raf);
  if (ac) ac.close();
  ac = new AudioContext({ sampleRate: 48000 });
  t0 = ac.currentTime + 0.15; PROJECT.score(makeKit(ac, t0));
  const loop = () => {
    const t = ac.currentTime - t0;
    draw(Math.max(0, t));
    if (t < DUR) raf = requestAnimationFrame(loop); else { btn.textContent = '↻ REPLAY'; btn.style.display = ''; }
  };
  raf = requestAnimationFrame(loop);
});

window.__meta = { title: SPEC.title, W, H, FPS, DUR, FRAMES, BPM: SPEC.bpm, hasFloat: GL.hasFloat, TL, verify: SPEC.verify || null, primary: C.primary };
window.__seek = frame => { draw(frame / FPS); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
window.__renderAudioWav = renderAudioWav;
window.__ready = false;
Promise.all([loadLogo(), document.fonts.ready]).then(() => {
  draw(q.has('frame') ? +q.get('frame') / FPS : 0);
  window.__ready = true;
});
