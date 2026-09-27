#!/usr/bin/env node
/* =====================================================================
   导出：Node.js + puppeteer-core（CDP 走 ws WebSocket）驱动本机 Chrome 无头模式
     1. 打开 index.html?export=1，等待 window.__ready，写 build/meta.json（verify.py 用）
     2. 页面内 OfflineAudioContext 一次性离线渲染音乐 → build/audio.wav
     3. 逐帧 __seek(f) → Page.captureScreenshot → build/frames/f_0000.png …
     4. ffmpeg：PNG 序列 + WAV → libx264 crf17 母版 + crf24 网络版（AAC 192k）→ out/

   用法
     node export.mjs --parallel 3            推荐：3 个无头 Chrome 分段并行渲染，最后统一编码（约快 2 倍）
     node export.mjs                         单进程完整导出
     node export.mjs --test 45,255,620       只渲染指定帧到 build/test_XXXX.png（看效果用；用 scripts/review_frames.sh 更方便）
     node export.mjs --step 3                快速预览：每 3 帧取 1 帧（帧率变为 FPS/3），配合 --parallel
     node export.mjs --from 0 --to 105 --no-encode    只重渲一段帧（改了某个场景后），再 --encode-only
     node export.mjs --encode-only [--gain 1.5]        只跑 ffmpeg（可给音频加减 dB）
     node export.mjs --audio-only [--no-encode]        只重新离线渲染音频
   环境变量 CHROME 可指定浏览器路径。
   ===================================================================== */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const BUILD = path.join(ROOT, 'build'), FR = path.join(BUILD, 'frames'), OUT = path.join(ROOT, 'out');
const WAV = path.join(BUILD, 'audio.wav'), META = path.join(BUILD, 'meta.json');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = k => args.includes(k);
const testFrames = opt('--test')?.split(',').map(Number) ?? null;
const step = Math.max(1, +(opt('--step') ?? 1));
const parallel = Math.max(1, +(opt('--parallel') ?? 1));
const gainDb = opt('--gain');
const isChild = has('--child');

for (const d of [BUILD, FR, OUT]) fs.mkdirSync(d, { recursive: true });
const pad4 = n => String(n).padStart(4, '0');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const slug = s => (s || 'motion').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'motion';

async function openPage() {
  if (!CHROME) throw new Error('未找到 Chrome，请设置环境变量 CHROME=<可执行文件路径>');
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required',
           '--enable-unsafe-swiftshader', '--disable-lcd-text', '--font-render-hinting=none', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') log('CONSOLE', m.text()); });
  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href + '?export=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  const meta = await page.evaluate(() => window.__meta);
  await page.setViewport({ width: meta.W, height: meta.H, deviceScaleFactor: 1 });
  fs.writeFileSync(META, JSON.stringify({ ...meta, step, generated: new Date().toISOString() }, null, 2));
  log(`page ready · ${meta.title} · ${meta.W}×${meta.H} @${meta.FPS} · ${meta.FRAMES} frames (${meta.DUR}s) · float texture: ${meta.hasFloat}`);
  const cdp = await page.createCDPSession();
  return { browser, page, cdp, meta };
}
async function grab(cdp, meta, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: meta.W, height: meta.H, scale: 1 }, captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 长时间渲染后 Chrome 偶尔要几分钟才退出，进程就一直挂着；关不掉就强杀，最后显式退出 Node
async function closeBrowser(browser) {
  const proc = browser.process();
  await Promise.race([browser.close().catch(() => {}), sleep(15000)]);
  if (proc && proc.exitCode === null) { try { proc.kill('SIGKILL'); } catch {} }
}
async function exitNow(code = 0) { await new Promise(r => process.stdout.write('', r)); process.exit(code); }
async function renderAudio(page, meta) {
  log(`rendering audio offline (OfflineAudioContext, 48 kHz, ${meta.DUR} s)…`);
  const t = Date.now();
  const b64 = await page.evaluate(() => window.__renderAudioWav());
  fs.writeFileSync(WAV, Buffer.from(b64, 'base64'));
  log(`audio.wav written (${(fs.statSync(WAV).size / 1e6).toFixed(2)} MB) in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
function encode() {
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
  const st = meta.step || 1, fps = meta.FPS / st;
  const base = path.join(OUT, `${slug(meta.title)}_${meta.H}p${meta.FPS}`);
  const master = base + '.mp4', web = base + '_web.mp4';
  const color = ['-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-x264-params', `keyint=${meta.FPS * 2}:min-keyint=${meta.FPS}`, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  const af = gainDb ? ['-af', `volume=${gainDb}dB`] : [];
  const run = cmd => { log('ffmpeg', cmd.join(' ')); const r = spawnSync('ffmpeg', ['-v', 'error', '-stats', ...cmd], { stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) throw new Error('ffmpeg failed'); };
  run(['-y', '-framerate', String(fps), '-i', path.join(FR, 'f_%04d.png'), '-i', WAV, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', ...color, ...af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', master]);
  log(`master → ${master} (${(fs.statSync(master).size / 1e6).toFixed(1)} MB)`);
  if (!has('--no-web')) {
    run(['-y', '-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', ...color, '-c:a', 'copy', '-movflags', '+faststart', web]);
    log(`web    → ${web} (${(fs.statSync(web).size / 1e6).toFixed(1)} MB)`);
  }
}
function runChild(from, to) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--from', String(from), '--to', String(to), '--step', String(step), '--no-encode', '--child'], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', d => process.stdout.write(String(d).split('\n').filter(Boolean).map(l => `[${pad4(from)}-${pad4(to)}] ${l}\n`).join('')));
    p.on('exit', c => c === 0 ? res() : rej(new Error(`child ${from}-${to} exited ${c}`)));
  });
}

(async () => {
  if (has('--encode-only')) { encode(); return; }
  const { browser, page, cdp, meta } = await openPage();
  const last = meta.FRAMES - 1;
  try {
    if (has('--audio-only')) { await renderAudio(page, meta); return; }
    if (testFrames) {
      for (const f of testFrames) { await page.evaluate(f => window.__seek(f), f); const file = path.join(BUILD, `test_${pad4(f)}.png`); await grab(cdp, meta, file); log('test frame', f, '→', file); }
      return;
    }
    let from = +(opt('--from') ?? 0), to = +(opt('--to') ?? last);
    from = Math.ceil(from / step) * step; to = Math.min(to, last);
    if (parallel > 1 && !isChild) {
      await renderAudio(page, meta);
      await closeBrowser(browser);
      const total = Math.floor((to - from) / step) + 1, per = Math.ceil(total / parallel), jobs = [];
      for (let k = 0; k < parallel; k++) { const a = from + k * per * step, b = Math.min(to, from + ((k + 1) * per - 1) * step); if (a <= b) jobs.push(runChild(a, b)); }
      const t0 = Date.now(); await Promise.all(jobs);
      log(`all ${total} frames done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      if (!has('--no-encode')) encode();
      return;
    }
    if (from === 0 && !isChild) await renderAudio(page, meta);
    const t0 = Date.now(); let done = 0;
    for (let f = from; f <= to; f += step) {
      await page.evaluate(f => window.__seek(f), f);
      await grab(cdp, meta, path.join(FR, `f_${pad4(f / step)}.png`));
      done++;
      if (done % 30 === 0 || f + step > to) { const el = (Date.now() - t0) / 1000, rate = done / el; log(`frame ${pad4(f)} / ${last} · ${rate.toFixed(1)} fps · ETA ${(((to - f) / step) / rate).toFixed(0)} s`); }
    }
    log(`frames done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    if (browser.connected) await closeBrowser(browser);
  }
  if (!has('--no-encode') && !isChild && (+(opt('--to') ?? last)) >= last) encode();
})().then(() => exitNow(0)).catch(e => { console.error(e); exitNow(1); });
