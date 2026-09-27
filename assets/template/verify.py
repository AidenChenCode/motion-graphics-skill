#!/usr/bin/env python3
"""核对（技术栈的"核对"层）—— 用法: python3 verify.py [out/xxx.mp4]
   1. ffprobe        容器 / 编码 / 时长 / 帧数
   2. ffmpeg 抽帧    15 个均匀时刻拼成 build/check_sheet.jpg（请打开看画面）；numpy 检查各时刻底色类型
   3. ffmpeg ebur128 测响度（Integrated LUFS / LRA / True Peak）
   4. numpy          从音轨提取起音(onset)，与 build/meta.json 里的画面切点比对 → 测音画同步
   5. ffmpeg         频谱图 build/spectrogram.png
   预期值来自 build/meta.json（export.mjs 写入，内容取自 spec.js 的 SPEC.verify）。
"""
import glob, json, os, re, subprocess, sys, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, 'build')
meta = json.load(open(os.path.join(BUILD, 'meta.json')))
FPS, DUR, STEP = meta['FPS'], meta['DUR'], meta.get('step', 1)
FRAMES = meta['FRAMES'] // STEP
V = meta.get('verify') or {}
CUES = V.get('cues', []); COLORS = V.get('colors', [])
PRIMARY = meta.get('primary', '#000000')
TOL_MS = 40   # ≈ 1 帧 @30fps

if len(sys.argv) > 1: MP4 = sys.argv[1]
else:
    cands = sorted(glob.glob(os.path.join(ROOT, 'out', '*.mp4')), key=os.path.getmtime)
    if not cands: sys.exit('out/ 里没有 MP4，先运行 node export.mjs')
    MP4 = cands[-1]

def run(cmd, binary=False): return subprocess.run(cmd, capture_output=True, text=not binary)
ok_all = True
def check(name, cond, detail=''):
    global ok_all; ok_all &= bool(cond); print(f"  [{'PASS' if cond else 'FAIL'}] {name}  {detail}")

print(f"== verify {MP4}")
p = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels', '-of', 'json', MP4])
info = json.loads(p.stdout)
v = next(s for s in info['streams'] if s['codec_type'] == 'video'); a = next(s for s in info['streams'] if s['codec_type'] == 'audio')
dur = float(info['format']['duration'])
print(f"  video {v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']} nb_frames={v.get('nb_frames')} | audio {a['codec_name']} {a['sample_rate']} Hz {a['channels']}ch | {dur:.3f} s")
check('container/codec h264 + aac', v['codec_name'] == 'h264' and a['codec_name'] == 'aac')
check(f'frame count == {FRAMES}', int(v.get('nb_frames', 0)) == FRAMES, v.get('nb_frames'))
check(f'duration ≈ {DUR:.1f} s', abs(dur - DUR) < 0.1, f"{dur:.3f}")

# ---------- 抽帧 ----------
times = [(i + 0.5) * DUR / 15 for i in range(15)]
for f in glob.glob(os.path.join(BUILD, 'chk_*.jpg')): os.remove(f)
for i, t in enumerate(times):
    run(['ffmpeg', '-y', '-v', 'error', '-ss', f"{t:.3f}", '-i', MP4, '-frames:v', '1', '-vf', 'scale=480:-2', os.path.join(BUILD, f'chk_{i:02d}.jpg')])
run(['ffmpeg', '-y', '-v', 'error', '-framerate', '1', '-i', os.path.join(BUILD, 'chk_%02d.jpg'), '-vf', 'tile=5x3', '-frames:v', '1', os.path.join(BUILD, 'check_sheet.jpg')])
print(f"  contact sheet → {os.path.join(BUILD, 'check_sheet.jpg')}")

def mean_rgb(t):
    p = run(['ffmpeg', '-v', 'error', '-ss', f"{t:.3f}", '-i', MP4, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], binary=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, 3).mean(0)
prim = np.array([int(PRIMARY[1:3], 16), int(PRIMARY[3:5], 16), int(PRIMARY[5:7], 16)], float)
KIND = {
    'dark':    lambda c: c.mean() < 70,
    'black':   lambda c: c.mean() < 8,
    'light':   lambda c: c.mean() > 180,
    'primary': lambda c: np.linalg.norm(c - prim) < 90,
}
for item in COLORS:
    t, kind = item['t'], item['kind']
    c = mean_rgb(t); check(f"t={t:.2f} is {kind}", KIND[kind](c), f"mean RGB = {np.round(c, 1)}")

# ---------- 响度 ----------
p = run(['ffmpeg', '-i', MP4, '-filter:a', 'ebur128=peak=true', '-f', 'null', '-'])
tail = p.stderr[p.stderr.rfind('Summary:'):]
lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1))
lra = float(re.search(r'LRA:\s+([\d.]+) LU', tail).group(1))
peak = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
print(f"  loudness: integrated {lufs:.1f} LUFS · LRA {lra:.1f} LU · true peak {peak:.1f} dBTP")
check('integrated loudness in [-18, -11] LUFS', -18 <= lufs <= -11, f"{lufs:.1f}  (偏离时改 spec.js 的 music.outGain 或 export --gain)")
check('true peak ≤ -0.5 dBTP', peak <= -0.5, f"{peak:.1f}")

# ---------- 音画同步 ----------
wav = os.path.join(BUILD, 'verify_audio.wav')
run(['ffmpeg', '-y', '-v', 'error', '-i', MP4, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav])
with wave.open(wav) as w:
    sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
hop, win = int(sr * 0.005), int(sr * 0.02)
n = (len(x) - win) // hop
rms = np.array([np.sqrt(np.mean(x[i * hop:i * hop + win] ** 2)) for i in range(n)])
db = 20 * np.log10(rms + 1e-6)
onset = np.maximum(np.diff(db), 0)
t_axis = (np.arange(len(onset)) + 1) * hop / sr
peaks = [i for i in range(len(onset)) if onset[i] > 6 and onset[i] == onset[max(0, i - 24):i + 25].max()]
strong = sorted(peaks, key=lambda i: -onset[i])[:12]
print('  strongest onsets (s): ' + ', '.join(f"{t_axis[i]:.2f}(+{onset[i]:.0f}dB)" for i in sorted(strong, key=lambda i: t_axis[i])))
for te in CUES:
    near = min(peaks, key=lambda i: abs(t_axis[i] - te)) if peaks else None
    delta = (t_axis[near] - te) * 1000 if near is not None else float('inf')
    check(f'sync cue @ {te:.2f} s', abs(delta) <= TOL_MS, f"nearest onset Δ = {delta:+.0f} ms")

run(['ffmpeg', '-y', '-v', 'error', '-i', MP4, '-lavfi', 'showspectrumpic=s=1920x540:legend=1:color=intensity:scale=log', os.path.join(BUILD, 'spectrogram.png')])
print(f"  spectrogram → {os.path.join(BUILD, 'spectrogram.png')}")
print('== RESULT:', 'ALL PASS' if ok_all else 'SOME CHECKS FAILED')
sys.exit(0 if ok_all else 1)
