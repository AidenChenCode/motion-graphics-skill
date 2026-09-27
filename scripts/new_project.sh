#!/usr/bin/env bash
# 从模板新建一个动效项目并安装依赖
#   用法: new_project.sh <目标目录> [--modules-from <已有项目目录>]
#   --modules-from 用已有项目的 node_modules 软链，免去 npm install（离线或省时间时用）
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?用法: new_project.sh <目标目录> [--modules-from <已有项目目录>]}"
modules_from=""
if [[ "${2:-}" == "--modules-from" ]]; then modules_from="${3:?--modules-from 需要路径}"; fi

mkdir -p "$dest"
cp -R "$here/assets/template/." "$dest/"
mkdir -p "$dest/build/frames" "$dest/out"
cd "$dest"

if [[ -n "$modules_from" && -d "$modules_from/node_modules" ]]; then
  ln -sfn "$(cd "$modules_from" && pwd)/node_modules" node_modules
  echo "node_modules → 软链自 $modules_from"
elif npm install --no-audit --no-fund >/dev/null 2>&1; then
  echo "npm install ok（puppeteer-core + ws）"
else
  echo "npm install 失败：可用 --modules-from <已有项目> 软链现成的 node_modules" >&2
fi

for tool in ffmpeg python3; do command -v "$tool" >/dev/null || echo "警告：未找到 $tool" >&2; done
python3 -c "import numpy" 2>/dev/null || echo "警告：python3 缺 numpy（verify.py 需要）" >&2
[[ -d "/Applications/Google Chrome.app" || -n "${CHROME:-}" ]] || echo "警告：未找到 Google Chrome，可用环境变量 CHROME 指定路径" >&2

cat <<EOF

项目已创建：$dest
下一步：
  1. 编辑 spec.js（品牌名 / 中文名 / 标语 / 配色 / 三个概念词 / HUD 文案 / 可选 logo 图片）
  2. 抽帧看效果：bash "$here/scripts/review_frames.sh" "$dest" 1.5,4.5,9,11,17,19.8,22,28
  3. 完整导出：  cd "$dest" && node export.mjs --parallel 3
  4. 核对：      python3 verify.py   （再打开 build/check_sheet.jpg 与 build/spectrogram.png 看）
EOF
