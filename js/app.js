import { sheetSize, fitDrawing, cellSize, suggestGrid, gridLines, printTiles, CARD } from './geometry.js';
import { SCREENS, candidates, baseScale, signature, screenMm } from './screens.js';
import { openFile, prepare } from './image.js';
import { loadSettings, saveSettings, saveFile, loadFile } from './store.js';
import { setLang, getLang, t, fmt } from './i18n.js';
import { segmented, steppers, toast, confirmDialog, palette } from './ui.js';
import { createTrace } from './trace.js';

const $ = (id) => document.getElementById(id);
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

let src = null;        // opened file: { blob, url, img, w, h, physical, pages, name }
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
  const c = calib(), src = c.screen === 'diag' ? (c.diag ? { diag: c.diag } : null) : SCREENS.find((s) => s.id === c.screen);
  const b = baseScale(src, screen.width, screen.height);
  // base scale is for the screen's own orientation; swap if the window is rotated
  const rotated = (innerWidth > innerHeight) !== (screen.width > screen.height);
  return rotated ? { x: b.y * c.adj, y: b.x * c.adj } : { x: b.x * c.adj, y: b.y * c.adj };
}
function sheet() { return sheetSize(S.sheet, S.land, S.custom); }
function aspect() { return pics ? pics.w / pics.h : 420 / 297; }
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
  const kk = k(), notch = (SCREENS.find((s) => s.id === calib().screen)?.notch || 0);
  const w = Math.max(screen.width, screen.height), h = Math.min(screen.width, screen.height);
  const land = innerWidth >= innerHeight;
  const m = screenMm(land ? w : h, (land ? h : w) - notch, kk);
  return m;
}
function grid() {
  if (S.grid.auto) Object.assign(S.grid, suggestGrid(drawing(), viewMm(), 8, 20));
  return S.grid;
}
function syncDone() {
  if (!src || !pics) return; // until the picture is back, keep the saved progress
  const d = drawing(), key = `${src?.name}|${S.grid.cols}x${S.grid.rows}|${Math.round(d.w)}x${Math.round(d.h)}`;
  if (key !== S.doneKey) { S.done = []; S.cell = 0; S.doneKey = key; }
}

/* ---------------- file ---------------- */
async function useFile(file, { restoring = false } = {}) {
  const my = ++busy;
  $('fileName').textContent = t('opening');
  try {
    const o = await openFile(file);
    if (my !== busy) return;
    if (src && src.url !== o.url) URL.revokeObjectURL(src.url);
    src = { ...o, name: file.name || 'image' };
    if (!restoring) {
      S.rot = 0; S.mirror = false;
      S.sizeMode = src.physical ? 'file' : 'fit';
      if (src.physical) pickSheetFor(src.physical);
      saveFile(file, src.name);
    }
    if (S.sizeMode === 'file' && !src.physical) S.sizeMode = 'fit';
    await rebuild();
  } catch (e) {
    if (my !== busy) return;
    const heic = /heic|heif/i.test(file.type || file.name || '');
    toast(heic ? t('heic') : /pdf/i.test(file.type || file.name) ? t('pdfFail') : t('badFile'), 6000);
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
async function loadDemo() {
  const r = await fetch('assets/demo.svg');
  const f = new File([await r.blob()], 'demo.svg', { type: 'image/svg+xml' });
  f.demo = true;
  await useFile(f);
}

/** Re-prepare pictures after view/rotate/mirror/strength change. */
let prepSeq = 0;
async function rebuild() {
  if (!src) return;
  const my = ++prepSeq;
  if (S.view !== 'original') $('fileMeta').textContent = t('processing');
  const p = await prepare(src, S);
  if (my !== prepSeq) { p.owned.forEach(URL.revokeObjectURL); return; }
  pics?.owned.forEach((u) => { if (!p.owned.includes(u)) URL.revokeObjectURL(u); });
  pics = p;
  save();
  renderAll();
  trace.refresh();
}

/* ---------------- rendering ---------------- */
function renderFile() {
  if (!src) return;
  const demo = src.name === 'demo.svg';
  $('thumb').hidden = false;
  $('thumb').src = pics?.view || src.url;
  $('fileName').textContent = demo ? t('demoName') : src.name;
  const kb = src.blob.size / 1024;
  $('fileMeta').textContent = t('fileMeta', { w: src.w, h: src.h, size: kb > 1024 ? `${fmt(kb / 1024)} МБ`.replace('МБ', getLang() === 'en' ? 'MB' : 'МБ') : `${Math.round(kb)} ${getLang() === 'en' ? 'KB' : 'КБ'}` })
    + (src.pages > 1 ? t('pdfPages', { n: src.pages }) : '');
  $('strengthRow').hidden = S.view === 'original';
  $('viewHint').hidden = S.view === 'original';
  $('viewHint').textContent = S.view === 'bw' ? t('hintBw') : t('hintOutline');
  $('strength').value = S.strength;
  $('mirrorBtn').setAttribute('aria-pressed', String(S.mirror));
  // low resolution: fewer than 2 image px per mm of paper (≈50 dpi)
  const d = drawing(), ppm = (src.svg ? Infinity : pics ? pics.w / d.w : Infinity);
  $('lowRes').hidden = !(ppm < 2);
  if (ppm < 2) $('lowRes').textContent = t('lowRes', { ppm: fmt(ppm, 1), max: Math.max(1, Math.round((pics.w / 2) / 10)) });
}

function renderSheetCtl() {
  const sh = sheet(), d = drawing();
  $('customRow').hidden = S.sheet !== 'custom';
  $('customW').value = S.custom.w; $('customH').value = S.custom.h;
  $('orientRow').hidden = S.sheet === 'custom';
  $('fromFileOpt').hidden = !src?.physical;
  $('marginRow').hidden = S.sizeMode !== 'fit';
  $('widthRow').hidden = S.sizeMode !== 'width';
  $('margin').value = S.margin; $('widthCm').value = S.widthCm;
  $('sizeResult').textContent = t('sizeRes', { w: Math.round(d.w), h: Math.round(d.h), sw: sh.w, sh: sh.h });
  const over = d.w > sh.w + 0.5 || d.h > sh.h + 0.5;
  $('sizeWarn').hidden = !over;
  $('sizeWarn').textContent = t('tooBig');
  seg.sheet.set(S.sheet); seg.land.set(S.land ? '1' : '0'); seg.sizeMode.set(S.sizeMode); seg.view.set(S.view);
}

function renderCalib() {
  const c = calib(), kk = k();
  const sel = $('screenSel');
  const cand = candidates(screen.width, screen.height, devicePixelRatio || 1);
  const opts = [...cand, ...SCREENS.filter((s) => !cand.includes(s))];
  sel.innerHTML = opts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')
    + `<option value="diag">${t('screenDiag')}</option>`;
  sel.value = c.screen;
  $('diagRow').hidden = c.screen !== 'diag';
  $('diag').value = c.diag || '';
  const box = $('cardBox');
  box.style.width = CARD.w * kk.x + 'px';
  box.style.height = CARD.h * kk.y + 'px';
  box.style.borderRadius = `${CARD.r * kk.x}px / ${CARD.r * kk.y}px`;
  const ruler = $('ruler'), w = 100 * kk.x;
  ruler.setAttribute('width', w + 8); ruler.setAttribute('height', 26);
  let s = `<line x1="4" y1="0.5" x2="${4 + w}" y2="0.5"/>`;
  for (let i = 0; i <= 100; i++) {
    const x = 4 + i * kk.x, len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 5;
    s += `<line x1="${x}" y1="0" x2="${x}" y2="${len}"/>`;
  }
  for (let cm = 0; cm <= 10; cm++) s += `<text x="${4 + cm * 10 * kk.x}" y="24">${cm}</text>`;
  ruler.innerHTML = s;
  const pct = (c.adj - 1) * 100;
  $('adjRead').textContent = `${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 1)} %`;
  $('calibBadge').textContent = c.checked ? t('calibChecked') : t('calibNot');
  $('calibBadge').classList.toggle('ok', c.checked);
  // browser zoom: Chrome/Firefox change devicePixelRatio to an unusual value
  const dpr = Math.round((devicePixelRatio || 1) * 100);
  const zoomed = ![100, 125, 150, 175, 200, 225, 250, 300, 350].includes(dpr) && !IPAD;
  $('zoomWarn').hidden = !zoomed;
  $('zoomWarn').textContent = MAC ? t('zoomMac') : t('zoomWin');
}

function renderParts() {
  const g = grid(), d = drawing(), c = cellSize(d, g.cols, g.rows), v = viewMm();
  syncDone();
  $('cols').value = g.cols; $('rows').value = g.rows;
  $('autoGrid').setAttribute('aria-pressed', String(S.grid.auto));
  const m = Math.min((v.w - c.w) / 2, (v.h - c.h) / 2);
  $('fitText').textContent = g.cols * g.rows === 1 && m >= 0 ? t('fitOne')
    : m >= 0 ? t('fitMany', { cw: Math.round(c.w), ch: Math.round(c.h), sw: Math.round(v.w), sh: Math.round(v.h), m: Math.round(m) })
      : t('fitNo', { cw: Math.round(c.w), ch: Math.round(c.h), sw: Math.round(v.w), sh: Math.round(v.h) });
  const { xs, ys } = gridLines(sheet(), d, g.cols, g.rows);
  $('coordX').textContent = xs.map((x) => fmt(x)).join(' · ') + (getLang() === 'en' ? ' mm' : ' мм');
  $('coordY').textContent = ys.map((y) => fmt(y)).join(' · ') + (getLang() === 'en' ? ' mm' : ' мм');
  const N = g.cols * g.rows, fresh = !S.done.length && S.cell === 0;
  $('startBtn').textContent = fresh ? t('start') : t('cont', { n: S.cell + 1 });
  $('progress').textContent = S.done.length ? t('progress', { d: S.done.length, n: N }) : '';
  $('resetDone').hidden = !S.done.length;
}

function renderPlan() {
  const sh = sheet(), d = drawing(), g = S.grid, c = cellSize(d, g.cols, g.rows);
  const u = Math.max(sh.w, sh.h) / 100; // one "unit" for strokes and text, relative to sheet size
  const fs = u * 2.4, L = u * 10, T = u * 10;
  const svg = $('sheet');
  svg.setAttribute('viewBox', `${-L} ${-T} ${sh.w + L + u * 3} ${sh.h + T + u * 3}`);
  let s = `<rect class="sh" x="0" y="0" width="${sh.w}" height="${sh.h}"/>`;
  if (pics) s += `<image href="${pics.view}" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" preserveAspectRatio="none" opacity=".5"/>`;
  for (let i = 0; i <= g.cols; i++) s += `<line class="gl" x1="${d.x + i * c.w}" y1="${d.y}" x2="${d.x + i * c.w}" y2="${d.y + d.h}"/>`;
  for (let j = 0; j <= g.rows; j++) s += `<line class="gl" x1="${d.x}" y1="${d.y + j * c.h}" x2="${d.x + d.w}" y2="${d.y + j * c.h}"/>`;
  const r = Math.min(c.w, c.h, u * 14) * 0.2;
  for (let n = 0; n < g.cols * g.rows; n++) {
    const col = n % g.cols, row = Math.floor(n / g.cols), x = d.x + col * c.w, y = d.y + row * c.h;
    const done = S.done.includes(n);
    s += `<g class="cell${done ? ' done' : ''}${n === S.cell && !(S.cell === 0 && !S.done.length) ? ' cur' : ''}" data-cell="${n}" tabindex="0" role="button" aria-label="${t('part', { n: n + 1, N: g.cols * g.rows })}">`
      + `<rect x="${x}" y="${y}" width="${c.w}" height="${c.h}"/>`
      + `<circle cx="${x + c.w / 2}" cy="${y + c.h / 2}" r="${r}"/>`
      + `<text x="${x + c.w / 2}" y="${y + c.h / 2}" font-size="${r * 1.05}">${done ? '✓' : n + 1}</text></g>`;
  }
  // dimensions: sheet width/height and the drawing offset
  const dim = (x1, y1, x2, y2, label, vert) => {
    const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2;
    return `<line class="dl" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
      + `<text class="dt" font-size="${fs}" x="${vert ? tx - u : tx}" y="${vert ? ty : ty - u}" text-anchor="middle" ${vert ? `transform="rotate(-90 ${tx - u} ${ty})"` : ''}>${label}</text>`;
  };
  s += dim(0, -u * 4, sh.w, -u * 4, `${fmt(sh.w)}`, false);
  s += dim(-u * 4, 0, -u * 4, sh.h, `${fmt(sh.h)}`, true);
  svg.innerHTML = s;
  $('planCap').textContent = `${S.sheet === 'custom' ? '' : S.sheet + ' · '}${fmt(sh.w)} × ${fmt(sh.h)} · ${g.cols} × ${g.rows} = ${g.cols * g.rows}`;
}

function renderSleepTip() {
  $('sleepTip').textContent = IPAD ? t('sleepIpad') : MAC ? t('sleepMac') : t('sleepWin');
}

function renderAll() {
  renderFile(); renderSheetCtl(); renderCalib(); renderParts(); renderPlan(); renderSleepTip();
  $('langBtn').textContent = getLang() === 'en' ? 'RU' : 'EN';
  $('paletteKey').textContent = MAC ? '⌘K' : 'Ctrl K';
  save();
}

/* ---------------- wiring ---------------- */
const seg = {};
seg.view = segmented(document.querySelector('[data-name=view]'), (v) => { S.view = v; S.traceColor = false; rebuild(); });
seg.sheet = segmented(document.querySelector('[data-name=sheet]'), (v) => { S.sheet = v; renderAll(); });
seg.land = segmented(document.querySelector('[data-name=land]'), (v) => { S.land = v === '1'; renderAll(); });
seg.sizeMode = segmented(document.querySelector('[data-name=sizeMode]'), (v) => {
  if (v === 'width') S.widthCm = Math.round(drawing().w / 10);
  S.sizeMode = v; renderAll();
});
steppers();

$('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) useFile(f); e.target.value = ''; });
let strengthT = null;
$('strength').addEventListener('input', (e) => { S.strength = Number(e.target.value); clearTimeout(strengthT); strengthT = setTimeout(rebuild, 120); });
$('rotBtn').addEventListener('click', () => { S.rot = (S.rot + 1) % 4; rebuild(); });
$('mirrorBtn').addEventListener('click', () => { S.mirror = !S.mirror; rebuild(); });
const num = (id, fn) => $(id).addEventListener('change', (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) fn(v); renderAll(); });
num('customW', (v) => { S.custom.w = Math.min(10000, Math.max(50, v)); });
num('customH', (v) => { S.custom.h = Math.min(10000, Math.max(50, v)); });
$('margin').addEventListener('change', (e) => { const v = Number(e.target.value); if (v >= 0) S.margin = Math.min(200, v); renderAll(); });
num('widthCm', (v) => { S.widthCm = Math.min(1000, v); });
num('cols', (v) => { S.grid.cols = Math.min(20, Math.round(v)); S.grid.auto = false; });
num('rows', (v) => { S.grid.rows = Math.min(20, Math.round(v)); S.grid.auto = false; });
$('autoGrid').addEventListener('click', () => { S.grid.auto = !S.grid.auto; renderAll(); });

// calibration
$('screenSel').addEventListener('change', (e) => { const c = calib(); c.screen = e.target.value; c.adj = 1; c.checked = false; renderAll(); });
num('diag', (v) => { const c = calib(); c.diag = Math.min(100, Math.max(5, v)); c.checked = false; });
document.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => {
  const c = calib(); c.adj = Math.min(3, Math.max(0.3, c.adj * (1 + Number(b.dataset.adj)))); c.checked = false; renderAll();
}));
$('calibOk').addEventListener('click', () => { calib().checked = true; renderAll(); });
$('calibReset').addEventListener('click', () => { const c = calib(); c.adj = 1; c.checked = false; renderAll(); });
// drag the card frame's right edge
$('cardGrip').addEventListener('pointerdown', (e) => {
  const grip = e.currentTarget, c = calib(), startX = e.clientX, a0 = c.adj, w0 = $('cardBox').offsetWidth;
  grip.setPointerCapture(e.pointerId);
  const mv = (ev) => { c.adj = Math.min(3, Math.max(0.3, a0 * (w0 + ev.clientX - startX) / w0)); c.checked = false; renderCalib(); };
  const up = () => { grip.removeEventListener('pointermove', mv); renderAll(); };
  grip.addEventListener('pointermove', mv);
  grip.addEventListener('pointerup', up, { once: true });
});

// plan → trace
const trace = createTrace({
  get: () => ({ S, sheet: sheet(), drawing: drawing(), k: k(), view: pics?.view, color: pics?.color, pixel: !src?.svg && pics && pics.w / drawing().w < 3 }),
  save,
  onExit: renderAll,
});
$('startBtn').addEventListener('click', () => trace.enter());
$('sheet').addEventListener('click', (e) => { const g = e.target.closest('.cell'); if (g) trace.enter(Number(g.dataset.cell)); });
$('sheet').addEventListener('keydown', (e) => {
  const g = e.target.closest?.('.cell');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); trace.enter(Number(g.dataset.cell)); }
});
$('resetDone').addEventListener('click', async () => {
  if (await confirmDialog(t('confirmReset'), t('confirmYes'))) { S.done = []; S.cell = 0; renderAll(); }
});

// drag & drop, paste
let dragDepth = 0;
addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('dropCover').hidden = false; e.preventDefault(); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropCover').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('dropCover').hidden = true;
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
      + `<div class="lbl">Kalka · ${i + 1}/${N} · ${getLang() === 'en' ? 'row' : 'ряд'} ${tile.row + 1}, ${getLang() === 'en' ? 'col' : 'колонка'} ${tile.col + 1} · <span style="display:inline-block;width:50mm;border-bottom:.3mm solid #000;vertical-align:middle"></span> 50 ${getLang() === 'en' ? 'mm' : 'мм'}</div></section>`;
  }).join('');
  toast(t('printInfo', { n: N }), 6000);
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
  toast(t('saved'));
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
    saveFile(f, f.name);
    toast(t('loaded'));
  } catch { toast(t('badFile')); }
}
$('exportBtn').addEventListener('click', exportProject);
$('importInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importProject(f); e.target.value = ''; });

/* ---------------- language, theme, palette ---------------- */
function setLanguage(l) { S.lang = l; setLang(l); renderAll(); }
$('langBtn').addEventListener('click', () => setLanguage(getLang() === 'en' ? 'ru' : 'en'));
function toggleTheme() {
  const root = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = root.dataset.theme || (dark ? 'dark' : 'light');
  root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
}

const pal = palette((q) => {
  const N = S.grid.cols * S.grid.rows, cmds = [];
  const n = parseInt(q, 10);
  if (n >= 1 && n <= N && String(n) === q.trim()) cmds.push({ title: t('cmdGo', { n }), always: true, run: () => (trace.open() ? trace.go(n - 1) : trace.enter(n - 1)) });
  cmds.push(
    { title: t('cmdTrace'), hint: 'Enter', run: () => trace.enter() },
    { title: t('cmdOpen'), run: () => $('fileInput').click() },
    { title: t('cmdDemo'), run: loadDemo },
    { title: t('cmdOutline'), run: () => { seg.view.set('outline'); S.view = 'outline'; rebuild(); } },
    { title: t('cmdBw'), run: () => { seg.view.set('bw'); S.view = 'bw'; rebuild(); } },
    { title: t('cmdOriginal'), run: () => { seg.view.set('original'); S.view = 'original'; rebuild(); } },
    { title: t('cmdMirror'), run: () => { S.mirror = !S.mirror; rebuild(); } },
    { title: t('cmdRotate'), run: () => { S.rot = (S.rot + 1) % 4; rebuild(); } },
    ...['A4', 'A3', 'A2', 'A1', 'A0'].map((s) => ({ title: t('cmdSheet', { s }), run: () => { S.sheet = s; renderAll(); } })),
    { title: t('cmdPrint'), run: printParts },
    { title: t('cmdExport'), run: exportProject },
    { title: t('cmdTheme'), run: toggleTheme },
    { title: t('cmdLang'), run: () => setLanguage(getLang() === 'en' ? 'ru' : 'en') },
  );
  if (!trace.open()) return cmds;
  return cmds.filter((c) => c.always || c.title !== t('cmdTrace'));
});
$('openPalette').addEventListener('click', () => pal.open());
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); pal.open(); }
});
addEventListener('scroll', () => document.querySelector('.top').classList.toggle('scrolled', scrollY > 4), { passive: true });
addEventListener('resize', () => { if (!trace.open()) { renderCalib(); renderParts(); renderPlan(); } });

/* ---------------- start ---------------- */
setLang(S.lang);
if (Object.keys(S.calib).length && !S.calib[sig()]) setTimeout(() => toast(t('newScreen'), 6000), 600);
renderAll();
(async () => {
  const stored = await loadFile();
  if (stored?.blob) await useFile(new File([stored.blob], stored.name, { type: stored.blob.type }), { restoring: true });
  else await loadDemo();
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.kalka = { S, k, drawing, sheet }; // handy for tests and the curious
