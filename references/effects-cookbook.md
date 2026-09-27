# 视觉效果配方

每个配方：用途 → 代码（可直接放进 `PROJECT.fx` 或 `PROJECT.draw`）→ 旋钮。所有代码只依赖 `t`，见 engine-api.md 的确定性规则。

## 光效层（GL）

### 星尘背景
细小闪烁光核铺满画面，给暗场"空气感"。
```js
const DUST = (() => { const R = mulberry32(SPEC.seed + 11); const a = []; for (let i = 0; i < 240; i++) a.push({ x: R() * W, y: R() * H, s: 1.2 + R() * 2.4, p1: R() * 6.28, p2: R() * 6.28, sp: 0.4 + R() }); return a; })();
for (const d of DUST) {
  const x = d.x + 14 * Math.sin(t * 0.21 * d.sp + d.p1), y = d.y + 9 * Math.cos(t * 0.17 * d.sp + d.p2);
  const tw = 0.35 + 0.35 * Math.sin(t * 1.7 * d.sp + d.p1 * 3);
  GL.sprite(x, y, d.s * 2.6, d.s * 2.6, 1, 0.93, 0.82, tw * 0.35 * alpha, 0, 1);
}
```
旋钮：数量 240、漂移幅度 14/9、闪烁频率 1.7。浅色场景把 alpha 压到 0。

### 火花点火
三层叠加：大辉光 + 中辉光 + 白光核，再加一条水平光条；闪烁用两个不相干正弦相乘。
```js
const age = t - T0, flick = 0.85 + 0.15 * Math.sin(age * 41) * Math.sin(age * 13.7), pulse = 1 + 0.12 * Math.sin(age * 12.56);
const br = easeOutCubic(sat(t, T0, 0.5)) * flick * (1 - sat(t, T1, 0.2));
GL.sprite(CX, CY, 150 * pulse * br, 150 * pulse * br, 1, 0.72, 0.4, 0.55 * br, 0, 0);
GL.sprite(CX, CY, 46 * br, 46 * br, 1, 0.85, 0.6, 0.9 * br, 0, 0);
GL.sprite(CX, CY, 9 * br, 9 * br, 1, 1, 1, 1.4 * br, 0, 1);
GL.sprite(CX, CY, 260 * br, 3 * br, 1, 0.8, 0.5, 0.35 * br, 0, 2);
```

### 星座网络
节点错峰出生、从中心 `easeOutExpo` 飞到目标位、慢速摆动；距离小于 `linkR` 的节点连线，透明度随距离与年龄；末尾用 `imp` 把所有位置 lerp 回中心形成内爆。
```js
const imp = easeInCubic(sat(t, TL.implode, TL.cards[0] - TL.implode));
const pos = NODES.map(n => t < n.birth ? null : nodePos(n, t, imp));     // nodePos 见 scenes.js
NODES.forEach((n, i) => { const p = pos[i]; if (!p) return; const c = n.prim ? PRIM_G : ACC; GL.glow(p.x, p.y, n.s * 7.5 * (1 - imp * 0.5), c[0], c[1], c[2], 0.85 * clamp(p.age / 0.4) * (1 + imp * 1.6), 1.1); });
const linkR = 200 * (1 - imp * 0.7);
for (i…) for (j>i…) { const d = hypot(…); if (d > linkR) continue; GL.line(…, 0.75 * (1 - d / linkR) * clamp(min(age_i, age_j) / 0.6) * (1 - imp * 0.6)); }
```
旋钮：84 个节点、出生间隔 0.04 s、目标半径 `W*0.375 / H*0.333`、`linkR` 200、主色节点比例 0.22。节点多于 150 时连线是 O(n²)，仍可接受（每帧 CPU 侧）。

### 流光拖尾
利萨茹轨迹 + `GL.trail`：
```js
const path = tk => ({ x: CX + s.A * Math.sin(tk * s.fa + s.pa), y: CY + s.B * Math.sin(tk * s.fb + s.pb) });
GL.trail(t, path, 18, 0.022, 16, ACC[0], ACC[1], ACC[2] * 0.7, 0.5 * sat(t, s.birth, 0.5));
```
旋钮：幽灵数 18 × 间隔 0.022 s = 拖尾长 0.4 s；`size` 16 头部大小。任何 `path(t)` 都行（贝塞尔、椭圆、样条）。

### 径向爆发（切点冲击）
减速展开 `r = v·(1 − e^(−k·tau))/k`，用光条精灵沿径向拉长；椭圆压扁（x 1.35, y 0.75）更像镜头。
```js
const tau = t - tb; if (tau < 0 || tau > 1.6) return;
for (const p of BURST) {
  const r = p.v * (1 - Math.exp(-3.2 * tau)) / 3.2;
  const x = CX + Math.cos(p.ang) * r * 1.35, y = CY + Math.sin(p.ang) * r * 0.75;
  const a = Math.pow(clamp(1 - tau / 1.4), 1.6), sz = p.s * (1 - tau * 0.45);
  GL.sprite(x, y, sz * 2.2, sz * 0.9, col[0], col[1], col[2], 0.8 * a, p.ang, 2);
}
GL.sprite(CX, CY, 700 * (0.4 + fl), 700 * (0.4 + fl), 1, 0.85, 0.7, 0.75 * fl, 0, 0);   // 中心闪光 fl = exp(-tau*7)
```

### 镜头光条（大揭示）
水平长光条 + 垂直短光条 + 大辉光，`fl = exp(-tau * 5.5)` 衰减；alpha 给到 1.6 让 HDR 过曝。
```js
GL.sprite(CX, 600, 1100 * (0.5 + fl), 34, 1, 0.9, 0.85, 1.6 * fl, 0, 2);
GL.sprite(CX, 600, 60, 700 * fl, 1, 0.85, 0.8, 0.7 * fl, 0, 2);
GL.sprite(CX, 600, 520 * (0.6 + fl), 520 * (0.6 + fl), 1, 0.7, 0.6, 0.8 * fl, 0, 0);
```

### 徽标底光呼吸 / 环绕光点
```js
GL.sprite(CX, 600, 620, 250, PRIM[0] * 1.2, PRIM[1], PRIM[2], (0.11 + 0.03 * Math.sin(tau * 3.14)) * sat(tau, 0, 0.8), 0, 0);
const path = tk => { const th = 0.9 - tk * 6.283 * 0.42, ex = 560 * Math.cos(th), ey = 150 * Math.sin(th); return { x: CX + ex * Math.cos(-0.2) - ey * Math.sin(-0.2), y: 600 + ex * Math.sin(-0.2) + ey * Math.cos(-0.2) }; };
GL.trail(tau, path, 24, 0.02, 22, ACC[0], ACC[1], ACC[2] * 0.7, 0.55 * oa);
```
旋钮：椭圆 560×150、倾角 −0.2 rad、转速 0.42 圈/秒。

## 图形层（2D）

### 冲击环
`ring2d(CX, CY, TL.ring, t, 'rgba(255,70,50,0.9)', 520, 1.2, 2.5)`；两个环错开 0.12 s、不同颜色与半径，层次感更好。

### 乱码入场 + RGB 分离
```js
const p = sat(tau, 0, 0.3);                                   // 0.3 s 内稳定
const word = p < 1 ? scramble(card.cn, CN_POOL, p, frame, salt) : card.cn;
const dx = 22 * (1 - p);
if (dx > 0.5) { txt(word, CX - dx, y, { …color: 'rgba(255,60,60,0.75)' }); txt(word, CX + dx, y, { …color: 'rgba(60,240,255,0.75)' }); }
txt(word, CX, y, { font: `600 250px ${CN}`, color: '#fff', align: 'center', ls: 12 });
```

### 大编号水印 / 横线展开 / 纸屑
- 编号：`txt('02', W - 140, 900, { font: '800 720px …', color: 'rgba(255,255,255,0.08)', align: 'right', ls: -30 })`
- 横线：`rw = 560 * easeOutExpo(sat(tau, 0.05, 0.5))`，从中心向两侧画。
- 纸屑：与爆发同样的减速展开，加 `260·tau²` 的重力下落与自转，三角形填充三色。

### 蓝图网格与标注
- 网格自左向右揭开：`gw = W * easeOutExpo(sat(t, T0, 0.9))`，每 60 px 一线，每 240 px 加深。
- 标注用 `dim()`，色卡用小矩形 + `PRIMARY · #HEX` 等宽字。
- 游标沿二次贝塞尔走：`bx = (1-u)²x0 + 2(1-u)u·CX + u²x1`。

### 基本件拼字母 → 字标 → 描边 → 灌入
```js
drawGlyph(LATIN[i], gx, gy, GK, t - TL.letters[i]);             // 逐字母弹入（GLYPHS 全字母表）
ui.globalAlpha = morph; drawMark(CX, 580, 1, C.primary);         // 交叉淡变到正式字标
const per = 2 * (r.w + r.h); ui.setLineDash([per]); ui.lineDashOffset = per * (1 - ou); rrect(…); ui.stroke();   // 描边走一圈
ui.beginPath(); ui.rect(r.x, r.y, r.w * flood, r.h); ui.clip(); rrect(…); ui.fill(); drawMark(CX, 580, 1, '#fff');   // 主色从左灌入
```

### 匹配剪辑（蓝图 → 揭示）
让徽标在切场前后位置/大小连续：切前在 (580, s=1)，切后用 `spring(t - TL.reveal, 9, 0.62)` 从 (580, 1) 落到 (600, 0.72)。观众感受到"同一个物体换了个世界"。

### 模糊入场 / 打字机 / 顺序淡变
- 模糊入场：`txt(cn, CX, 348 + (1 - e) * 30, { ls: lerp(80, 14, e), alpha: e, blur: (1 - e) * 12 })`，字距从大收小 + 模糊消散。
- 打字机：`typewriter(SPEC.brand.tagline, t, TL.tagline)`，配 `kit.click` 每字一声。
- 两段同位置文字交接：**先淡出、再淡入**（顺序），不要交叉——错位半个字符时交叉会出重影。

### 白闪 / 淡出 / 整体缩小
`flash(t, TL.reveal)`；`fadeBlack(t, TL.fade, 0.8)`；收尾 `outroS = 1 - 0.12 * easeInOut(sat(t, TL.outro, 1.0))` 让主体缓缓缩小，暗示结束。

## 新写一幕的步骤

1. 在 `makeTimeline` 里加时间点（拍数），需要时顺延后续幕。
2. `PROJECT.look` 里给这幕定底色/主题。
3. `fx` 放光效，`draw` 放文字与线框；每个元素用 `sat(t, T0, d)` 做入场进度、`1 - sat(t, T1, d)` 做退场。
4. `score.js` 在同一时间点加声音（切点 stab/impact，元素出现 tick/bell）。
5. `review_frames.sh` 抽这幕的 3–4 个时刻看图。
