// Renders docs/motion.gif from tools/motion.html: every frame is seek(t), a pure function of time.
// 4 subframes per frame, blended with ffmpeg tmix for motion blur. GIF counts delays in 1/100 s and
// browsers slow anything under 2/100 s down, so 50 fps is the fastest a GIF really plays.
//   node tools/motion.mjs            → docs/motion.gif (720 × 720, 50 fps, 14 s loop)
//   FPS=50 SIZE=720 node tools/motion.mjs
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FPS = Number(process.env.FPS || 50), SUB = 4, SIZE = Number(process.env.SIZE || 720);
const scene = new URL('./motion.html', import.meta.url).href;
const out = fileURLToPath(new URL('../docs/motion.gif', import.meta.url));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1440 } });
if (process.env.HTTPS_PROXY) { // sandboxes: the browser may not trust the proxy, curl does
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (r) => {
    const u = r.request().url();
    const body = execFileSync('curl', ['-sS', '--fail', '-A', r.request().headers()['user-agent'], u]);
    await r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body, contentType: u.includes('gstatic') ? 'font/woff2' : 'text/css' });
  });
}
const p = await ctx.newPage();
await p.goto(scene);
await p.evaluate(() => document.fonts.ready);
const T = await p.evaluate(() => window.T);

// png frames at FPS × SUB → tmix averages each group of SUB → keep one of SUB → a lossless master,
// then palette → gif from the master (so the gif can be re-tuned without rendering again)
const master = fileURLToPath(new URL('../docs/.motion-master.mkv', import.meta.url));
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', `tmix=frames=${SUB},framestep=${SUB},scale=${SIZE}:${SIZE}:flags=lanczos`, '-r', String(FPS), '-c:v', 'ffv1', master], { stdio: ['pipe', 'inherit', 'inherit'] });

const N = Math.round(T * FPS * SUB);
for (let i = 0; i < N; i++) {
  await p.evaluate((t) => seek(t), i / (FPS * SUB));
  const png = await p.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 200 === 0) process.stdout.write(`\r${Math.round((i / N) * 100)} %`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await b.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-filter_complex',
  `split[a][b];[a]palettegen=max_colors=${process.env.COLORS || 64}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  '-loop', '0', out]);
console.log(`\r${out}`);
