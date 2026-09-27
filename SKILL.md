---
name: motion-graphics
description: "代码生成动效引擎：从品牌/主题简报（可带参考视频）出发，直接产出带合成配乐、经自动核对的成片 MP4——分镜设计、WebGL2 粒子光效、Canvas2D 文字与蓝图图形、Web Audio 代码合成配乐、无头 Chrome 逐帧导出、ffmpeg 编码、numpy 测响度/测同步，全链路。当用户提到'动画''动效''品牌动画''logo 动画''片头''开场动画''宣传片''发布会视频''产品视频''粒子特效''光效''分镜''配乐合成''逆向这个视频的技术栈''按这个视频的风格做一支''做成 MP4''motion graphics''brand motion''title sequence''kinetic typography'等关键词，或给出品牌名/参考视频要求做一支视频时触发。即使用户没提代码、没指定工具、只说'帮我做个视频'也要用本 skill，不要改用 After Effects / 剪映 / 在线模板之类的方案回答。"
---

# Motion Graphics · 代码生成动效

用代码把一支 15–60 秒的品牌/主题动效从分镜做到成片：画面（WebGL2 光效层 + Canvas2D 图形层）和配乐（Web Audio 合成）都是时间 `t` 的纯函数，无头 Chrome 逐帧截图，ffmpeg 编码，脚本核对。首个案例是一支 30 s 的联想品牌片，模板里的默认分镜就是它的通用化版本——**改一个配置文件就能换品牌出片**，要换分镜再动场景文件。

## 产物

- `out/<title>_1080p30.mp4`（母版 crf17，体积大）与 `out/<title>_1080p30_web.mp4`（crf24，几 MB，交付用）
- `build/check_sheet.jpg` 15 格分镜拼图、`build/spectrogram.png` 频谱图、`build/audio.wav` 离线渲染的配乐
- 项目本身（`index.html` 双击可预览，点 PLAY 实时播放）

## 环境

本机需有 **Google Chrome**（或设 `CHROME=<路径>`）、**ffmpeg**、**Node ≥ 18**、**python3 + numpy**。依赖只有 `puppeteer-core` 与 `ws`（npm 装不了时用 `--modules-from` 软链已有项目的 node_modules）。

## 工作流

### 1. 读简报，定分镜
从用户话里抽出：品牌拉丁名 / 中文名、标语（中英）、主色（品牌色号，没有就按行业与气质选）、三个概念词（叙事弧：起点 → 过程 → 结果，如 想象/创造/智能）、时长与节奏、是否有 logo 图片、是否有参考视频。

- 有参考视频：先 `ffmpeg -i ref.mp4 -vf "fps=1,scale=480:270,tile=5x3" sheet_%d.jpg` 抽帧拼图并**看图**，写出它的"视觉语言"（配色、字体气质、HUD 元素、粒子类型、转场方式、幕结构、音乐感觉），再映射到模板的五幕。方法见 `references/storyboard.md`「逆向参考视频」。
- 无参考视频：直接用默认五幕（启动 → 星座 → 词卡 → 蓝图拼字 → 揭示），多数品牌片够用。
- 需要另起分镜（产品功能演示、数据可视化、纯文字排版等）：按 `references/storyboard.md` 设计节拍表，再用 `references/effects-cookbook.md` 里的配方拼场景。

### 2. 建项目
```bash
bash <skill>/scripts/new_project.sh <项目目录>            # 复制模板 + npm install
bash <skill>/scripts/new_project.sh <目录> --modules-from <已有项目>   # 离线：软链 node_modules
```
项目目录放在用户指定的位置；没指定就放在用户当前工作目录下，用品牌名做目录名。

### 3. 填 `spec.js`（永远先做这一步）
| 简报里的信息 | `spec.js` 字段 |
|---|---|
| 拉丁字标 / 中文名 | `brand.latin`（蓝图按小写逐字母拼装，a–z 都有基本件定义）/ `brand.cn` |
| 标语 | `brand.tagline`（逐字打出）/ `brand.taglineEn` |
| 品牌色 | `colors.primary` + `colors.primaryName`；`accent` 是光效暖色，暗色品牌一般保留金色 |
| 三个概念词 | `words`（每张 4 拍；`onPrimary: true` 的那张用主色满屏底，放中间一张最提气） |
| logo 图片 | `brand.logo = { src, height, tint }`，文件放项目目录；单色 alpha PNG 用 `tint: true`，多色用 `false` |
| HUD 文案 | `hud.topLeft` / `bottomLeft` / `credits`，`boot` 四行启动日志 |
| 节奏 | `bpm`（所有切点都在拍上，时间表随之伸缩）；`seed` 换一套粒子布局 |

时长由时间表决定（120 BPM、3 张词卡 = 30.0 s；每多一张词卡 +2 s）。不要在 `scenes.js` / `score.js` 里写死秒数——一律引用 `TL.*`，这样改 BPM 或词卡数不会散架。

### 4. 抽帧看效果（每次改动后都做）
```bash
bash <skill>/scripts/review_frames.sh <项目目录> 1.5,4.5,9,11,17,19.8,22,28
```
输出 `build/review_sheet.jpg`，**用 Read 打开看**——文字是否溢出/重叠、颜色是否协调、字母拼装是否完整、logo 尺寸是否合适。几秒钟一轮，比完整导出快两个数量级；别跳过这步直接导出。

### 5. 导出
```bash
cd <项目目录> && node export.mjs --parallel 3        # 30 s @1080p30 约 3 分钟
node export.mjs --parallel 3 --step 3                # 快速预览版（每 3 帧取 1，10 fps）
node export.mjs --from 0 --to 105 --no-encode && node export.mjs --encode-only   # 只重渲改过的一段
```
导出时间长，放后台跑，同时做别的（写说明、准备交付）。

### 6. 核对（导出后必做）
```bash
python3 verify.py
```
检查帧数/时长、五个时刻的底色类型、响度（目标 -14 LUFS 左右，真峰值 ≤ -0.5 dBTP）、切点音画同步（≤ 40 ms）、生成拼图与频谱图。**再用 Read 打开 `build/check_sheet.jpg` 亲眼看一遍**：脚本测不出文字错位、颜色难看这类问题。响度偏离就改 `music.outGain` 或 `node export.mjs --encode-only --gain ±X`。

### 7. 交付
- 发 `_web.mp4`（SendUserFile，`display: attach`）和 `build/check_sheet.jpg`；写清母版与网络版的磁盘路径。
- 说明可调项：`spec.js` 里改文案/配色即可重出；`build/frames/` 约 1.7 GB，可删。
- 品牌名与标识是对方商标：字标用系统字体近似排版，提醒对外使用前换官方 logo 资产（`brand.logo`）。
- 不要把带真实品牌标识的页面发布成公开 Artifact；成片以文件交付。

## 改分镜 / 改配乐时

- `scenes.js` 暴露四个钩子：`PROJECT.look(t)`（底色/颗粒/暗角/主题）、`PROJECT.fx(t)`（GL 光效）、`PROJECT.draw(t, frame)`（2D 图形）、`PROJECT.overlay(t)`（白闪/淡出）。引擎 API、坐标系、确定性规则见 `references/engine-api.md`。
- 视觉配方（火花、冲击环、星座网络、流光拖尾、爆发与纸屑、乱码文字、蓝图标注、基本件拼字母、描边灌入、镜头光条、环绕光点、打字机、模糊入场）见 `references/effects-cookbook.md`，每个都有可直接粘的代码与可调旋钮。
- 配乐：`score.js` 的 `PROJECT.score(kit)` 用乐器包调度；乐器、编曲套路、混音链、响度调法见 `references/music.md`。切点上的声音（stab / impact / bell）必须引用与画面相同的 `TL` 时间点，这是"同步靠构造保证"的含义。
- 踩过的坑（削波、导出慢、文件巨大、交叉淡变重影、长字母名、字体）见 `references/troubleshooting.md`，遇到异常先查它。

## 铁律

1. **纯函数**：任何帧只依赖 `t`。随机用 `mulberry32(SPEC.seed + k)`，粒子位置写成闭式（`x = f(t)`），不做逐帧累积——否则无法随机访问帧、并行导出会撕裂、两次导出结果不一致。
2. **拍点**：场景切换、重击、字母落下都放在 `TL` 的拍点上，画面和声音引用同一个数。
3. **看图**：`review_frames.sh` 和 `check_sheet.jpg` 都要真的打开看，再下结论；不要只看脚本 PASS。
4. **分层**：光效（辉光、拖尾、爆发）进 GL 层，文字与线框进 2D 层，不要用 2D 画大面积模糊。

## 文件

```
SKILL.md
scripts/new_project.sh        新建项目（复制模板 + 装依赖）
scripts/review_frames.sh      抽帧拼图（秒 → 帧 → build/review_sheet.jpg）
assets/template/              项目模板：index.html · spec.js · engine.js · scenes.js · score.js · export.mjs · verify.py
references/engine-api.md      引擎 API、PROJECT 钩子契约、乐器包签名、确定性规则
references/storyboard.md      节拍表设计、五幕结构、逆向参考视频、品牌适配清单
references/effects-cookbook.md 视觉效果配方（代码 + 旋钮）
references/music.md           配乐：乐器、编曲、混音、响度
references/troubleshooting.md 常见问题
```
