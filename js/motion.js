import { spring, settleTime, SPRING } from './spring.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reduced = () => mq.matches;
let live = false;
export const goLive = () => { live = true; };
const now = () => performance.now() / 1000;
const isPreset = (o) => o && typeof o.stiffness === 'number';

const easings = new Map();
export function easing(preset = SPRING.snappy) {
  const key = `${preset.stiffness}|${preset.damping}`;
  if (!easings.has(key)) {
    const p = spring(preset), T = settleTime(p, 2e-3), pts = [];
    for (let i = 0; i <= 40; i++) pts.push(+p((T * i) / 40).toFixed(4));
    easings.set(key, { easing: `linear(${pts.join(',')})`, duration: Math.round(T * 1000) });
  }
  return easings.get(key);
}

export class Springs {
  constructor(values, onFrame) {
    this.k = {};
    for (const [key, v] of Object.entries(values)) this.k[key] = { from: v, to: v, t0: 0, p: null, T: 0 };
    this.onFrame = onFrame;
    this.raf = 0;
    this.tick = this.tick.bind(this);
    this.kick();
  }
  value(key, t = now()) {
    const s = this.k[key];
    if (!s.p || t - s.t0 >= s.T) return s.to;
    return s.from + (s.to - s.from) * s.p(t - s.t0);
  }
  velocity(key, t = now()) {
    const s = this.k[key];
    if (!s.p || t - s.t0 >= s.T) return 0;
    const dt = t - s.t0;
    return ((s.to - s.from) * (s.p(dt + 1e-3) - s.p(dt))) / 1e-3;
  }
  get values() { const t = now(), o = {}; for (const key in this.k) o[key] = this.value(key, t); return o; }
  target(key) { return this.k[key].to; }
  to(targets, preset = SPRING.smooth) {
    const t = now();
    for (const [key, target] of Object.entries(targets)) {
      const s = this.k[key] ??= { from: target, to: target, t0: 0, p: null, T: 0 };
      const cur = this.value(key, t), vel = this.velocity(key, t), d = target - cur;
      if (reduced() || (Math.abs(d) < 1e-4 && Math.abs(vel) < 1e-3)) { Object.assign(s, { from: target, to: target, p: null }); continue; }
      const pr = isPreset(preset) ? preset : preset[key] ?? preset.default ?? SPRING.smooth;
      const p = spring({ ...pr, velocity: vel / d });
      Object.assign(s, { from: cur, to: target, t0: t, p, T: settleTime(p) });
    }
    reduced() ? this.now() : this.kick();
    return this;
  }
  set(values) {
    for (const [key, v] of Object.entries(values)) this.k[key] = { from: v, to: v, t0: 0, p: null, T: 0 };
    this.now();
    return this;
  }
  now() { cancelAnimationFrame(this.raf); this.raf = 0; this.tick(); }
  kick() { if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
  tick() {
    this.raf = 0;
    const t = now();
    let active = false;
    for (const key in this.k) { const s = this.k[key]; if (s.p && t - s.t0 < s.T) active = true; else s.p = null; }
    this.onFrame(this.values);
    if (active) this.kick();
  }
}

export function swap(el, text, dir = 1) {
  text = String(text);
  if (el.textContent === text) return;
  const visible = el.isConnected && el.offsetParent !== null && el.textContent !== '';
  if (!live || reduced() || !visible || !el.animate) { el.textContent = text; return; }
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', pointerEvents: 'none', zIndex: '70', font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing,
    textAlign: cs.textAlign, whiteSpace: 'nowrap', overflow: 'visible', display: 'block', padding: cs.padding, boxSizing: cs.boxSizing,
    fontVariantNumeric: cs.fontVariantNumeric,
  });
  document.body.append(ghost);
  const off = `${0.35 * dir}em`;
  ghost.animate([
    { opacity: 1, filter: 'blur(0)', transform: 'none' },
    { opacity: 0, filter: 'blur(5px)', transform: `translateY(calc(-1 * ${off}))` },
  ], { duration: 200, easing: 'cubic-bezier(.4,0,.6,1)' }).onfinish = () => ghost.remove();
  el.textContent = text;
  const e = easing(SPRING.ui);
  el.animate([
    { opacity: 0, filter: 'blur(5px)', transform: `translateY(${off})` },
    { opacity: 1, filter: 'blur(0)', transform: 'none' },
  ], { duration: e.duration, easing: e.easing, delay: 50, fill: 'backwards' });
}

export function reveal(el, show) {
  if (!!show === !el.hidden && !el._revealing) return;
  if (!live || reduced() || !el.animate || !el.parentElement || el.parentElement.offsetParent === null) {
    el.getAnimations?.().forEach((a) => a.cancel());
    el._revealing = false;
    el.hidden = !show;
    return;
  }
  el.getAnimations().forEach((a) => a.cancel());
  const gap = parseFloat(getComputedStyle(el.parentElement).rowGap) || 0;
  el.hidden = false;
  const h = el.offsetHeight;
  const closed = { height: '0px', marginTop: `${-gap}px`, opacity: 0, filter: 'blur(4px)', overflow: 'hidden' };
  const open = { height: `${h}px`, marginTop: '0px', opacity: 1, filter: 'blur(0)', overflow: 'hidden' };
  const e = easing(SPRING.smooth);
  el._revealing = true;
  const a = el.animate(show ? [closed, open] : [open, closed], { duration: show ? e.duration : 240, easing: show ? e.easing : 'cubic-bezier(.4,0,.2,1)' });
  a.onfinish = () => { el._revealing = false; el.hidden = !show; };
}

function crossfade(from, to) {
  if (from && from !== to) {
    from.setAttribute('inert', '');
    if (reduced() || !from.animate) from.style.opacity = 0;
    else from.animate([{ opacity: 1, filter: 'blur(0)', scale: 1 }, { opacity: 0, filter: 'blur(6px)', scale: 0.97 }],
      { duration: 160, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  }
  if (to) {
    to.removeAttribute('inert');
    to.getAnimations?.().forEach((a) => a.cancel());
    to.style.opacity = 1;
    if (!reduced() && to.animate && from !== to) {
      const e = easing(SPRING.ui);
      to.animate([{ opacity: 0, filter: 'blur(6px)', scale: 0.97 }, { opacity: 1, filter: 'blur(0)', scale: 1 }],
        { duration: e.duration, easing: e.easing, delay: 70, fill: 'backwards' });
    }
  }
}

let probe = null;
function rgb(color) {
  if (!probe) { probe = document.createElement('i'); probe.style.display = 'none'; document.body.append(probe); }
  probe.style.color = '';
  probe.style.color = color.trim();
  return (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
}

export function morph(shape, states, { dark = '--island', light = '--surface', onFrame } = {}) {
  let cur = null;
  const layers = Object.values(states).map((s) => s.layer);
  layers.forEach((l) => { l.style.opacity = 0; l.setAttribute('inert', ''); });
  const colours = () => {
    const cs = getComputedStyle(shape);
    return [rgb(cs.getPropertyValue(dark) || '#000'), rgb(cs.getPropertyValue(light) || '#fff')];
  };
  let pal = null;
  const sp = new Springs({ w: 0, h: 0, r: 0, light: 0 }, (v) => {
    pal ||= colours();
    const [a, b] = pal, k = Math.min(1, Math.max(0, v.light));
    shape.style.width = `${Math.max(0, v.w)}px`;
    shape.style.height = `${Math.max(0, v.h)}px`;
    shape.style.borderRadius = `${Math.max(0, v.r)}px`;
    shape.style.backgroundColor = `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * k)).join(',')})`;
    onFrame?.(v);
  });
  function size(st) {
    const l = st.layer;
    if (st.width) l.style.width = `${typeof st.width === 'function' ? st.width() : st.width}px`;
    return { w: l.offsetWidth, h: l.offsetHeight };
  }
  const api = {
    get state() { return cur; },
    to(name, preset = { w: SPRING.snappy, h: SPRING.snappy, r: SPRING.snappy, light: SPRING.ui }) {
      const st = states[name], prev = cur && states[cur];
      pal = colours();
      const { w, h } = size(st);
      const r = st.radius ?? h / 2;
      if (!cur) sp.set({ w, h, r, light: st.light ?? 0 });
      else sp.to({ w, h, r, light: st.light ?? 0 }, preset);
      if (name !== cur) crossfade(prev?.layer, st.layer);
      cur = name;
      shape.dataset.state = name;
      return api;
    },
    springs: sp,
  };
  const ro = new ResizeObserver((entries) => {
    if (cur && entries.some((e) => e.target === states[cur].layer)) api.to(cur);
  });
  layers.forEach((l) => ro.observe(l));
  return api;
}

export function grow(fromRect, { fromColor = '#111110', toColor = '#ffffff', fromRadius = 24, reverse = false } = {}) {
  if (reduced() || !fromRect) return Promise.resolve();
  const el = document.createElement('div');
  el.className = 'grow-fx';
  document.body.append(el);
  const [a, b] = [rgb(fromColor), rgb(toColor)];
  fromRadius = Math.min(fromRadius, fromRect.height / 2, fromRect.width / 2);
  return new Promise((resolve) => {
    let done = false;
    const sp = new Springs({ k: reverse ? 1 : 0 }, ({ k }) => {
      const W = innerWidth, H = innerHeight, q = 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
      const x = fromRect.left * (1 - k), y = fromRect.top * (1 - k);
      const w = fromRect.width + (W - fromRect.width) * k, h = fromRect.height + (H - fromRect.height) * k;
      Object.assign(el.style, {
        transform: `translate(${x}px, ${y}px)`, width: `${w}px`, height: `${h}px`,
        borderRadius: `${fromRadius * (1 - q)}px`, backgroundColor: `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * q)).join(',')})`,
      });
      if (!done && (reverse ? k < 0.04 : k > 0.96)) {
        done = true;
        resolve();
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = () => {
          sp.onFrame = () => {};
          el.remove();
        };
      }
    });
    sp.to({ k: reverse ? 0 : 1 }, SPRING.smooth);
  });
}

export const rubber = (over, dim = 300, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
