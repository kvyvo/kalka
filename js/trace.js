import { cellSize, cellPos, neighbour, nextTodo } from './geometry.js';
import { SPRING } from './spring.js';
import { Springs, morph, swap, grow, easing, reduced } from './motion.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const RED = '#E0102F';

export function createTrace(ctx) {
  const trace = $('trace'), stage = $('stage'), overlay = $('overlay'), img = $('imgView');
  const mini = $('mini'), lockEl = $('lock'), unlock = $('unlockBtn'), fill = $('unlockRing');
  let fits = true, wake = null, wakeTried = false, idleTimer = null, hudHover = false, locked = false;

  const g = () => ctx.get();
  const total = () => g().S.grid.cols * g().S.grid.rows;
  const isFull = () => !!document.fullscreenElement;
  const open = () => !trace.hidden;

  const hud = morph($('hudShape'), {
    full: { layer: $('hudFull'), radius: 26 },
    compact: { layer: $('hudCompact') },
    lock: { layer: unlock },
  }, { dark: '--hud-bg', light: '--hud-bg' });

  function enterFull() {
    if (!document.fullscreenEnabled) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => updateHud());
  }
  const exitFull = () => { if (isFull()) document.exitFullscreen().catch(() => {}); };

  function scale() {
    const k = g().k;
    if (!isFull()) return k;
    const cssW = (innerWidth > innerHeight) === (screen.width > screen.height) ? screen.width : screen.height;
    const r = document.documentElement.clientWidth / cssW;
    return Math.abs(r - 1) > 0.01 && Math.abs(r - 1) < 0.6 ? { x: k.x * r, y: k.y * r } : k;
  }

  const dpr = () => devicePixelRatio || 1;
  const pos = new Springs({ x: 0, y: 0 }, ({ x, y }) => {
    stage.style.transform = `translate(${Math.round(x * dpr()) / dpr()}px, ${Math.round(y * dpr()) / dpr()}px)`;
  });
  function layout(animated) {
    const { S, sheet, drawing } = g(), k = scale();
    const { cols, rows } = S.grid, c = cellSize(drawing, cols, rows), p = cellPos(S.cell, cols);
    const W = trace.clientWidth, H = trace.clientHeight;
    stage.style.width = `${sheet.w * k.x}px`;
    stage.style.height = `${sheet.h * k.y}px`;
    Object.assign(img.style, { left: `${drawing.x * k.x}px`, top: `${drawing.y * k.y}px`, width: `${drawing.w * k.x}px`, height: `${drawing.h * k.y}px` });
    overlay.style.width = stage.style.width; overlay.style.height = stage.style.height;
    overlay.setAttribute('viewBox', `0 0 ${sheet.w} ${sheet.h}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    $('ctlBar').querySelector('span').style.width = `${100 * k.x}px`;
    const cx = drawing.x + (p.col + 0.5) * c.w, cy = drawing.y + (p.row + 0.5) * c.h;
    fits = W / k.x >= c.w + 2 && H / k.y >= c.h + 2;
    const target = { x: W / 2 - cx * k.x, y: H / 2 - cy * k.y };
    animated ? pos.to(target, SPRING.smooth) : pos.set(target);
  }

  function renderOverlay() {
    const { S, sheet, drawing } = g(), { cols, rows } = S.grid, c = cellSize(drawing, cols, rows);
    const p = cellPos(S.cell, cols), x0 = drawing.x, y0 = drawing.y;
    const cx = x0 + p.col * c.w, cy = y0 + p.row * c.h;
    let s = '';
    if (S.dim) s += `<path d="M0 0H${sheet.w}V${sheet.h}H0Z M${cx} ${cy}V${cy + c.h}H${cx + c.w}V${cy}Z" fill="#fff" fill-opacity=".62" fill-rule="evenodd"/>`;
    if (S.showGrid) {
      s += `<g stroke="${RED}" fill="none">`;
      for (let i = 0; i <= cols; i++) s += `<line x1="${x0 + i * c.w}" y1="${y0}" x2="${x0 + i * c.w}" y2="${y0 + drawing.h}" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      for (let j = 0; j <= rows; j++) s += `<line x1="${x0}" y1="${y0 + j * c.h}" x2="${x0 + drawing.w}" y2="${y0 + j * c.h}" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
        const x = x0 + i * c.w, y = y0 + j * c.h;
        s += `<path d="M${x - 8} ${y}H${x + 8}M${x} ${y - 8}V${y + 8}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
      }
      s += `<rect x="${cx}" y="${cy}" width="${c.w}" height="${c.h}" stroke-width="2" vector-effect="non-scaling-stroke"/></g>`;
    }
    overlay.innerHTML = s;
  }

  function applyImage() {
    const { S, view, color } = g();
    img.src = S.traceColor ? color : view;
  }

  const cur = $('miniCur');
  const curSp = new Springs({ x: 0, y: 0 }, ({ x, y }) => { cur.style.transform = `translate(${x}px, ${y}px)`; });
  function buildMini() {
    const { cols } = g().S.grid;
    mini.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    mini.querySelectorAll('button').forEach((b) => b.remove());
    mini.insertAdjacentHTML('beforeend', Array.from({ length: total() }, (_, n) => `<button type="button" data-cell="${n}" aria-label="${t('part', { n: n + 1, N: total() })}"></button>`).join(''));
  }
  function placeCur(animated) {
    const b = mini.querySelector(`button[data-cell="${g().S.cell}"]`);
    if (!b) return;
    const v = { x: b.offsetLeft, y: b.offsetTop };
    animated ? curSp.to(v, { x: SPRING.ui, y: SPRING.ui }) : curSp.set(v);
  }
  let lastCell = -1;
  function updateHud() {
    if (!open()) return;
    const { S } = g(), N = total(), { cols } = S.grid, p = cellPos(S.cell, cols);
    if (mini.querySelectorAll('button').length !== N) buildMini();
    mini.querySelectorAll('button').forEach((b, n) => b.classList.toggle('done', S.done.includes(n)));
    const dir = S.cell >= lastCell ? 1 : -1;
    swap($('hudPart'), t('part', { n: S.cell + 1, N }), dir);
    swap($('hudPos'), t('pos', { r: p.row + 1, c: p.col + 1 }), dir);
    swap($('hudCompactText'), `${S.cell + 1} / ${N}`, dir);
    lastCell = S.cell;
    $('hudRing').style.strokeDasharray = `${(S.done.length / N) * 100} 100`;
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
    placeCur(true);
    if (hud.state === 'full') hud.to('full');
  }

  function poke() {
    if (!open() || locked) return;
    trace.classList.remove('idle');
    if (hud.state !== 'full') hud.to('full');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (hudHover || locked) return;
      trace.classList.add('idle');
      hud.to('compact');
    }, 2600);
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
    lockEl.hidden = !on;
    clearTimeout(idleTimer);
    trace.classList.toggle('idle', on);
    if (on) { hud.to('lock'); $('announce').textContent = t('lockOn'); } else { hud.to('full'); poke(); }
  }
  let holdAnim = null;
  const holdStart = (e) => {
    e.preventDefault();
    if (!locked) return;
    unlock.classList.add('holding');
    holdAnim?.cancel();
    holdAnim = fill.animate([{ width: getComputedStyle(fill).width }, { width: '100%' }], { duration: 1200, easing: 'linear', fill: 'forwards' });
    holdAnim.onfinish = () => { holdEnd(); setLock(false); };
  };
  const holdEnd = () => {
    unlock.classList.remove('holding');
    if (!holdAnim) return;
    const w = getComputedStyle(fill).width;
    holdAnim.cancel();
    holdAnim = null;
    const e = easing(SPRING.snappy);
    fill.animate([{ width: w }, { width: '0px' }], { duration: e.duration, easing: e.easing });
  };
  unlock.addEventListener('pointerdown', holdStart);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => unlock.addEventListener(ev, holdEnd));
  lockEl.addEventListener('pointerdown', (e) => e.preventDefault());

  function enter(n, fromEl) {
    enterFull();
    if (typeof n === 'number') g().S.cell = n;
    if (g().S.cell >= total()) g().S.cell = 0;
    const r = fromEl?.getBoundingClientRect();
    const radius = fromEl ? parseFloat(getComputedStyle(fromEl).borderRadius) || 0 : 0;
    const fromColor = fromEl ? getComputedStyle(fromEl).backgroundColor : '#fff';
    const show = () => {
      document.getElementById('setup').hidden = true;
      trace.hidden = false;
      trace.classList.toggle('pixel', !!g().pixel);
      applyImage(); buildMini(); renderOverlay(); layout(false); lastCell = g().S.cell; updateHud();
      hud.to('full'); placeCur(false); poke();
      ctx.save(); lockWake();
    };
    if (!r || reduced()) return show();
    grow(r, { fromColor: fromColor === 'rgba(0, 0, 0, 0)' ? '#fff' : fromColor, fromRadius: radius }).then(show);
  }
  function exit() {
    exitFull();
    try { wake?.release(); } catch {  }
    wake = null;
    setLock(false);
    trace.hidden = true;
    document.getElementById('setup').hidden = false;
    ctx.onExit();
    const cell = ctx.cellEl(g().S.cell);
    const r = cell?.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < innerHeight) grow(r, { fromColor: '#FFFFFF', toColor: '#FFFFFF', fromRadius: 4, reverse: true });
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
  click('hudCompact', poke);
  $('bExit').addEventListener('click', exit);
  trace.addEventListener('pointermove', poke);
  trace.addEventListener('pointerdown', poke);
  $('hud').addEventListener('pointerenter', () => { hudHover = true; });
  $('hud').addEventListener('pointerleave', () => { hudHover = false; poke(); });
  trace.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  trace.addEventListener('gesturestart', (e) => e.preventDefault());

  let escDown = 0;
  document.addEventListener('keydown', (e) => {
    if (!open() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog:modal')) return;
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
      case 'KeyH': $('hud').hidden = !$('hud').hidden; poke(); break;
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
