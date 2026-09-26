import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(await readFile(join(root, p))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const b = await chromium.launch();
async function shot(name, { theme = 'light', lang = 'ru', w = 1440, h = 900, setup, clip } = {}) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce', screen: { width: 1710, height: 1112 } });
  await p.addInitScript((l) => localStorage.setItem('kalka-v1', JSON.stringify({ lang: l })), lang);
  await p.goto(url);
  await p.waitForFunction(() => window.kalka && document.getElementById('thumb').src);
  await p.evaluate(() => document.fonts.ready);
  if (setup) await setup(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(root, name), clip });
  await p.close();
}
await shot('docs/setup.png');
await shot('docs/setup-dark-en.png', { theme: 'dark', lang: 'en' });
await shot('docs/trace.png', { setup: async (p) => {
  await p.click('[data-name=view] input[value=outline] + span');
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.kalka.S.cell = 1; });
  await p.click('#startBtn');
  await p.mouse.move(700, 500);
} });
await shot('assets/og.png', { w: 1200, h: 630, setup: (p) => p.evaluate(() => { document.querySelector('.hero').style.paddingTop = '40px'; }) });
await b.close(); server.close();
console.log('ok');
