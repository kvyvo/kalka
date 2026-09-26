import { SPRING, fromApple } from './spring.js';
import { Springs, swap, reduced } from './motion.js';
import { t } from './i18n.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};

export function hero(svg, caption) {
  const W = 600, H = 430, S = 520 / 420, sx = 40, sy = 30, sw = 420 * S, sh = 297 * S;
  const dw = 380 * S, dh = 268.7 * S, dx = sx + (sw - dw) / 2, dy = sy + (sh - dh) / 2;
  const COLS = 3, ROWS = 2, cw = dw / COLS, ch = dh / ROWS, PAD = 16;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const defs = el('defs', {}, svg);
  const lit = el('clipPath', { id: 'heroLit' }, defs);
  const litRect = el('rect', { rx: 12 }, lit);
  const traced = el('clipPath', { id: 'heroTraced' }, defs);
  const tracedRects = Array.from({ length: COLS * ROWS }, () => el('rect', { height: ch, width: 0 }, traced));

  const screen = el('rect', { class: 'h-screen', rx: 14, width: cw + 2 * PAD, height: ch + 2 * PAD }, svg);
  el('rect', { class: 'h-sheet', x: sx, y: sy, width: sw, height: sh, rx: 4 }, svg);
  el('image', { href: 'assets/demo.svg', x: dx, y: dy, width: dw, height: dh, class: 'h-faint' }, svg);
  el('image', { href: 'assets/demo.svg', x: dx, y: dy, width: dw, height: dh, 'clip-path': 'url(#heroLit)' }, svg);
  el('image', { href: 'assets/demo.svg', x: dx, y: dy, width: dw, height: dh, class: 'h-pencil', 'clip-path': 'url(#heroTraced)' }, svg);
  const grid = el('g', { class: 'h-grid' }, svg);
  for (let i = 0; i <= COLS; i++) el('line', { x1: dx + i * cw, y1: dy, x2: dx + i * cw, y2: dy + dh }, grid);
  for (let j = 0; j <= ROWS; j++) el('line', { x1: dx, y1: dy + j * ch, x2: dx + dw, y2: dy + j * ch }, grid);
  const frame = el('rect', { class: 'h-frame', rx: 10, width: cw, height: ch }, svg);
  const checks = Array.from({ length: COLS * ROWS }, (_, n) => {
    const g = el('g', { class: 'h-check', transform: `translate(${dx + (n % COLS + 1) * cw - 16} ${dy + Math.floor(n / COLS) * ch + 16})` }, svg);
    const inner = el('g', {}, g);
    el('circle', { r: 11 }, inner);
    el('path', { d: 'M-4.5 0.5l3 3 6-6.5' }, inner);
    return inner;
  });

  const pos = (n) => ({ x: dx + (n % COLS) * cw, y: dy + Math.floor(n / COLS) * ch });
  const p0 = pos(0);
  const sp = new Springs({ x: p0.x, y: p0.y, glow: 1 }, ({ x, y, glow }) => {
    screen.setAttribute('x', x - PAD); screen.setAttribute('y', y - PAD);
    screen.style.opacity = 0.1 + 0.14 * glow;
    litRect.setAttribute('x', x - PAD / 2); litRect.setAttribute('y', y - PAD / 2);
    litRect.setAttribute('width', cw + PAD); litRect.setAttribute('height', ch + PAD);
    frame.setAttribute('x', x); frame.setAttribute('y', y);
  });
  const wipe = (n, k) => {
    const p = pos(n), r = tracedRects[n];
    r.setAttribute('x', p.x); r.setAttribute('y', p.y); r.setAttribute('width', cw * k);
  };
  const tick = new Springs({ ...Object.fromEntries(checks.map((_, n) => [`c${n}`, 0])), ...Object.fromEntries(checks.map((_, n) => [`w${n}`, 0])) }, (v) => {
    checks.forEach((c, n) => {
      const s = Math.max(0, v[`c${n}`]);
      c.setAttribute('transform', `scale(${s})`);
      c.style.opacity = Math.min(1, s);
      wipe(n, Math.min(1, Math.max(0, v[`w${n}`])));
    });
  });
  const say = (n) => caption && swap(caption, t('heroPart', { n: n + 1, N: COLS * ROWS }));
  if (caption) caption.textContent = t('heroPart', { n: 1, N: COLS * ROWS });

  if (reduced()) {
    const p = pos(2); sp.set({ x: p.x, y: p.y });
    tick.set({ c0: 1, w0: 1, c1: 1, w1: 1 });
    say(2);
    return;
  }

  let n = 0, timer = 0, running = false;
  const TRACE = fromApple(0.9, 0);
  const step = () => {
    if (!running) return;
    const p = pos(n);
    say(n);
    sp.to({ x: p.x, y: p.y }, SPRING.smooth);
    sp.to({ glow: 0.4 }, SPRING.quick);
    timer = setTimeout(() => {
      sp.to({ glow: 1 }, SPRING.ui);
      tick.to({ [`w${n}`]: 1 }, TRACE);
      timer = setTimeout(() => {
        tick.to({ [`c${n}`]: 1 }, fromApple(0.4, 0.12));
        timer = setTimeout(() => {
          n++;
          if (n < COLS * ROWS) return step();
          timer = setTimeout(() => {
            tick.to(Object.fromEntries(checks.flatMap((_, i) => [[`c${i}`, 0], [`w${i}`, 0]])), SPRING.smooth);
            n = 0;
            timer = setTimeout(step, 450);
          }, 900);
        }, 260);
      }, 620);
    }, 520);
  };
  const play = (on) => {
    if (on === running) return;
    running = on;
    clearTimeout(timer);
    if (on) step();
  };
  const io = new IntersectionObserver(([e]) => play(e.isIntersecting && !document.hidden), { threshold: 0.2 });
  io.observe(svg);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) play(false);
    else { const r = svg.getBoundingClientRect(); play(r.bottom > 0 && r.top < innerHeight); }
  });
}
