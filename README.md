# motion-graphics — 代码生成品牌动效的 Claude Code Skill

> A Claude Code skill that turns a brand brief (optionally plus a reference video) into a finished motion-graphics MP4 — storyboard, WebGL2 particle light effects, Canvas2D typography, a soundtrack synthesized with Web Audio, headless-Chrome frame export, ffmpeg encoding and automated verification — all from code.

一句话：给 Claude 一个品牌名（和可选的参考视频），它输出一支 30 秒、带配乐、经过自动核对的 1080p 品牌动画。

## 技术栈

| 层 | 技术 |
|---|---|
| 画面 | WebGL2（RGBA16F 浮点纹理 HDR 累积、实例化精灵光效、连线）+ Canvas2D（文字、蓝图标注、HUD） |
| 音乐 | Web Audio 代码合成（鼓、贝斯、琶音、垫音、riser、stab…），`OfflineAudioContext` 离线一次性渲染 |
| 导出 | Node.js + puppeteer-core（CDP over ws）驱动本机 Chrome 无头模式逐帧截图，支持多进程并行 |
| 编码 | ffmpeg libx264 + AAC，母版（crf17）与网络版（crf24） |
| 核对 | ffprobe / ffmpeg 抽帧拼图与频谱图，`ebur128` 测响度，numpy 起音检测测音画同步 |

画面与声音都是时间 `t` 的纯函数（带种子随机、闭式粒子运动），任意帧可随机访问，两次导出逐比特一致，音画同步靠共用一张时间表在构造上保证。

## 安装

```bash
git clone https://github.com/AidenChenCode/motion-graphics-skill.git ~/.claude/skills/motion-graphics
```

需要本机有 Google Chrome、ffmpeg、Node ≥ 18、Python 3 + numpy。

## 使用

在 Claude Code 里直接说，例如：

- 「给 XX 品牌做一支 30 秒品牌动画，主色 #E2231A，标语『……』，导出 MP4」
- 「按这个视频的风格给 XX 做一支 15 秒开场」
- 「用这个 logo 图片做个 logo 动画，不要中文，配乐轻一点」

或手动：

```bash
bash ~/.claude/skills/motion-graphics/scripts/new_project.sh ~/my-brand      # 建项目
# 编辑 ~/my-brand/spec.js：品牌名 / 中文名 / 标语 / 配色 / 三个概念词 / 可选 logo
bash ~/.claude/skills/motion-graphics/scripts/review_frames.sh ~/my-brand 1.5,4.5,9,11,17,19.8,22,28   # 抽帧看效果
cd ~/my-brand && node export.mjs --parallel 3 && python3 verify.py             # 导出 + 核对
```

## 结构

```
SKILL.md                       工作流（Claude 读）
scripts/new_project.sh         从模板建项目 + 装依赖
scripts/review_frames.sh       抽帧拼图快速预览
assets/template/               项目模板
  spec.js                      品牌配置 + 以"拍"定义的时间表 ← 通常只改这个
  scenes.js                    默认五幕分镜（启动 → 星座 → 词卡 → 蓝图拼字 → 揭示）
  score.js                     默认配乐
  engine.js                    引擎：光效层 / 图形层 / 乐器包 / 导出接口
  export.mjs · verify.py       导出与核对
references/                    引擎 API、分镜设计、效果配方、配乐、常见问题
evals/                         测试提示词
```

## 说明

- 默认分镜由一支联想（Lenovo）品牌演示片通用化而来；模板里的演示品牌 NOVA 为虚构。
- 生成的片子若使用真实品牌名称与标识，请在对外使用前替换为官方 logo 资产（`spec.js` 的 `brand.logo`），并遵守相应商标规范。
