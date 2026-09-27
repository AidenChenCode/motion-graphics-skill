#!/usr/bin/env bash
# 渲染指定时刻的帧并拼成一张图，用于快速看效果（不必等完整导出）
#   用法: review_frames.sh <项目目录> <秒,秒,...> [--cols N]
#   输出: <项目目录>/build/review_sheet.jpg（每格左上角标注时间与帧号）
set -euo pipefail
dir="${1:?用法: review_frames.sh <项目目录> <秒,秒,...> [--cols N]}"
times="${2:?请给出以逗号分隔的秒数，如 1.5,4.5,9,17,22,28}"
cols=4
if [[ "${3:-}" == "--cols" ]]; then cols="${4:?}"; fi
cd "$dir"

fps=$(node -e "$(cat spec.js); console.log(SPEC.fps)")
frames=$(node -e "console.log('$times'.split(',').map(s => Math.round(parseFloat(s) * $fps)).join(','))")
rm -f build/test_*.png
node export.mjs --test "$frames" | grep -v "test frame" || true

IFS=',' read -ra T <<< "$times"
inputs=(); labeled=""; plain=""; i=0
for f in $(echo "$frames" | tr ',' ' '); do
  inputs+=(-i "$(printf 'build/test_%04d.png' "$f")")
  labeled+="[$i:v]scale=640:360,drawbox=x=0:y=0:w=170:h=34:color=black@0.55:t=fill,drawtext=text='t=${T[$i]}s  f=$f':x=10:y=9:fontsize=18:fontcolor=white[v$i];"
  plain+="[$i:v]scale=640:360[v$i];"
  i=$((i+1))
done
n=$i; rows=$(( (n + cols - 1) / cols ))
concat=""; for ((k=0; k<n; k++)); do concat+="[v$k]"; done
tail="${concat}concat=n=$n:v=1:a=0,tile=${cols}x${rows}"
# drawtext 需要 ffmpeg 带 freetype；不带则退回无标签版本
ffmpeg -y -v error "${inputs[@]}" -filter_complex "${labeled}${tail}" -frames:v 1 build/review_sheet.jpg 2>/dev/null \
  || ffmpeg -y -v error "${inputs[@]}" -filter_complex "${plain}${tail}" -frames:v 1 build/review_sheet.jpg
echo "review sheet → $dir/build/review_sheet.jpg  ($n frames: $times)"
