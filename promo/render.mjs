// Renders promo/reel.html. Every style is a function of time, so we just seek and screenshot.
//   node promo/render.mjs --beats   one frame per beat → promo/out/beats.png (contact sheet)
//   node promo/render.mjs           60 fps, 4 subframes blended (motion blur) + music + UI sounds → promo/out/reel.mp4
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), out = join(here, 'out');
await mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(await readFile(join(root, p))); }
  catch { res.writeHead(404).end(); }
}).listen(0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${server.address().port}/promo/reel.html`);
await page.waitForFunction(() => window.ready);
const { beats, duration } = JSON.parse(await readFile(join(here, 'beats.json'), 'utf8'));
const frame = (t, type = 'jpeg') => page.evaluate((x) => window.seek(x), t)
  .then(() => page.locator('#frame').screenshot({ type, quality: type === 'jpeg' ? 94 : undefined }));

if (process.argv.includes('--beats')) {
  for (let b = 0; b < beats.length; b++) await writeFile(join(out, `beat-${String(b).padStart(2, '0')}.png`), await frame(beats[b] + 0.25, 'png'));
  // 7 bars × 4 beats → one sheet, a row per bar
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, 'beat-%02d.png'), '-vf', 'scale=360:360,tile=4x7:padding=8:color=white', join(out, 'beats.png')]);
  console.log('promo/out/beats.png');
} else {
  const FPS = 60, SUB = 4, N = Math.round(duration * FPS);
  const events = await page.evaluate(() => window.EVENTS);
  await writeFile(join(out, 'events.json'), JSON.stringify(events));
  execFileSync('python3', [join(here, 'sfx.py')], { stdio: 'inherit' });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-c:v', 'mjpeg', '-i', '-',
    '-i', join(out, 'mix.wav'),
    '-vf', `tmix=frames=${SUB},select='not(mod(n+1\\,${SUB}))',setpts=N/(${FPS}*TB)`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', join(out, 'reel.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < N; f++) {
    for (let s = 0; s < SUB; s++) {
      // subframes spread over the frame interval (shutter 360°), ending on the frame time
      const t = (f - (SUB - 1 - s) / SUB) / FPS;
      const img = await frame(t);
      if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 60 === 0) process.stdout.write(`\r${f}/${N}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('\npromo/out/reel.mp4');
}
await browser.close();
server.close();
