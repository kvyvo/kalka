// The light table: full screen, white, one part at true size, paper edge visible.
import { cellSize, cellPos, neighbour, nextTodo } from './geometry.js';
import { animate, SPRING } from './spring.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const RED = '#E0102F';

/**
 * `ctx` gives live access to the app: get() → { S, sheet, drawing, k, view, color },
 * save(), onExit().
 */
export function createTrace(ctx) {
  const trace = $('trace'), stage = $('stage'), overlay = $('overlay'), img = $('imgView'), hud = $('hud');
  const mini = $('mini'), lock = $('lock');
  let pos = null, fits = true, wake = null, wakeTried = false, idleTimer = null, hudHover = false, locked = false;

  const g = () => ctx.get();
  const total = () => g().S.grid.cols * g().S.grid.rows;
  const isFull = () => !!document.fullscreenElement;
  const open = () => !trace.hidden;

  function enterFull() {
    if (!document.fullscreenEnabled) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => updateHud());
  }
  const exitFull = () => { if (isFull()) document.exitFullscreen().catch(() => {}); };

  /** Screen scale corrected for browser zoom when we can measure it (full screen). */
  function scale() {
    const k = g().k;
    if (!isFull()) return k;
    const cssW = (innerWidth > innerHeight) === (screen.width > screen.height) ? screen.width : screen.height;
    const r = document.documentElement.clientWidth / cssW;
    return Math.abs(r - 1) > 0.01 && Math.abs(r - 1) < 0.6 ? { x: k.x * r, y: k.y * r } : k;
  }

  function layout(animated) {
    const { S, sheet, drawing } = g(), k = scale(), dpr = devicePixelRatio || 1;
    const { cols, rows } = S.grid, c = cellSize(drawing, cols, rows), p = cellPos(S.cell, cols);
    const W = trace.clientWidth, H = trace.clientHeight;
    stage.style.width = sheet.w * k.x + 'px';
    stage.style.height = sheet.h * k.y + 'px';
    img.style.left = drawing.x * k.x + 'px';
    img.style.top = drawing.y * k.y + 'px';
    img.style.width = drawing.w * k.x + 'px';
    img.style.height = drawing.h * k.y + 'px';
    overlay.style.width = stage.style.width; overlay.style.height = stage.style.height;
    overlay.setAttribute('viewBox', `0 0 ${sheet.w} ${sheet.h}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    $('ctlBar').querySelector('span').style.width = 100 * k.x + 'px';
    const cx = drawing.x + (p.col + 0.5) * c.w, cy = drawing.y + (p.row + 0.5) * c.h;
    const tx = Math.round((W / 2 - cx * k.x) * dpr) / dpr, ty = Math.round((H / 2 - cy * k.y) * dpr) / dpr;
    fits = W / k.x >= c.w + 2 && H / k.y >= c.h + 2;
    const apply = () => { stage.style.transform = `translate(${pos.x.value}px, ${pos.y.value}px)`; };
    if (!pos || !animated) {
      pos?.x.stop(); pos?.y.stop();
      pos = { x: { value: tx, velocity: 0, stop() {} }, y: { value: ty, velocity: 0, stop() {} } };
      apply();
      return;
    }
    stage.style.willChange = 'transform';
    pos.x = animate(pos.x, tx, apply, SPRING.smooth);
    pos.y = animate(pos.y, ty, (v) => { apply(); if (v === ty) stage.style.willChange = ''; }, SPRING.smooth);
  }

  function renderOverlay() {
    const { S, sheet, drawing } = g(), { cols, rows } = S.grid, c = cellSize(drawing, cols, rows);
    const p = cellPos(S.cell, cols), x0 = drawing.x, y0 = drawing.y;
    let s = '';
    if (S.dim) {
      const cx = x0 + p.col * c.w, cy = y0 + p.row * c.h;
      s += `<path d="M0 0H${sheet.w}V${sheet.h}H0Z M${cx} ${cy}V${cy + c.h}H${cx + c.w}V${cy}Z" fill="#fff" fill-opacity=".62" fill-rule="evenodd"/>`;
    }
    if (S.showGrid) {
      s += `<g stroke="${RED}" fill="none" vector-effect="non-scaling-stroke">`;
      for (let i = 0; i <= cols; i++) s += `<line x1="${x0 + i * c.w}" y1="${y0}" x2="${x0 + i * c.w}" y2="${y0 + drawing.h}" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      for (let j = 0; j <= rows; j++) s += `<line x1="${x0}" y1="${y0 + j * c.h}" x2="${x0 + drawing.w}" y2="${y0 + j * c.h}" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
        const x = x0 + i * c.w, y = y0 + j * c.h;
        s += `<path d="M${x - 8} ${y}H${x + 8}M${x} ${y - 8}V${y + 8}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
      }
      // current part: bolder frame
      const cx = x0 + p.col * c.w, cy = y0 + p.row * c.h;
      s += `<rect x="${cx}" y="${cy}" width="${c.w}" height="${c.h}" stroke-width="2" vector-effect="non-scaling-stroke"/></g>`;
    }
    overlay.innerHTML = s;
  }

  function applyImage() {
    const { S, view, color } = g();
    img.src = S.traceColor ? color : view;
  }

  function buildMini() {
    const { cols } = g().S.grid;
    mini.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    mini.innerHTML = Array.from({ length: total() }, (_, n) => `<button type="button" data-cell="${n}" aria-label="${t('part', { n: n + 1, N: total() })}"></button>`).join('');
  }

  function updateHud() {
    if (!open()) return;
    const { S } = g(), N = total(), { cols } = S.grid, p = cellPos(S.cell, cols);
    if (mini.children.length !== N) buildMini();
    [...mini.children].forEach((b, n) => { b.classList.toggle('cur', n === S.cell); b.classList.toggle('done', S.done.includes(n)); });
    $('hudPart').textContent = t('part', { n: S.cell + 1, N });
    $('hudPos').textContent = t('pos', { r: p.row + 1, c: p.col + 1 });
    $('bDone').setAttribute('aria-pressed', String(S.done.includes(S.cell)));
    $('bMode').setAttribute('aria-pressed', String(S.traceColor));
    $('bMode').hidden = S.view === 'original';
    $('bGrid').setAttribute('aria-pressed', String(S.showGrid));
    $('bDim').setAttribute('aria-pressed', String(S.dim));
    $('bFull').hidden = isFull() || !document.fullscreenEnabled;
    $('ctlBar').querySelector('b').textContent = t('ctl');
    const parts = [];
    if (!fits) parts.push(`<span class="warn">${t('noFit')}${isFull() || !document.fullscreenEnabled ? '' : ' ' + t('goFull')}</span>`);
    if (S.done.length === N) parts.push(t('allDone'));
    if (wakeTried && wake) parts.push(t('wakeOn'));
    $('hudStatus').innerHTML = parts.join(' ');
    $('hudStatus').hidden = !parts.length;
  }

  function poke() {
    if (!open() || locked) return;
    trace.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!hudHover) trace.classList.add('idle'); }, 2600);
  }

  async function lockWake() {
    wakeTried = true;
    try {
      if ('wakeLock' in navigator) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; updateHud(); });
      }
    } catch { wake = null; }
    updateHud();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && open() && !wake) lockWake(); });

  function go(n, animated = true) {
    const N = total();
    g().S.cell = ((n % N) + N) % N;
    ctx.save(); renderOverlay(); layout(animated); updateHud(); poke();
    const { S } = g(), p = cellPos(S.cell, S.grid.cols);
    $('announce').textContent = `${t('part', { n: S.cell + 1, N })}, ${t('pos', { r: p.row + 1, c: p.col + 1 })}`;
  }
  const move = (dc, dr) => { const { cols, rows } = g().S.grid; go(neighbour(g().S.cell, cols, rows, dc, dr)); };
  function toggleDone() {
    const d = g().S.done, i = d.indexOf(g().S.cell);
    if (i >= 0) d.splice(i, 1); else d.push(g().S.cell);
    ctx.save(); updateHud(); poke();
  }
  function doneAndNext() {
    const { S } = g();
    if (!S.done.includes(S.cell)) S.done.push(S.cell);
    ctx.save();
    const n = nextTodo(S.cell, total(), S.done);
    if (n !== S.cell) go(n); else { updateHud(); poke(); }
  }
  const toggle = (key, fn) => { g().S[key] = !g().S[key]; ctx.save(); fn(); updateHud(); poke(); };

  function setLock(on) {
    locked = on;
    lock.hidden = !on;
    hud.hidden = on;
    trace.classList.toggle('idle', on);
    if (on) $('announce').textContent = t('lockOn'); else poke();
  }
  // hold to unlock: 1.2 s on the button, or holding Esc
  let holdT = null;
  const ring = $('unlockRing');
  const holdStart = () => {
    ring.style.transition = 'width 1.2s linear'; ring.style.width = '100%';
    holdT = setTimeout(() => { setLock(false); holdEnd(); }, 1200);
  };
  const holdEnd = () => { clearTimeout(holdT); ring.style.transition = 'none'; ring.style.width = '0'; };
  $('unlockBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); holdStart(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('unlockBtn').addEventListener(ev, holdEnd));
  lock.addEventListener('pointerdown', (e) => e.preventDefault());

  function enter(n) {
    enterFull(); // must stay synchronous inside the click
    if (typeof n === 'number') g().S.cell = n;
    if (g().S.cell >= total()) g().S.cell = 0;
    document.getElementById('setup').hidden = true;
    trace.hidden = false;
    trace.classList.toggle('pixel', g().pixel);
    applyImage(); buildMini(); renderOverlay(); pos = null; layout(false); updateHud(); poke();
    ctx.save(); lockWake();
  }
  function exit() {
    exitFull();
    try { wake?.release(); } catch { /* already released */ }
    wake = null;
    setLock(false);
    trace.hidden = true;
    document.getElementById('setup').hidden = false;
    ctx.onExit();
  }

  mini.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { go(Number(b.dataset.cell)); b.blur(); } });
  const click = (id, fn) => $(id).addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
  click('bPrev', () => go(g().S.cell - 1));
  click('bNext', () => go(g().S.cell + 1));
  click('bDone', toggleDone);
  click('bMode', () => toggle('traceColor', applyImage));
  click('bGrid', () => toggle('showGrid', renderOverlay));
  click('bDim', () => toggle('dim', renderOverlay));
  click('bLock', () => setLock(true));
  click('bFull', enterFull);
  $('bExit').addEventListener('click', exit);
  trace.addEventListener('pointermove', poke);
  trace.addEventListener('pointerdown', poke);
  hud.addEventListener('pointerenter', () => { hudHover = true; });
  hud.addEventListener('pointerleave', () => { hudHover = false; poke(); });
  // pinch-zoom would break the true scale
  trace.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  trace.addEventListener('gesturestart', (e) => e.preventDefault());

  let escDown = 0;
  document.addEventListener('keydown', (e) => {
    if (!open() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (locked) {
      e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) escDown = performance.now();
      if (e.code === 'Escape' && e.repeat && performance.now() - escDown > 1200) setLock(false);
      return;
    }
    let handled = true;
    switch (e.code) {
      case 'ArrowLeft': move(-1, 0); break;
      case 'ArrowRight': move(1, 0); break;
      case 'ArrowUp': move(0, -1); break;
      case 'ArrowDown': move(0, 1); break;
      case 'Space': go(g().S.cell + (e.shiftKey ? -1 : 1)); break;
      case 'Enter': case 'NumpadEnter': doneAndNext(); break;
      case 'KeyC': if (!$('bMode').hidden) toggle('traceColor', applyImage); break;
      case 'KeyG': toggle('showGrid', renderOverlay); break;
      case 'KeyD': toggle('dim', renderOverlay); break;
      case 'KeyL': setLock(true); break;
      case 'KeyH': hud.hidden = !hud.hidden; poke(); break;
      case 'KeyF': isFull() ? exitFull() : enterFull(); break;
      case 'Escape': if (!isFull()) exit(); break;
      default:
        if (/^Digit[1-9]$/.test(e.code) && Number(e.code.slice(5)) <= total()) go(Number(e.code.slice(5)) - 1);
        else handled = false;
    }
    if (handled) e.preventDefault();
  });
  const onFs = () => { if (open()) { layout(false); updateHud(); poke(); } };
  document.addEventListener('fullscreenchange', onFs);
  addEventListener('resize', () => { if (open()) { layout(false); updateHud(); } });

  return { enter, exit, go, open, refresh() { if (open()) { applyImage(); renderOverlay(); layout(false); updateHud(); } } };
}
