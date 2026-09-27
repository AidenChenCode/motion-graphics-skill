# 配乐：合成、编曲、混音、响度

配乐全部由 `PROJECT.score(kit)` 用 Web Audio 节点合成，没有任何采样文件。导出时 `OfflineAudioContext(2, 48000 × 时长, 48000)` 一次性渲染成 WAV，预览时同一函数跑在实时 `AudioContext` 上。

## 乐器包速查

| 乐器 | 声音 | 典型用法 |
|---|---|---|
| `kick(t, g, f0, f1)` | 正弦 170→46 Hz 快速下滑 + 点击噪声 | 每拍；蓝图段每小节一下、更软（140→50, g 0.5） |
| `hat(t, g, dur)` | 高通白噪 7.5 k 短音 | 后半拍；riser 段 16 分/32 分加密并逐渐变响 |
| `clap(t, g)` | 三层带通噪声错开 9 ms | 2、4 拍 |
| `bass(t, midi, dur, g)` | 锯齿 + 方波，低通 520/380 | 八分音符律动，根音为主偶尔八度 |
| `pluck(t, midi, g, dur)` | 锯齿低通快速关闭 + 三角 | 琶音 |
| `bell(t, midi, g, dur)` | 正弦 + 2.76×/4.07× 非谐泛音 | 元素落下、揭示点缀、收尾 |
| `marimba(t, midi, g)` | 正弦 + 4× 短泛音 | 浅色/理性段旋律 |
| `tick(t, f0, f1, g)` | 快速下滑短音 | 木鱼感的 UI 落地 |
| `pad(t, dur, notes, g, lp, lpEnd, pump)` | 两路 ±8 音分失谐锯齿 + 低通 | 每幕一个和弦；`pump` 做侧链抽吸 |
| `riser(t, dur, g)` | 带通噪声 300→6 k 扫频 + 三角上滑 | 切点前 2–4 拍 |
| `sweep(t, dur, g)` | 短上扫 | 小切场 |
| `stab(t, notes)` | 三路失谐锯齿和弦 + 低频下落 + 噪声 | 词卡切点 |
| `impact(t, g)` | 次低频 72→27 Hz 下潜 + 2.2 s 长镲 + 低频冲击 | 大揭示 |
| `blip(t, f, g)` / `click(t, f, g)` | 短高频音 / 短带通噪声 | HUD 启动、打字机 |

音高用 MIDI 号：`kit.N.C4 = 60`，`kit.NOTE(midi)` 转 Hz。默认曲在 A 小调（A C D E G 五声琶音），词卡轮换 F / G / Am，揭示落到 F 大三和弦（VI 级，明亮释放），收尾 C add9。

## 编曲套路（对应五幕）

- **启动**：几乎无节奏——嗡鸣、噪声上扬、三声 blip；给耳朵留白，鼓进来时才有对比。
- **生长段**：抽吸垫音（`pump: true`）+ 底鼓每拍 + hat 后半拍 + 贝斯八分；琶音晚 4 拍进。末尾 riser 3 拍。
- **词卡**：每张 `stab` 在切点 + 4 拍 pad；鼓组加拍手；最后一张的鼓提前 1 拍停，`sweep` 反向上扫接下一幕。
- **理性段**（浅色）：去掉鼓的重量（每小节一下软 kick），马林巴八分旋律 + 16 分走针 `click`；元素落地用 `tick`，序列出现用上行音阶的 `bell`。末尾 riser 4.4 拍 + hat 加密到 32 分。
- **揭示**：`impact` + 宽 pad（6 音）+ 高音 bell；之后每 2 拍一下软 kick、每拍 hat、琶音 + 贝斯回来但音量减半；文字打字用 `click` 逐字。
- **收尾**：只留 pad 与一两声 bell，`kit.fadeOut(TL.fade, TL.end - 0.1)` 总淡出。

## 同步靠构造

切点声音的 `t` 必须写 `TL.cards[c]`、`TL.reveal` 这类与画面同源的量。`verify.py` 会在这些时刻找起音（能量突增 > 6 dB），偏差 > 40 ms 报 FAIL——通常是 score 里写了不同的时间点，或者切点上根本没有瞬态（只有 pad 渐入是测不出的，切点上加个 stab/impact/tick）。

## 混音链与响度

```
乐器 → master → DynamicsCompressor(-18 dB, 3:1, knee 10) → DynamicsCompressor(-6 dB, 20:1, knee 0，当限制器) → Gain(outGain 0.75) → 输出
```
Chrome 的 `DynamicsCompressor` 自带补偿增益，只放一个压缩器会把混音推到 0 dBFS 硬削波（真峰值 +0.9、波形削平）。限制器 + 输出增益这两级是必需的。

目标：Integrated −16 … −12 LUFS（网络视频常用 −14），True Peak ≤ −1 dBTP，LRA 3–8 LU。测：
```bash
ffmpeg -i build/audio.wav -filter:a ebur128=peak=true -f null -     # 看 Summary
python3 verify.py                                                   # 已包含响度与峰值检查
```
偏离时改 `SPEC.music.outGain`（每 0.1 ≈ 1.2 dB），或编码时 `node export.mjs --encode-only --gain -2`。单个乐器太抢就降它的 `g`，别动总线。

## 改曲风

- 换调：把 `N.A1/A3/…` 整体平移（+2 = B 小调）；大调气质把琶音换成 C E G A、和弦换 C / F / G。
- 换速度：只改 `SPEC.bpm`，所有 `b(n)` 与 `BEAT` 自动跟随；120 → 100 时 30 s 变 36 s。
- 更电子：hat 改 16 分、bass 加 `lp: 900` 更亮、pad `lpEnd` 提到 4000。
- 更管弦/柔和：去掉 kick/hat，pad `g` 加倍、`a` 更长，用 bell/marimba 铺旋律，riser 换成 pad 音量渐强。
- 静音版：`PROJECT.score = kit => kit.fadeOut(0, 0.1)`，导出仍会产生一条静音轨（保持容器一致）。
