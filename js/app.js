import { sheetSize, fitDrawing, cellSize, suggestGrid, gridLines, printTiles, CARD } from './geometry.js';
import { SCREENS, candidates, baseScale, signature, screenMm } from './screens.js';
import { openFile, prepare } from './image.js';
import { loadSettings, saveSettings, saveFile, loadFile, clearFile } from './store.js';
import { setLang, getLang, t, fmt, plural } from './i18n.js';
import { SPRING, fromApple } from './spring.js';
import { Springs, swap, reveal, morph, easing, reduced, goLive } from './motion.js';
import { segmented, makeSwitch, stretchSlider, steppers } from './ui.js';
import { createIsland } from './island.js';
import { createTrace } from './trace.js';
import { hero } from './hero.js';

const $ = (id) => document.getElementById(id);
// The page and the scripts must come from the same deploy (tools/stamp.mjs writes both).
// A browser can hold an older page in its cache for a while and fetch newer scripts:
// then reload once, which revalidates the page itself.
const BUILD = 'dev';
if (document.querySelector('meta[name=build]')?.content !== BUILD) {
  let again = true;
  try { again = sessionStorage.getItem('kalka-reload') !== BUILD; sessionStorage.setItem('kalka-reload', BUILD); } catch { /* no storage */ }
  // an old service worker may be the one serving the old page: let the new one take over first
  const sw = 'serviceWorker' in navigator && location.protocol === 'https:' ? navigator.serviceWorker : null;
  const takeover = sw ? Promise.race([
    sw.register('sw.js').then((r) => r.update()).then(() => new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }))),
    new Promise((r) => setTimeout(r, 2000)),
  ]).catch(() => {}) : Promise.resolve();
  if (again) takeover.then(() => location.reload());
  throw new Error(`stale page for build ${BUILD}`);
}
// Safari may run modules before the stylesheet is applied; everything below measures layout
const css = document.querySelector('link[rel=stylesheet][href^="css/"]');
if (css && !css.sheet) await new Promise((r) => { css.addEventListener('load', r, { once: true }); css.addEventListener('error', r, { once: true }); });
const UA = navigator.userAgent;
const IPAD = /iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const MAC = /Macintosh/.test(UA) && !IPAD;

const S = loadSettings({
  lang: (navigator.language || 'ru').startsWith('ru') ? 'ru' : 'en',
  view: 'original', strength: 55, rot: 0, mirror: false,
  sheet: 'A3', land: true, custom: { w: 1000, h: 700 }, sizeMode: 'file', margin: 10, widthCm: 30,
  grid: { auto: true, cols: 2, rows: 2 },
  cell: 0, done: [], doneKey: '', traceColor: false, showGrid: true, dim: true,
  calib: {},
});
const save = () => saveSettings(S);

let src = null;        // opened file: { blob, url, img, w, h, physical, pages, name, svg }
let pics = null;       // prepared pictures: { color, view, w, h, owned }
let busy = 0;

/* ---------------- derived geometry ---------------- */
const sig = () => signature(screen.width, screen.height, devicePixelRatio || 1);
function calib() {
  let c = S.calib[sig()];
  if (!c) {
    const cand = candidates(screen.width, screen.height, devicePixelRatio || 1);
    c = S.calib[sig()] = { screen: cand[0]?.id || 'diag', diag: null, adj: 1, checked: false };
  }
  return c;
}
function k() {
  const c = calib(), from = c.screen === 'diag' ? (c.diag ? { diag: c.diag } : null) : SCREENS.find((s) => s.id === c.screen);
  const b = baseScale(from, screen.width, screen.height);
  // base scale is for the screen's own orientation; swap if the window is rotated
  const rotated = (innerWidth > innerHeight) !== (screen.width > screen.height);
  return rotated ? { x: b.y * c.adj, y: b.x * c.adj } : { x: b.x * c.adj, y: b.y * c.adj };
}
function sheet() { return sheetSize(S.sheet, S.land, S.custom); }
function aspect() { return pics ? pics.w / pics.h : 380 / 268.7; }
function drawing() {
  const sh = sheet(), a = aspect();
  if (S.sizeMode === 'file' && src?.physical) {
    let { w, h } = src.physical;
    if (S.rot % 2) [w, h] = [h, w];
    return { w, h, x: (sh.w - w) / 2, y: (sh.h - h) / 2 };
  }
  if (S.sizeMode === 'width') {
    const w = S.widthCm * 10, h = w / a;
    return { w, h, x: (sh.w - w) / 2, y: (sh.h - h) / 2 };
  }
  return fitDrawing(sh, a, S.margin);
}
/** Visible screen area in mm, minus a strip for the notch estimate. */
function viewMm() {
  const notch = SCREENS.find((s) => s.id === calib().screen)?.notch || 0;
  const w = Math.max(screen.width, screen.height), h = Math.min(screen.width, screen.height);
  const land = innerWidth >= innerHeight;
  return screenMm(land ? w : h, (land ? h : w) - notch, k());
}
function grid() {
  if (S.grid.auto) Object.assign(S.grid, suggestGrid(drawing(), viewMm(), 8, 20));
  return S.grid;
}
function syncDone() {
  if (!src || !pics) return; // until the picture is back, keep the saved progress
  const d = drawing(), key = `${src.name}|${S.grid.cols}x${S.grid.rows}|${Math.round(d.w)}x${Math.round(d.h)}`;
  if (key !== S.doneKey) { S.done = []; S.cell = 0; S.doneKey = key; }
}

/* ---------------- island ---------------- */
const island = createIsland({ commands: (q) => commands(q), onIdleClick: () => island.palette() });

/* ---------------- file: the button becomes a loader, then a check ---------------- */
const fileBtn = morph($('fileBtn'), {
  label: { layer: $('fileBtnLabel') },
  busy: { layer: $('fileBtnBusy') },
  done: { layer: $('fileBtnDone') },
}, { dark: '--btn', light: '--btn' });

async function useFile(file, { restoring = false } = {}) {
  const my = ++busy;
  fileBtn.to('busy');
  island.busy();
  try {
    const o = await openFile(file);
    if (my !== busy) return;
    if (src && src.url !== o.url) URL.revokeObjectURL(src.url);
    src = { ...o, name: file.name || 'image' };
    if (!restoring) {
      S.rot = 0; S.mirror = false;
      S.sizeMode = src.physical ? 'file' : 'fit';
      if (src.physical) pickSheetFor(src.physical);
    }
    // the demo is always at hand: store only the user's own files
    if (src.name === 'demo.svg') { if (!restoring) clearFile(); } else saveFile(file, src.name);
    if (S.sizeMode === 'file' && !src.physical) S.sizeMode = 'fit';
    await rebuild({ quiet: true });
    fileBtn.to('done');
    $('fileBtnDone').querySelector('path').animate?.([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 360, fill: 'both', easing: 'cubic-bezier(.3,.7,.3,1)' });
    setTimeout(() => fileBtn.to('label'), 900);
    island.done(restoring || src.name === 'demo.svg' ? null : t('opened', { name: src.name }));
  } catch {
    if (my !== busy) return;
    fileBtn.to('label');
    const heic = /heic|heif/i.test(file.type || file.name || '');
    island.done(heic ? t('heic') : /pdf/i.test(file.type || file.name) ? t('pdfFail') : t('badFile'), 'warn');
    renderFile();
  }
}
/** Smallest A-sheet that holds the physical drawing, orientation to match. */
function pickSheetFor(p) {
  const land = p.w >= p.h;
  for (const name of ['A4', 'A3', 'A2', 'A1', 'A0']) {
    const s = sheetSize(name, land);
    if (s.w >= p.w - 0.5 && s.h >= p.h - 0.5) { S.sheet = name; S.land = land; return; }
  }
  S.sheet = 'custom'; S.custom = { w: Math.ceil(p.w + 20), h: Math.ceil(p.h + 20) }; S.land = land;
}
async function loadDemo(opts) {
  const r = await fetch('assets/demo.svg');
  await useFile(new File([await r.blob()], 'demo.svg', { type: 'image/svg+xml' }), opts);
}

/** Re-prepare pictures after view/rotate/mirror/strength change. */
let prepSeq = 0;
async function rebuild({ quiet = false } = {}) {
  if (!src) return;
  const my = ++prepSeq;
  // only show the loader if it actually takes a moment
  let slowShown = false;
  const slow = quiet ? null : setTimeout(() => { island.busy(); slowShown = true; }, 140);
  const p = await prepare(src, S);
  clearTimeout(slow);
  if (slowShown) island.done();
  if (my !== prepSeq) { p.owned.forEach(URL.revokeObjectURL); return; }
  pics?.owned.forEach((u) => { if (!p.owned.includes(u)) URL.revokeObjectURL(u); });
  pics = p;
  save();
  renderAll();
  trace.refresh();
}

/* ---------------- rendering ---------------- */
const unit = () => (getLang() === 'en' ? 'mm' : 'мм');
function renderFile() {
  if (!src) return;
  const demo = src.name === 'demo.svg';
  $('thumb').hidden = false;
  if ($('thumb').getAttribute('src') !== (pics?.view || src.url)) $('thumb').src = pics?.view || src.url;
  swap($('fileName'), demo ? t('demoName') : src.name);
  const kb = src.blob.size / 1024;
  const size = kb > 1024 ? `${fmt(kb / 1024)} ${getLang() === 'en' ? 'MB' : 'МБ'}` : `${Math.round(kb)} ${getLang() === 'en' ? 'KB' : 'КБ'}`;
  swap($('fileMeta'), t('fileMeta', { w: src.w, h: src.h, size }) + (src.pages > 1 ? t('pdfPages', { n: src.pages }) : ''));
  swap($('fileBtnLabel').firstElementChild, demo ? t('fileChoose') : t('fileReplace'));
  reveal($('strengthRow'), S.view !== 'original');
  reveal($('viewHint'), S.view !== 'original');
  $('viewHint').textContent = S.view === 'bw' ? t('hintBw') : t('hintOutline');
  strength.set(S.strength);
  mirror.set(S.mirror);
  // low resolution: fewer than 2 image px per mm of paper (≈50 dpi)
  const d = drawing(), ppm = src.svg ? Infinity : pics ? pics.w / d.w : Infinity;
  if (ppm < 2) $('lowRes').textContent = t('lowRes', { ppm: fmt(ppm, 1), max: Math.max(1, Math.round(pics.w / 2 / 10)) });
  reveal($('lowRes'), ppm < 2);
}

function renderSheetCtl() {
  const sh = sheet(), d = drawing();
  reveal($('customRow'), S.sheet === 'custom');
  $('customW').value = S.custom.w; $('customH').value = S.custom.h;
  reveal($('orientRow'), S.sheet !== 'custom');
  $('fromFileOpt').hidden = !src?.physical;
  reveal($('marginRow'), S.sizeMode === 'fit');
  reveal($('widthRow'), S.sizeMode === 'width');
  margin.set(S.margin);
  $('widthCm').value = S.widthCm;
  swap($('sizeResult'), t('sizeRes', { w: Math.round(d.w), h: Math.round(d.h), sw: sh.w, sh: sh.h }));
  $('sizeWarn').textContent = t('tooBig');
  reveal($('sizeWarn'), d.w > sh.w + 0.5 || d.h > sh.h + 0.5);
  seg.sheet.set(S.sheet); seg.land.set(S.land ? '1' : '0'); seg.sizeMode.set(S.sizeMode); seg.view.set(S.view);
}

/* calibration: the card frame and ruler spring to the new scale */
const kSp = new Springs({ x: 0, y: 0 }, ({ x, y }) => {
  const box = $('cardBox');
  box.style.width = `${CARD.w * x}px`;
  box.style.height = `${CARD.h * y}px`;
  box.style.borderRadius = `${CARD.r * x}px / ${CARD.r * y}px`;
  const ruler = $('ruler'), w = 100 * x;
  ruler.setAttribute('width', w + 8); ruler.setAttribute('height', 26);
  let s = `<line x1="4" y1="0.5" x2="${4 + w}" y2="0.5"/>`;
  for (let i = 0; i <= 100; i++) {
    const px = 4 + i * x, len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 5;
    s += `<line x1="${px}" y1="0" x2="${px}" y2="${len}"/>`;
  }
  for (let cm = 0; cm <= 10; cm++) s += `<text x="${4 + cm * 10 * x}" y="24">${cm}</text>`;
  ruler.innerHTML = s;
});
let kPlaced = false;
function renderCalib() {
  const c = calib(), kk = k();
  const sel = $('screenSel');
  const cand = candidates(screen.width, screen.height, devicePixelRatio || 1);
  const opts = [...cand, ...SCREENS.filter((s) => !cand.includes(s))];
  const html = opts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('') + `<option value="diag">${t('screenDiag')}</option>`;
  if (sel.innerHTML !== html) sel.innerHTML = html;
  sel.value = c.screen;
  reveal($('diagRow'), c.screen === 'diag');
  if (document.activeElement !== $('diag')) $('diag').value = c.diag || '';
  kPlaced ? kSp.to(kk, SPRING.snappy) : kSp.set(kk);
  kPlaced = true;
  const pct = (c.adj - 1) * 100;
  swap($('adjRead'), `${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 1)} %`);
  swap($('calibBadge'), c.checked ? t('calibChecked') : t('calibNot'));
  $('calibBadge').parentElement.classList.toggle('ok', c.checked);
  // browser zoom: Chrome/Firefox change devicePixelRatio to an unusual value
  const dpr = Math.round((devicePixelRatio || 1) * 100);
  $('zoomWarn').textContent = MAC ? t('zoomMac') : t('zoomWin');
  reveal($('zoomWarn'), ![100, 125, 150, 175, 200, 225, 250, 300, 350].includes(dpr) && !IPAD);
}

function renderParts() {
  const g = grid(), d = drawing(), c = cellSize(d, g.cols, g.rows), v = viewMm();
  syncDone();
  $('cols').value = g.cols; $('rows').value = g.rows;
  autoGrid.set(S.grid.auto);
  const m = Math.min((v.w - c.w) / 2, (v.h - c.h) / 2);
  swap($('fitText'), g.cols * g.rows === 1 && m >= 0 ? t('fitOne')
    : m >= 0 ? t('fitMany', { cw: Math.round(c.w), ch: Math.round(c.h), sw: Math.round(v.w), sh: Math.round(v.h), m: Math.round(m) })
      : t('fitNo', { cw: Math.round(c.w), ch: Math.round(c.h), sw: Math.round(v.w), sh: Math.round(v.h) }));
  const { xs, ys } = gridLines(sheet(), d, g.cols, g.rows);
  $('coordX').textContent = `${xs.map((x) => fmt(x)).join(' · ')} ${unit()}`;
  $('coordY').textContent = `${ys.map((y) => fmt(y)).join(' · ')} ${unit()}`;
  const N = g.cols * g.rows, fresh = !S.done.length && S.cell === 0;
  swap($('startLabel'), fresh ? t('start') : t('cont', { n: S.cell + 1 }));
  swap($('progress'), S.done.length ? t('progress', { d: S.done.length, n: N }) : '');
  $('resetDone').hidden = !S.done.length;
  island.summary(`${S.sheet === 'custom' ? t('customShort') : S.sheet} · ${N} ${plural(N, 'parts')}`, S.done.length, N);
}

/* ---------------- the plan: a camera that follows the sheet ---------------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const mk = (name, attrs, parent) => {
  const e = document.createElementNS(SVGNS, name);
  for (const [a, v] of Object.entries(attrs || {})) e.setAttribute(a, v);
  parent?.append(e);
  return e;
};
const plan = { svg: $('sheet'), key: '', placed: false, cells: [], vl: [], hl: [] };
function buildPlan(cols, rows) {
  const svg = plan.svg;
  svg.textContent = '';
  plan.sheetRect = mk('rect', { class: 'sh' }, svg);
  plan.img = mk('image', { preserveAspectRatio: 'none', opacity: '.5' }, svg);
  const lines = mk('g', {}, svg);
  plan.vl = Array.from({ length: cols + 1 }, () => mk('line', { class: 'gl' }, lines));
  plan.hl = Array.from({ length: rows + 1 }, () => mk('line', { class: 'gl' }, lines));
  plan.cells = Array.from({ length: cols * rows }, (_, n) => {
    const gEl = mk('g', { class: 'cell', 'data-cell': n, tabindex: 0, role: 'button' }, svg);
    const rect = mk('rect', {}, gEl), pin = mk('g', { class: 'pin' }, gEl);
    return { g: gEl, rect, circle: mk('circle', {}, pin), text: mk('text', {}, pin), pin };
  });
  const dims = mk('g', {}, svg);
  plan.dim = [mk('line', { class: 'dl' }, dims), mk('line', { class: 'dl' }, dims), mk('text', { class: 'dt', 'text-anchor': 'middle' }, dims), mk('text', { class: 'dt', 'text-anchor': 'middle' }, dims)];
  plan.cols = cols; plan.rows = rows;
  if (reduced() || !plan.placed) return;
  // the grid draws itself, the numbers pop in one after another
  const e = easing(fromApple(0.5, 0.12));
  plan.vl.forEach((l, i) => l.animate?.([{ scale: '1 0' }, { scale: '1 1' }], { duration: 520, delay: i * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  plan.hl.forEach((l, i) => l.animate?.([{ scale: '0 1' }, { scale: '1 1' }], { duration: 520, delay: 60 + i * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  plan.cells.forEach((c, i) => c.pin.animate?.([{ scale: 0, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: e.duration, delay: 140 + i * 22, easing: e.easing, fill: 'backwards' }));
}
const camera = new Springs({ sw: 420, sh: 297, dx: 0, dy: 0, dw: 420, dh: 297 }, layoutPlan);
function layoutPlan(v) {
  if (!plan.sheetRect) return;
  const { sw, sh, dx, dy, dw, dh } = v, cols = plan.cols, rows = plan.rows;
  const u = Math.max(sw, sh) / 100, L = u * 10, T = u * 10;
  plan.svg.setAttribute('viewBox', `${-L} ${-T} ${sw + L + u * 3} ${sh + T + u * 3}`);
  const set = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };
  set(plan.sheetRect, { x: 0, y: 0, width: sw, height: sh });
  set(plan.img, { x: dx, y: dy, width: Math.max(0, dw), height: Math.max(0, dh) });
  const cw = dw / cols, ch = dh / rows;
  plan.vl.forEach((l, i) => set(l, { x1: dx + i * cw, y1: dy, x2: dx + i * cw, y2: dy + dh }));
  plan.hl.forEach((l, j) => set(l, { x1: dx, y1: dy + j * ch, x2: dx + dw, y2: dy + j * ch }));
  const r = Math.max(0, Math.min(cw, ch, u * 14) * 0.2);
  plan.cells.forEach((c, n) => {
    const x = dx + (n % cols) * cw, y = dy + Math.floor(n / cols) * ch;
    set(c.rect, { x, y, width: Math.max(0, cw), height: Math.max(0, ch) });
    set(c.circle, { cx: x + cw / 2, cy: y + ch / 2, r });
    set(c.text, { x: x + cw / 2, y: y + ch / 2, 'font-size': r * 1.05 });
  });
  const [l1, l2, t1, t2] = plan.dim, fs = u * 2.4;
  set(l1, { x1: 0, y1: -u * 4, x2: sw, y2: -u * 4 });
  set(l2, { x1: -u * 4, y1: 0, x2: -u * 4, y2: sh });
  set(t1, { x: sw / 2, y: -u * 5, 'font-size': fs });
  set(t2, { x: -u * 5, y: sh / 2, 'font-size': fs, transform: `rotate(-90 ${-u * 5} ${sh / 2})` });
  t1.textContent = fmt(sw); t2.textContent = fmt(sh);
}
function renderPlan() {
  const sh = sheet(), d = drawing(), g = S.grid;
  if (plan.cols !== g.cols || plan.rows !== g.rows) buildPlan(g.cols, g.rows);
  if (pics && plan.img.getAttribute('href') !== pics.view) plan.img.setAttribute('href', pics.view);
  const N = g.cols * g.rows, started = S.cell !== 0 || S.done.length;
  plan.cells.forEach((c, n) => {
    const done = S.done.includes(n);
    c.g.classList.toggle('done', done);
    c.g.classList.toggle('cur', started && n === S.cell);
    c.g.setAttribute('aria-label', t('part', { n: n + 1, N }) + (done ? `, ${t('doneShort')}` : ''));
    c.text.textContent = done ? '✓' : n + 1;
  });
  const target = { sw: sh.w, sh: sh.h, dx: d.x, dy: d.y, dw: d.w, dh: d.h };
  plan.placed ? camera.to(target, SPRING.smooth) : camera.set(target);
  plan.placed = true;
  swap($('planCap'), `${S.sheet === 'custom' ? '' : S.sheet + ' · '}${fmt(sh.w)} × ${fmt(sh.h)} · ${g.cols} × ${g.rows} = ${N}`);
}

/* the tooltip over the plan springs from part to part */
const tip = $('planTip');
const tipSp = new Springs({ x: 0, y: 0, o: 0 }, ({ x, y, o }) => {
  tip.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${0.92 + 0.08 * Math.min(1, o)})`;
  tip.style.opacity = Math.max(0, Math.min(1, o));
});
function showTip(cellG) {
  const n = Number(cellG.dataset.cell), g = S.grid, d = drawing(), c = cellSize(d, g.cols, g.rows);
  const col = n % g.cols, row = Math.floor(n / g.cols), r = cellG.querySelector('rect').getBoundingClientRect();
  swap($('planTipTitle'), t('part', { n: n + 1, N: g.cols * g.rows }) + (S.done.includes(n) ? ' ✓' : ''));
  swap($('planTipText'), `${t('pos', { r: row + 1, c: col + 1 })} · ${Math.round(c.w)} × ${Math.round(c.h)} ${unit()}`);
  const target = { x: r.left + r.width / 2, y: r.top - 8, o: 1 };
  tipSp.target('o') < 0.5 ? (tipSp.set({ x: target.x, y: target.y }), tipSp.to({ o: 1 }, SPRING.ui)) : tipSp.to(target, SPRING.ui);
}
plan.svg.addEventListener('pointerover', (e) => { const g = e.target.closest?.('.cell'); if (g && e.pointerType !== 'touch') showTip(g); });
plan.svg.addEventListener('pointerleave', () => tipSp.to({ o: 0 }, SPRING.quick));
plan.svg.addEventListener('focusin', (e) => { const g = e.target.closest?.('.cell'); if (g) showTip(g); });
plan.svg.addEventListener('focusout', () => tipSp.to({ o: 0 }, SPRING.quick));
addEventListener('scroll', () => tipSp.to({ o: 0 }, SPRING.quick), { passive: true });

function renderSleepTip() {
  $('sleepTip').textContent = IPAD ? t('sleepIpad') : MAC ? t('sleepMac') : t('sleepWin');
}

function renderAll() {
  renderFile(); renderSheetCtl(); renderCalib(); renderParts(); renderPlan(); renderSleepTip();
  $('langBtn').textContent = getLang() === 'en' ? 'RU' : 'EN';
  $('paletteKey').textContent = MAC ? '⌘K' : 'Ctrl K';
  save();
}

/* ---------------- controls ---------------- */
const seg = {};
seg.view = segmented(document.querySelector('[data-name=view]'), (v) => { S.view = v; S.traceColor = false; rebuild(); });
seg.sheet = segmented(document.querySelector('[data-name=sheet]'), (v) => { S.sheet = v; renderAll(); });
seg.land = segmented(document.querySelector('[data-name=land]'), (v) => { S.land = v === '1'; renderAll(); });
seg.sizeMode = segmented(document.querySelector('[data-name=sizeMode]'), (v) => {
  if (v === 'width') S.widthCm = Math.round(drawing().w / 10);
  S.sizeMode = v; renderAll();
});
const mirror = makeSwitch($('mirrorBtn'), (on) => { S.mirror = on; rebuild(); });
const autoGrid = makeSwitch($('autoGrid'), (on) => { S.grid.auto = on; renderAll(); });
let strengthT = null;
const strength = stretchSlider($('strength'), {
  min: 0, max: 100, value: S.strength,
  onInput: (v) => { S.strength = v; clearTimeout(strengthT); strengthT = setTimeout(rebuild, 140); },
});
const margin = stretchSlider($('margin'), {
  min: 0, max: 60, value: S.margin, format: (v) => `${v} ${unit()}`,
  onInput: (v) => { S.margin = v; renderAll(); },
});
steppers();

// the rotate icon turns with the picture
const rotIcon = $('rotIcon');
const rotSp = new Springs({ a: 0 }, ({ a }) => { rotIcon.style.rotate = `${a}deg`; });
$('rotBtn').addEventListener('click', () => { S.rot = (S.rot + 1) % 4; rotSp.to({ a: rotSp.target('a') + 90 }, fromApple(0.45, 0.15)); rebuild(); });

$('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) useFile(f); e.target.value = ''; });
const num = (id, fn) => $(id).addEventListener('change', (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) fn(v); renderAll(); });
num('customW', (v) => { S.custom.w = Math.min(10000, Math.max(50, v)); });
num('customH', (v) => { S.custom.h = Math.min(10000, Math.max(50, v)); });
num('widthCm', (v) => { S.widthCm = Math.min(1000, v); });
num('cols', (v) => { S.grid.cols = Math.min(20, Math.round(v)); S.grid.auto = false; });
num('rows', (v) => { S.grid.rows = Math.min(20, Math.round(v)); S.grid.auto = false; });

// calibration
$('screenSel').addEventListener('change', (e) => { const c = calib(); c.screen = e.target.value; c.adj = 1; c.checked = false; renderAll(); });
num('diag', (v) => { const c = calib(); c.diag = Math.min(100, Math.max(5, v)); c.checked = false; });
document.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => {
  const c = calib(); c.adj = Math.min(3, Math.max(0.3, c.adj * (1 + Number(b.dataset.adj)))); c.checked = false; renderAll();
}));
$('calibOk').addEventListener('click', () => { calib().checked = true; renderAll(); island.toast(t('calibSaved'), 'ok', 2200); });
$('calibReset').addEventListener('click', () => { const c = calib(); c.adj = 1; c.checked = false; renderAll(); });
// drag the card frame's right edge: direct manipulation, then it settles
$('cardGrip').addEventListener('pointerdown', (e) => {
  const grip = e.currentTarget, c = calib(), startX = e.clientX, a0 = c.adj, w0 = $('cardBox').offsetWidth;
  grip.setPointerCapture(e.pointerId);
  grip.classList.add('active');
  const mv = (ev) => { c.adj = Math.min(3, Math.max(0.3, (a0 * (w0 + ev.clientX - startX)) / w0)); c.checked = false; kSp.set(k()); };
  const up = () => { grip.classList.remove('active'); grip.removeEventListener('pointermove', mv); renderAll(); };
  grip.addEventListener('pointermove', mv);
  grip.addEventListener('pointerup', up, { once: true });
});

// plan → trace
const trace = createTrace({
  get: () => ({ S, sheet: sheet(), drawing: drawing(), k: k(), view: pics?.view, color: pics?.color, pixel: !src?.svg && pics && pics.w / drawing().w < 3 }),
  save,
  onExit: () => { island.away(false); renderAll(); },
  cellEl: (n) => plan.cells[n]?.rect,
});
function startTrace(n, fromEl) { tipSp.set({ o: 0 }); island.away(true); trace.enter(n, fromEl); }
$('startBtn').addEventListener('click', (e) => startTrace(undefined, e.currentTarget));
plan.svg.addEventListener('click', (e) => { const g = e.target.closest('.cell'); if (g) startTrace(Number(g.dataset.cell), g.querySelector('rect')); });
plan.svg.addEventListener('keydown', (e) => {
  const g = e.target.closest?.('.cell');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startTrace(Number(g.dataset.cell), g.querySelector('rect')); }
});
$('resetDone').addEventListener('click', async () => {
  if (await island.confirm(t('confirmReset'), t('confirmYes'))) { S.done = []; S.cell = 0; renderAll(); }
});

// drag & drop, paste: the island becomes the drop target
let dragDepth = 0;
const dragging = (on) => { document.body.classList.toggle('dragging', on); island.drop(on); };
addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; dragging(true); e.preventDefault(); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dragging(false); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; dragging(false);
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (/\.kalka$/i.test(f.name)) importProject(f); else useFile(f);
});
addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])][0];
  if (f) { e.preventDefault(); useFile(f); }
});

/* ---------------- print on A4 ---------------- */
function printParts() {
  if (!pics) return;
  const d = drawing(), win = { w: 190, h: 267 }, ov = 10, p = printTiles(d, win, ov), N = p.tiles.length;
  $('printArea').innerHTML = p.tiles.map((tile, i) => {
    const lines = (tile.col < p.cols - 1 ? `<div class="ov" style="left:${win.w - ov}mm;top:0;height:${win.h}mm;width:0"></div>` : '')
      + (tile.row < p.rows - 1 ? `<div class="ov" style="top:${win.h - ov}mm;left:0;width:${win.w}mm;height:0"></div>` : '');
    return `<section class="pp"><div class="win"><img src="${pics.view}" style="left:${-tile.x}mm;top:${-tile.y}mm;width:${d.w}mm;height:${d.h}mm">${lines}</div>`
      + `<div class="lbl">Kalka · ${i + 1}/${N} · ${getLang() === 'en' ? 'row' : 'ряд'} ${tile.row + 1}, ${getLang() === 'en' ? 'col' : 'колонка'} ${tile.col + 1} · <span style="display:inline-block;width:50mm;border-bottom:.3mm solid #000;vertical-align:middle"></span> 50 ${unit()}</div></section>`;
  }).join('');
  island.toast(t('printInfo', { n: N }), 'info', 6000);
  setTimeout(() => print(), 300);
}
$('printBtn').addEventListener('click', printParts);

/* ---------------- project file ---------------- */
async function exportProject() {
  if (!src) return;
  const buf = new Uint8Array(await src.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const { calib: _c, ...settings } = S;
  const data = JSON.stringify({ kalka: 1, name: src.name, type: src.blob.type, physical: src.physical, file: btoa(bin), settings });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = src.name.replace(/\.[^.]+$/, '') + '.kalka';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  island.toast(t('saved'), 'ok');
}
async function importProject(file) {
  try {
    const o = JSON.parse(await file.text());
    if (o.kalka !== 1 || typeof o.file !== 'string') throw new Error('format');
    const bin = atob(o.file), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const allowed = ['view', 'strength', 'rot', 'mirror', 'sheet', 'land', 'custom', 'sizeMode', 'margin', 'widthCm', 'grid', 'cell', 'done', 'doneKey', 'showGrid', 'dim'];
    for (const key of allowed) if (key in (o.settings || {})) S[key] = o.settings[key];
    const f = new File([buf], String(o.name || 'image'), { type: String(o.type || '') });
    await useFile(f, { restoring: true });
    island.toast(t('loaded'), 'ok');
  } catch { island.toast(t('badFile'), 'warn'); }
}
$('exportBtn').addEventListener('click', exportProject);
$('importInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importProject(f); e.target.value = ''; });

/* ---------------- language, theme, palette ---------------- */
function setLanguage(l) { S.lang = l; setLang(l); renderAll(); seg.view.place(false); seg.sheet.place(false); seg.land.place(false); seg.sizeMode.place(false); }
$('langBtn').addEventListener('click', () => setLanguage(getLang() === 'en' ? 'ru' : 'en'));
function toggleTheme() {
  const root = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = root.dataset.theme || (dark ? 'dark' : 'light');
  root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  return root.dataset.theme === 'dark' ? t('themeDark') : t('themeLight');
}
function setView(v) { seg.view.set(v); S.view = v; S.traceColor = false; rebuild(); }

function commands(q) {
  const N = S.grid.cols * S.grid.rows, cmds = [];
  const n = parseInt(q, 10);
  if (n >= 1 && n <= N && String(n) === q.trim()) cmds.push({ title: t('cmdGo', { n }), always: true, toast: false, run: () => (trace.open() ? trace.go(n - 1) : startTrace(n - 1, plan.cells[n - 1]?.rect)) });
  cmds.push(
    { title: t('cmdTrace'), hint: '↵', toast: false, run: () => startTrace(undefined, $('startBtn')) },
    { title: t('cmdOpen'), toast: false, run: () => $('fileInput').click() },
    { title: t('cmdDemo'), toast: false, run: () => loadDemo() },
    { title: t('cmdOutline'), toast: false, run: () => setView('outline') },
    { title: t('cmdBw'), toast: false, run: () => setView('bw') },
    { title: t('cmdOriginal'), toast: false, run: () => setView('original') },
    { title: t('cmdMirror'), toast: false, run: () => { mirror.set(!S.mirror); S.mirror = !S.mirror; rebuild(); } },
    { title: t('cmdRotate'), toast: false, run: () => $('rotBtn').click() },
    ...['A4', 'A3', 'A2', 'A1', 'A0'].map((s) => ({ title: t('cmdSheet', { s }), run: () => { S.sheet = s; renderAll(); return `${t('cmdSheet', { s })} · ${S.grid.cols * S.grid.rows} ${plural(S.grid.cols * S.grid.rows, 'parts')}`; } })),
    { title: t('cmdPrint'), toast: false, run: printParts },
    { title: t('cmdExport'), toast: false, run: exportProject },
    { title: t('cmdTheme'), run: toggleTheme },
    { title: t('cmdLang'), run: () => { setLanguage(getLang() === 'en' ? 'ru' : 'en'); return t('langDone'); } },
  );
  return trace.open() ? cmds.filter((c) => c.always || c.title !== t('cmdTrace')) : cmds;
}
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); island.state === 'palette' ? island.idle() : island.palette(); }
});
addEventListener('scroll', () => document.querySelector('.top').classList.toggle('scrolled', scrollY > 4), { passive: true });
addEventListener('resize', () => { if (!trace.open()) { renderCalib(); renderParts(); renderPlan(); } });

/* ---------------- start ---------------- */
setLang(S.lang);
if (Object.keys(S.calib).length && !S.calib[sig()]) setTimeout(() => island.toast(t('newScreen'), 'warn', 6000), 900);
renderAll();
hero($('heroSvg'), $('heroCap'));
(async () => {
  const stored = await loadFile();
  if (stored) await useFile(stored, { restoring: true });
  else await loadDemo({ restoring: S.doneKey.startsWith('demo.svg|') }); // back on the sample: keep its sheet and progress
  requestAnimationFrame(goLive);
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.kalka = { S, k, drawing, sheet, island }; // handy for tests and the curious
