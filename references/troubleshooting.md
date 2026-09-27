# 常见问题

## 导出 / 环境

**找不到 Chrome** — `export.mjs` 依次找 macOS Google Chrome / Chromium、Linux `google-chrome` / `chromium`、Windows 默认路径；都没有就 `CHROME=/path/to/chrome node export.mjs`。Linux 无头可能还需要 `--no-sandbox`（加到 `puppeteer.launch` 的 `args`）。

**npm install 失败 / 离线** — `new_project.sh <目录> --modules-from <已有项目>` 软链现成的 `node_modules`；模板只依赖 `puppeteer-core` 与 `ws`。

**导出很慢** — 无头 Chrome 抓 1080p PNG 约 2.5 帧/秒/进程。`--parallel 3` 约快 2 倍（三个进程各渲一段，最后统一编码）；看动态用 `--step 3` 出 10 fps 预览版；改了某幕只重渲那段 `--from A --to B --no-encode` 再 `--encode-only`。

**帧渲完了但进程几分钟不退出（并行时"all frames done"比子进程晚 4 分钟）** — 长时间渲染后 Chrome 退出很慢，Node 跟着挂住。`export.mjs` 已内置：`browser.close()` 15 s 超时后 `SIGKILL`，然后 `process.exit`。自己改导出脚本时保留这两步。

**页面报错 `PAGE ERROR …`** — 通常是 `scenes.js` / `score.js` 的语法或引用错误。先在浏览器直接打开 `index.html` 看控制台；`review_frames.sh` 也会把错误打出来。

**`__ready` 超时** — logo 图路径不对（相对 `index.html`），或字体加载挂起。看控制台里的 `logo image failed to load`。

**float texture: false** — 该机器的 WebGL 没有 `EXT_color_buffer_float`，引擎自动退回 RGBA8：辉光叠加会更早饱和（偏白），把 `GL.end` 的 `expo` 降到 0.7 左右补偿。

## 画面

**颗粒出现规则条纹** — 颗粒哈希必须用整数版（引擎已内置）；不要改回 `fract(sin(dot()))`，在 SwiftShader 下会出条纹。

**两段文字交接出重影** — 同位置的文字交接要"先淡出、再淡入"，交叉淡变 + 半个字符的错位会看到双影。

**字母拼装挤成一团 / 溢出** — 槽宽 `SLOT_W = min(158, 1000 / 字母数)` 自动压缩，字母 > 9 个会很小：改用 `brand.logo` 官方图，或只拼前 6 个字母（`scenes.js` 里 `LATIN.slice(0, 6)`）。

**中文没显示 / 变方块** — 无头 Chrome 用系统字体：macOS 有 PingFang SC，Linux 需装 `fonts-noto-cjk`。自定义字体用 `@font-face { src: url('./font.ttf') }` 放在 `index.html` 里（file:// 下允许），引擎会等 `document.fonts.ready`。

**浅色场景 HUD 看不清** — `PROJECT.look` 返回 `theme: 'light'`，HUD 自动改墨色；漏写 theme 就还是白字。

**主色太浅，词卡白字读不清** — `onPrimary` 的卡把底色换成 `PRIM_DARK`（scenes.js 已定义），或该卡不用 `onPrimary`。

**换分辨率后位置全错** — `scenes.js` 的位置常量按 1080p 写的；竖版/4K 要按 `W/1920`、`H/1080` 缩放常量，或维持 1080p 渲染后用 ffmpeg `scale`。

## 声音

**削波 / 真峰值 > 0 dB** — Chrome 压缩器自带补偿增益；确认总线是 压缩 → 限制 → outGain（引擎默认），再降 `SPEC.music.outGain`。

**响度不在 −18 … −11 LUFS** — 改 `outGain`（每 0.1 ≈ 1.2 dB）或 `--encode-only --gain ±X`。不要靠拉高单个乐器。

**同步检查 FAIL（Δ 大）** — score 里该切点用了别的时间；或者切点上只有渐入的 pad 没有瞬态——加 `stab` / `impact` / `tick`。检查方法：`verify.py` 打印的 strongest onsets 与 `TL` 对照。

**预览没声音** — 浏览器要求用户手势，必须点 PLAY；`?export=1` 模式没有按钮属正常。

## 文件与交付

**母版 150 MB+** — 逐帧随机颗粒对 x264 很不友好，母版 crf17 约 40 Mb/s。交付用 `_web.mp4`（crf24，约 2 Mb/s、几 MB），画面几乎无差。想母版也小：`grain` 降到 0.03。

**`build/frames/` 1.7 GB** — 导出后可删；留着可以 `--encode-only` 重编码而不重渲。

**verify 说 frame count 不对** — 用了 `--step` 的预览版帧数是 FRAMES/step，`meta.json` 里记录了 step，verify 会按它算；如果手动混用了不同 step 的帧，清空 `build/frames/` 重导。

**商标** — 品牌名与标识属对方所有；交付时说明字标是系统字体近似，正式使用请换 `brand.logo` 官方文件。带真实品牌的页面不要发布成公开 Artifact，以文件交付。
