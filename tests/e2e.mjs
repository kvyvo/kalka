import { chromium, webkit, firefox } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = process.env.SITE ? join(process.cwd(), process.env.SITE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = { chromium, webkit, firefox }[process.env.BROWSER || 'chromium'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const URL_ = `http://localhost:${server.address().port}/`;

const browser = await engine.launch();
console.log(`${engine.name()} · ${root}`);
let passed = 0, failed = 0;
async function check(name, opts, fn) {
  const ctx = await browser.newContext({ locale: 'ru-RU', reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(URL_);
    await page.waitForFunction(() => window.kalka && document.getElementById('thumb').src);
    await fn(page, ctx);
    assert.deepEqual(errors, [], 'no page errors');
    passed++; console.log('✓', name);
  } catch (e) {
    failed++; console.log('✗', name, '\n ', e.message.split('\n').slice(0, 4).join('\n  '));
  }
  await ctx.close();
}
const box = async (page, sel) => (await page.locator(sel).boundingBox()).width;
const text = (page, sel) => page.locator(sel).textContent();

await check('demo opens, sheet picked from the SVG size, no Mac-isms on Windows', {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
}, async (page) => {
  assert.match(await text(page, '#planCap'), /A3 · 420 × 297/);
  assert.match(await text(page, '#sizeResult'), /380 × 269/);
  const body = await page.evaluate(() => document.getElementById('setup').innerText);
  assert.doesNotMatch(body, /⌘|caffeinate|Night Shift|медотход/);
});

await check('MacBook Air 13″ is recognised: card frame ≈ 433 px', { viewport: { width: 1400, height: 900 }, screen: { width: 1470, height: 956 }, deviceScaleFactor: 2 }, async (page) => {
  assert.equal(await page.locator('#screenSel').inputValue(), 'mba13m2');
  const w = await box(page, '#cardBox');
  assert.ok(Math.abs(w - 433.4) < 1.5, `card ${w}`);
});

await check('unknown 1366×768 laptop: diagonal 15.6″ gives ≈ 340 px card, bigger/smaller work, reload keeps it', { viewport: { width: 1366, height: 700 }, screen: { width: 1366, height: 768 } }, async (page) => {
  assert.equal(await page.locator('#screenSel').inputValue(), 'diag');
  await page.fill('#diag', '15.6'); await page.locator('#diag').dispatchEvent('change');
  const w0 = await box(page, '#cardBox');
  assert.ok(Math.abs(w0 - 340) < 7, `card ${w0}`);
  for (let i = 0; i < 5; i++) await page.click('[data-adj="0.005"]');
  assert.ok(await box(page, '#cardBox') > w0 + 5);
  await page.click('#calibOk');
  await page.reload(); await page.waitForFunction(() => window.kalka);
  assert.match(await text(page, '#calibBadge'), /Проверено/);
  await page.click('#calibReset');
  assert.ok(Math.abs(await box(page, '#cardBox') - w0) < 0.5);
});

await check('all A sheets and a custom one', {}, async (page) => {
  await page.click('[data-name=sizeMode] input[value=fit] + span');
  const sizes = { A4: '297 × 210', A3: '420 × 297', A2: '594 × 420', A1: '841 × 594', A0: '1 189 × 841' };
  for (const [s, v] of Object.entries(sizes)) {
    await page.click(`[data-name=sheet] input[value=${s}] + span`);
    assert.match((await text(page, '#planCap')).replace(/ /g, ' '), new RegExp(v));
  }
  await page.click('[data-name=sheet] input[value=custom] + span');
  await page.fill('#customW', '1200'); await page.locator('#customW').dispatchEvent('change');
  await page.fill('#customH', '530'); await page.locator('#customH').dispatchEvent('change');
  assert.match((await text(page, '#planCap')).replace(/ /g, ' '), /1 200 × 530/);
  const r = await page.evaluate(() => { const d = window.kalka.drawing(); return d.w / d.h; });
  assert.ok(Math.abs(r - 380 / 268.7) < 0.01);
});

await check('grid coordinates add up and every suggested part fits the screen', { screen: { width: 1470, height: 956 }, deviceScaleFactor: 2 }, async (page) => {
  await page.click('[data-name=sheet] input[value=A1] + span');
  await page.click('[data-name=sizeMode] input[value=fit] + span');
  const { S, k } = await page.evaluate(() => ({ S: window.kalka.S, k: window.kalka.k() }));
  const d = await page.evaluate(() => window.kalka.drawing());
  const cw = d.w / S.grid.cols, ch = d.h / S.grid.rows;
  assert.ok(cw + 16 <= 1470 / k.x && ch + 16 <= (956 - 32) / k.y, `${S.grid.cols}×${S.grid.rows}`);
});

await check('low resolution warning for a tiny picture on A1', {}, async (page) => {
  const png = await page.evaluate(() => new Promise((r) => { const c = document.createElement('canvas'); c.width = 736; c.height = 520; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(100, 100, 300, 200); c.toBlob(async (b) => r([...new Uint8Array(await b.arrayBuffer())]), 'image/png'); }));
  await page.setInputFiles('#fileInput', { name: 'pin.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await page.waitForFunction(() => document.getElementById('fileName').textContent === 'pin.png');
  await page.click('[data-name=sheet] input[value=A1] + span');
  await page.waitForSelector('#lowRes:not([hidden])');
  await page.click('[data-name=sheet] input[value=A4] + span');
  await page.waitForSelector('#lowRes', { state: 'hidden' });
});

await check('broken file shows a readable error and the app keeps working', {}, async (page) => {
  await page.setInputFiles('#fileInput', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture') });
  await page.waitForSelector('#islShape[data-state=toast]');
  assert.match(await text(page, '#toastText'), /не открывается/);
  assert.match(await text(page, '#planCap'), /A3/);
});

await check('PDF: page size is picked up (A4 → A4 1:1)', {}, async (page) => {
  await page.setInputFiles('#fileInput', join(dirname(fileURLToPath(import.meta.url)), 'fixtures/a4.pdf'));
  await page.waitForFunction(() => document.getElementById('fileName').textContent === 'a4.pdf', null, { timeout: 20000 });
  assert.match(await text(page, '#sizeResult'), /Рисунок 210 × 297 мм на листе 210 × 297/);
});

await check('tracing: keys, Russian layout, lock, Enter = done and next, white table in dark mode', { colorScheme: 'dark' }, async (page) => {
  await page.click('[data-name=sheet] input[value=A1] + span');
  await page.click('[data-name=sizeMode] input[value=fit] + span');
  await page.click('[data-name=view] input[value=outline] + span');
  await page.click('#startBtn');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('trace')).backgroundColor), 'rgb(255, 255, 255)');
  assert.match(await text(page, '#hudPart'), /Часть 1 из/);
  await page.keyboard.press('ArrowRight');
  assert.match(await text(page, '#hudPart'), /Часть 2 из/);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  assert.match(await text(page, '#hudPart'), /Часть 1 из/);
  const color = await page.evaluate(() => window.kalka.S.traceColor);
  await page.keyboard.down('KeyC'); await page.keyboard.up('KeyC');
  assert.notEqual(await page.evaluate(() => window.kalka.S.traceColor), color);
  await page.keyboard.press('Enter');
  assert.match(await text(page, '#hudPart'), /Часть 2 из/);
  assert.deepEqual(await page.evaluate(() => window.kalka.S.done), [0]);
  await page.click('#bLock', { force: true });
  await page.keyboard.press('Space'); await page.keyboard.press('Enter');
  assert.match(await text(page, '#hudPart'), /Часть 2 из/);
  const k = await page.evaluate(() => window.kalka.k());
  assert.ok(Math.abs(await box(page, '#ctlBar span') - 100 * k.x) < 1);
  await page.reload(); await page.waitForFunction(() => window.kalka);
  assert.match(await text(page, '#startBtn'), /Продолжить — часть 2/);
});

await check('start over asks first', {}, async (page) => {
  await page.evaluate(() => { window.kalka.S.done.push(0); });
  await page.click('#startBtn'); await page.keyboard.press('Enter'); await page.click('#bExit', { force: true });
  await page.click('#resetDone');
  await page.click('#islConfirm button[value=no]');
  assert.match(await text(page, '#progress'), /Обведено/);
  await page.click('#resetDone');
  await page.click('#confirmYes');
  await page.waitForFunction(() => document.getElementById('progress').textContent === '');
});

await check('project file round-trip', {}, async (page) => {
  await page.click('[data-name=sheet] input[value=A2] + span');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const path = await dl.path();
  await page.click('[data-name=sheet] input[value=A4] + span');
  await page.setInputFiles('#importInput', path);
  await page.waitForFunction(() => document.getElementById('toastText').textContent === 'Проект открыт');
  assert.match(await text(page, '#planCap'), /A2/);
});

await check('print on A4: pages at 1:1', {}, async (page) => {
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#printBtn');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#printArea .pp').count(), 6);
  await page.emulateMedia({ media: 'print' });
  const w = await page.evaluate(() => document.querySelector('#printArea .pp').getBoundingClientRect().width);
  assert.ok(Math.abs(w - 210 * 96 / 25.4) < 1);
});

await check('keyboard only: the command palette', {}, async (page) => {
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('a0');
  await page.keyboard.press('Enter');
  assert.match(await text(page, '#planCap'), /A0/);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('english');
  await page.keyboard.press('Enter');
  assert.match(await text(page, 'h1'), /light/);
});

await check('with motion on: springs and morphs land exactly on their targets', { reducedMotion: 'no-preference', viewport: { width: 1400, height: 900 }, screen: { width: 1470, height: 956 }, deviceScaleFactor: 2 }, async (page) => {
  const settle = () => page.waitForTimeout(1300);
  await page.click('[data-name=sheet] input[value=A0] + span');
  await settle();
  const [th, lab] = await page.evaluate(() => {
    const a = document.querySelector('[data-name=sheet] .thumb').getBoundingClientRect();
    const b = document.querySelector('[data-name=sheet] input[value=A0]').closest('label').getBoundingClientRect();
    return [[a.left, a.width], [b.left, b.width]];
  });
  assert.ok(Math.abs(th[0] - lab[0]) < 0.5 && Math.abs(th[1] - lab[1]) < 0.5, `thumb ${th} label ${lab}`);
  const vb = (await page.getAttribute('#sheet', 'viewBox')).split(' ').map(Number);
  assert.ok(Math.abs(vb[2] - (1189 + 118.9 + 35.67)) < 0.1, `viewBox ${vb}`);
  await page.click('[data-adj="0.005"]');
  await settle();
  const w = await box(page, '#cardBox');
  assert.ok(Math.abs(w - 433.4 * 1.005) < 1.5, `card ${w}`);
  await page.keyboard.press('ControlOrMeta+k');
  await settle();
  assert.equal(await page.getAttribute('#islShape', 'data-state'), 'palette');
  assert.ok(Math.abs((await box(page, '#islShape')) - 560) < 1);
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await page.getAttribute('#islShape', 'data-state'), 'idle');
  assert.equal(await page.evaluate(() => [...document.body.children].filter((e) => e.getAttribute('aria-hidden') === 'true' && e.style.position === 'fixed').length), 0);
});

await check('phone width: no horizontal scroll', { viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true }, async (page) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 0, `overflow ${over}px`);
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
