# 代码生成动效项目

由 `motion-graphics` skill 生成。画面（WebGL2 + Canvas2D）与配乐（Web Audio）都是时间 `t` 的纯函数，用无头 Chrome 逐帧导出，ffmpeg 编码，脚本核对。

```
spec.js      项目配置：品牌 / 配色 / 文案 / BPM / HUD / 核对项      ← 通常只改这里
scenes.js    分镜：PROJECT.look / fx / draw / overlay               ← 要换分镜时改
score.js     配乐：PROJECT.score(kit)                               ← 要换曲风时改
engine.js    引擎：光效层、图形层、乐器包、导出接口（一般不改）
index.html   壳：两层 canvas + PLAY 按钮，浏览器直接打开可预览
export.mjs   导出：puppeteer-core → Chrome 无头 → PNG 序列 → ffmpeg
verify.py    核对：ffprobe / 抽帧拼图 / 底色 / 响度 / 音画同步 / 频谱图
build/       中间产物（frames/ 很大，导出后可删）
out/         成片：<title>_1080p30.mp4（母版 crf17）与 _web.mp4（网络版 crf24）
```

```bash
npm install                       # puppeteer-core + ws（需要本机 Google Chrome、ffmpeg、python3 + numpy）
open index.html                   # 预览（点 PLAY；?frame=N 看静态帧）
node export.mjs --test 45,255,620 # 抽几帧看效果 → build/test_*.png
node export.mjs --parallel 3      # 完整导出（3 路并行，约 3 分钟 / 30 s 1080p30）
python3 verify.py                 # 核对，看 build/check_sheet.jpg 与 build/spectrogram.png
```
