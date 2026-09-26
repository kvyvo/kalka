import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHUTTER = 0.35, FPS = Number(process.env.FPS || 50), SUB = 6, SIZE = Number(process.env.SIZE || 720), H = Number(process.env.H || 1440);
const scene = new URL(`./motion.html?h=${H}`, import.meta.url).href;
const out = fileURLToPath(new URL('../docs/motion.gif', import.meta.url));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: H } });
if (process.env.HTTPS_PROXY) {
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

const master = fileURLToPath(new URL(`../docs/.motion-master-${H}.mkv`, import.meta.url));
const outH = Math.round(SIZE * H / 1440 / 2) * 2;
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB),scale=${SIZE}:${outH}:flags=lanczos`, '-r', String(FPS), '-c:v', 'ffv1', master], { stdio: ['pipe', 'inherit', 'inherit'] });

const N = Math.round(T * FPS * SUB);
for (let i = 0; i < N; i++) {
  await p.evaluate((t) => seek(t), (Math.floor(i / SUB) + (i % SUB) / SUB * SHUTTER) / FPS);
  const png = await p.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 200 === 0) process.stdout.write(`\r${Math.round((i / N) * 100)} %`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await b.close();
if (process.env.VIDEO) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', process.env.VIDEO]);
else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', master, '-filter_complex',
  `split[a][b];[a]palettegen=max_colors=${process.env.COLORS || 64}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  '-loop', '0', out]);
console.log(`\r${process.env.VIDEO || out}`);
