// Records docs/motion.gif: the real page, driven by Playwright — the island, the palette,
// the liquid indicator, the plan's camera and the jump into the light table.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(await readFile(join(root, p))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const dir = await mkdtemp(join(tmpdir(), 'kalka-'));
const size = { width: 1280, height: 800 };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, screen: { width: 1710, height: 1112 }, recordVideo: { dir, size } });
const p = await ctx.newPage();
await p.addInitScript(() => {
  localStorage.setItem('kalka-v1', JSON.stringify({ lang: 'ru', sheet: 'A3', sizeMode: 'fit' }));
  // headless full screen resizes the window under the recorder; the recording is the "screen" here
  Element.prototype.requestFullscreen = () => Promise.reject(new Error('recording'));
});
await p.goto(`http://localhost:${server.address().port}/`);
await p.waitForFunction(() => window.kalka && document.getElementById('thumb').src);
const t0 = Date.now();
const wait = (ms) => p.waitForTimeout(ms);
await wait(2200);                                   // hero: the screen walks under the sheet
await p.keyboard.press('Meta+k'); await wait(700);  // the island grows into the palette
await p.keyboard.type('a1', { delay: 90 }); await wait(500);
await p.keyboard.press('Enter'); await wait(1500);  // palette → toast → pill
await p.evaluate(() => document.getElementById('steps').scrollIntoView({ behavior: 'smooth' })); await wait(900);
await p.click('[data-name=sheet] input[value=A2] + span'); await wait(900); // liquid indicator + camera + grid draws in
await p.click('[data-name=view] input[value=outline] + span'); await wait(1100);
const cell = await p.locator('#sheet .cell').nth(1).boundingBox();
await p.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 12 }); await wait(700); // tooltip
await p.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2); await wait(1200); // grows into the light table
await p.keyboard.press('ArrowRight'); await wait(900);
await p.keyboard.press('Enter'); await wait(1000);
const dur = (Date.now() - t0) / 1000;
await ctx.close(); await b.close(); server.close();
const video = join(dir, (await readdir(dir)).find((f) => f.endsWith('.webm')));
// the video starts at page creation; keep the scripted part
const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, total - dur)), '-i', video,
  '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  join(root, 'docs/motion.gif')]);
await rm(dir, { recursive: true });
console.log('docs/motion.gif', dur.toFixed(1), 's');
