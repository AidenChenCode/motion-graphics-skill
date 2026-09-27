# engine.js API 与项目契约

加载顺序 `spec.js → engine.js → scenes.js → score.js`，全是经典脚本，顶层 `const` 共享全局作用域，`file://` 直接可开（所以不用 ES module、不用 fetch）。

## 全局常量

| 名称 | 来源 | 说明 |
|---|---|---|
| `SPEC` | spec.js | 项目配置 |
| `BEAT` | spec.js | `60 / SPEC.bpm` 秒 |
| `TL` | spec.js `makeTimeline()` | 时间表，单位秒，全部由拍数换算 |
| `W H FPS DUR FRAMES CX CY` | engine | 画幅、帧率、时长、总帧数、画面中心 |
| `C` | engine | `SPEC.colors` 的别名 |
| `PROJECT` | engine | 项目钩子挂载点（`window.PROJECT`） |
| `MONO SANS CN` | engine | 等宽 / 无衬线 / 中文字体栈 |

坐标系：像素，原点左上，默认 1920×1080。`scenes.js` 里的位置常量（如徽标 y=600、词卡文字 y=592）是按 1080p 调的；换分辨率时按 `W/1920`、`H/1080` 缩放这些常量，或干脆保持 1080p 输出后由 ffmpeg 缩放。

## 随机与缓动

```js
const R = mulberry32(SPEC.seed + 23); R()           // 确定性 [0,1)
hash2(a, b)                                          // 两个整数 → [0,1)，用于逐帧乱码等
clamp(x, a=0, b=1)  lerp(a, b, u)  sat(t, t0, d)     // sat：t0 起 d 秒内 0→1（最常用的"进度"函数）
easeOutCubic  easeInCubic  easeInOut  easeOutExpo  easeOutBack  easeInBack
spring(age, w=16, z=0.42)                            // 闭式欠阻尼弹簧 0→1；w 大=快，z 小=更弹
hexRGB('#E2231A')  → [0.886, 0.137, 0.102]           // GL 用的 0..1 颜色
pad2(n)
```

典型写法：`const u = easeOutExpo(sat(t, TL.cards[0], 0.5))` 表示从词卡起点开始 0.5 s 内快速展开。

## GL 光效层（`GL`）

每帧由 `draw()` 调用 `GL.begin()` → `PROJECT.fx(t)` → `GL.end(bg, grain, vig, frame, expo)`。所有精灵/线以**加法混合**画进 RGBA16F 浮点纹理，再做 `1 - exp(-hdr)` 色调映射叠到底色上，所以 alpha 可以大于 1（更亮），重叠自然发光。

```js
GL.sprite(x, y, sx, sy, r, g, b, a, rot=0, shape=0)
//   shape 0 柔和辉光（sx=sy=半径）  1 光核（小而实）  2 各向异性光条（sx 长、sy 细，rot 方向）
GL.glow(x, y, size, r, g, b, a, coreMul=1)           // 辉光 + 白光核 的组合，最常用的"光点"
GL.trail(t, path, n, dt, size, r, g, b, a, head=true) // 沿 path(tk)→{x,y} 采 n 个幽灵，间隔 dt 秒，越旧越小越淡
GL.line(x1, y1, x2, y2, r, g, b, a)                  // 1 px 加法线（星座连线）
GL.hasFloat                                          // 是否拿到 EXT_color_buffer_float（否则退回 RGBA8，仍可用）
```

容量：8000 精灵 / 6000 线 每帧。`end()` 参数：`bg` 为 `[r,g,b]`，`grain` 颗粒幅度（暗场 0.05、浅场 0.02），`vig` 暗角强度（0.2–0.55），`expo` 曝光。

## 2D 图形层（`ui` = CanvasRenderingContext2D）

```js
txt(s, x, y, { font, color, alpha, align, baseline, ls, blur })   // ls 字距 px；blur 模糊入场用
rrect(x, y, w, h, r)                       // 只建路径，自己 fill/stroke
ring2d(cx, cy, tBirth, t, color, maxR, dur, lw=2)   // 冲击环：tBirth 起 dur 秒扩到 maxR 并淡出
dim(x1, y1, x2, y2, label, alpha, color=C.ink)      // 尺寸标注线（带端刻度与文字）
scramble(s, pool, p, frame, salt)          // 乱码：p 0→1 逐渐稳定；pool 用 CN_POOL / EN_POOL
typewriter(s, t, t0, cps=0.075, cursor='|')          // 逐字打出（返回当前应显示的字符串）
flash(t, tc, strength=0.85, k=16)          // 白闪（tc 时刻，指数衰减）
fadeBlack(t, t0, dur)                      // 淡入黑
```

### 基本件字母表

`GLYPHS[a–z]` 用 `line / arc / dot` 三种部件在 100×140 字框（基线 y=120，x 高 40，上伸 12，下伸 150）里定义。着色规则固定：弧与点 = 主色，横竖线 = 墨色，斜线 = 灰色。

```js
drawGlyph(ch, gx, gy, scale, age, stagger=0.09)   // 各部件按 stagger 依次弹入（弹簧 + 描画进度）
drawPart(part, u, lw=20)                          // 单个部件，u 描画进度
```
没有定义的字符（数字、中文）自动退回粗体文字盖下。

### 字标 / 徽标

```js
wordmark()             // {fs, font, ls, w}：字标字号使宽度 ≈ SPEC.brand.wordmarkWidth（默认由字母数决定）
markSize(s)            // 字标或 logo 图的宽高
badgeRect(cx, cy, s)   // 徽标矩形 {x,y,w,h,r}（标记 + 内边距）
drawMark(cx, cy, s, color)   // 画字标文字或 logo 图（tint 为 true 时按 color 着色）
drawBadge(cx, cy, s, alpha)  // 主色圆角矩形 + 白色标记
```
无拉丁名时字标自动用中文名（`MARK_TEXT`）。

### HUD

`hud(t, frame, theme)` 由引擎自动画：左上两行（`SPEC.hud.topLeft`，`headerFadeIn` 秒后淡入）、右上时间码 + 规格、左下版权、右下 BAR/BEAT、底部 24 段迷你频谱、四角取景框。`theme === 'light'` 时前景用墨色。`SPEC.hud.show = false` 关闭。

## PROJECT 钩子契约

```js
PROJECT.look(t)  → { bg:[r,g,b], grain, vig, theme:'dark'|'light'|'primary', expo? }
PROJECT.fx(t)                 // 只调 GL.*
PROJECT.draw(t, frame, look)  // 只调 ui / txt 等 2D
PROJECT.overlay(t, frame)     // 可选：白闪、淡出，画在 HUD 之上
PROJECT.score(kit)            // 用乐器包调度全曲（离线渲染与实时预览共用）
```
`draw(t)` 的顺序：look → GL → 清 2D → draw → hud → overlay。

## 乐器包 `makeKit(ctx, t0)`

所有时间参数是**绝对秒**（相对片头），内部加 `t0`。总线：`master → 压缩(-18 dB, 3:1) → 限制(-6 dB, 20:1) → 输出增益(SPEC.music.outGain)`；延迟发送 `dly`（3/4 拍，反馈 0.34，低通 2.6 k）。

```js
kit.tone({ type, f, t, dur, g, a, d, s, r, detune, lp, lpEnd, q, dest, wet, pitchTo, pitchDur })  // 通用振荡器 + ADSR
kit.noise({ t, dur, g, a, r, type, f, fEnd, q, dest, wet })                                       // 滤波噪声
kit.kick(t, g=0.7, f0=170, f1=46)      kit.hat(t, g=0.12, dur=0.045)      kit.clap(t, g=0.24)
kit.bass(t, midi, dur=0.22, g=0.22)    kit.pluck(t, midi, g=0.14, dur=0.34)
kit.bell(t, midi, g=0.2, dur=0.5)      kit.marimba(t, midi, g=0.16)       kit.tick(t, f0=420, f1=260, g=0.28)
kit.pad(t, dur, [midi...], g=0.08, lp=900, lpEnd=1800, pump=false)        // pump=true 按拍抽吸
kit.riser(t, dur, g=0.3)  kit.sweep(t, dur=0.5, g=0.22)  kit.stab(t, [midi...])  kit.impact(t, g=1)
kit.blip(t, f=1300, g=0.09)  kit.click(t, f=3600, g=0.07)
kit.fadeOut(t1, t2)                    // 总淡出
kit.N.C4 / kit.NOTE(midi) / kit.BEAT
```

## 导出接口（export.mjs 用）

```js
window.__ready            // logo 图与字体加载完成后为 true
window.__meta             // {title, W, H, FPS, DUR, FRAMES, BPM, hasFloat, TL, verify, primary}
window.__seek(frame)      // 画该帧，两次 rAF 后 resolve（截图前等它）
window.__renderAudioWav() // OfflineAudioContext 渲染全曲 → base64 WAV
```
预览：`index.html` 的 PLAY 按钮用实时 AudioContext 跑同一个 `PROJECT.score`；`?frame=N` 静态看某帧；`?export=1` 去掉缩放与按钮。

## 确定性规则（违反会导致并行导出撕裂、两次结果不一致）

- 不用 `Math.random()`、`Date.now()`、`performance.now()`；数据表在加载时用 `mulberry32(SPEC.seed + k)` 生成一次。
- 粒子位置写成 `t` 的闭式：飞出用 `easeOutExpo(age/1.3)`，减速用 `v*(1-exp(-k·tau))/k`，摆动用 `sin(t·f + phase)`。
- 颗粒噪声在 shader 里用整数哈希 `(像素坐标 + 帧号)`，不用浮点 `fract(sin())`（在 SwiftShader 下会出现条纹）。
- 缓存（如 `wordmark()`）只缓存与 `t` 无关的量。
