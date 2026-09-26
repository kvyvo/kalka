import { SPRING, fromApple } from './spring.js';
import { Springs, rubber } from './motion.js';

const LEAD = fromApple(0.3, 0.08);
const TRAIL = fromApple(0.52, 0.04);

const edges = (moveRight) => (moveRight ? { r: LEAD, l: TRAIL } : { l: LEAD, r: TRAIL });

export function segmented(root, onChange) {
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  root.prepend(thumb);
  const sp = new Springs({ l: 0, r: 0 }, ({ l, r }) => {
    thumb.style.transform = `translateX(${l}px)`;
    thumb.style.width = `${Math.max(0, r - l)}px`;
  });
  let placed = false;
  const place = (animated = true) => {
    const lab = root.querySelector('input:checked')?.closest('label');
    if (!lab || lab.hidden || !lab.offsetWidth) { thumb.style.opacity = 0; placed = false; return; }
    thumb.style.opacity = 1;
    thumb.style.top = `${lab.offsetTop}px`;
    thumb.style.height = `${lab.offsetHeight}px`;
    const l = lab.offsetLeft, r = l + lab.offsetWidth;
    if (!placed || !animated) { sp.set({ l, r }); placed = true; return; }
    sp.to({ l, r }, edges(l > sp.target('l')));
  };
  root.addEventListener('change', (e) => { place(); onChange(e.target.value); });
  root.addEventListener('pointerdown', () => thumb.classList.add('pressed'));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => root.addEventListener(ev, () => thumb.classList.remove('pressed')));
  new ResizeObserver(() => place(false)).observe(root);
  return {
    set(value) {
      const radio = root.querySelector(`input[value="${value}"]`);
      if (radio && !radio.checked) radio.checked = true;
      place();
    },
    place,
  };
}

export function makeSwitch(input, onChange) {
  const track = input.nextElementSibling, knob = track.querySelector('i');
  const geo = () => ({ W: track.offsetWidth || 46, H: track.offsetHeight || 28 });
  let pressed = false;
  const target = () => {
    const { W, H } = geo(), pad = 2, K = H - 2 * pad, grow = pressed ? 7 : 0;
    const l = input.checked ? W - pad - K - grow : pad;
    return { l, r: l + K + grow };
  };
  const sp = new Springs(target(), ({ l, r }) => {
    knob.style.transform = `translateX(${l}px)`;
    knob.style.width = `${Math.max(0, r - l)}px`;
  });
  const label = input.closest('label');
  label.addEventListener('pointerdown', () => { pressed = true; sp.to(target(), SPRING.quick); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => label.addEventListener(ev, () => {
    if (!pressed) return;
    pressed = false;
    sp.to(target(), SPRING.quick);
  }));
  input.addEventListener('change', () => { sp.to(target(), edges(input.checked)); onChange?.(input.checked); });
  new ResizeObserver(() => sp.set(target())).observe(track);
  sp.set(target());
  return {
    set(on) {
      if (input.checked === !!on) return;
      input.checked = !!on;
      sp.to(target(), edges(input.checked));
    },
  };
}

export function stretchSlider(el, { min = 0, max = 100, step = 1, value = min, format = (v) => v, onInput, onChange }) {
  const body = el.querySelector('.sl-body'), fill = el.querySelector('.sl-fill'), out = el.querySelector('.sl-val');
  const frac = (v) => (v - min) / (max - min);
  const snap = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  let v = snap(value);
  const sp = new Springs({ f: frac(v), sl: 0, sr: 0 }, ({ f, sl, sr }) => {
    body.style.left = `${-sl}px`;
    body.style.right = `${-sr}px`;
    const squeeze = Math.min(6, (sl + sr) * 0.12);
    body.style.top = body.style.bottom = `${squeeze}px`;
    fill.style.width = `${Math.min(1, Math.max(0, f)) * 100}%`;
  });
  const show = () => {
    out.textContent = format(v);
    el.setAttribute('aria-valuenow', v);
    el.setAttribute('aria-valuetext', format(v));
  };
  el.setAttribute('aria-valuemin', min);
  el.setAttribute('aria-valuemax', max);
  show();

  let drag = null;
  const fromX = (x, first) => {
    const r = el.getBoundingClientRect(), raw = (x - r.left) / r.width;
    const over = raw > 1 ? (raw - 1) * r.width : raw < 0 ? raw * r.width : 0;
    const nv = snap(min + Math.min(1, Math.max(0, raw)) * (max - min));
    const vals = { f: Math.min(1, Math.max(0, raw)), sr: over > 0 ? rubber(over, r.width, 0.35) : 0, sl: over < 0 ? rubber(-over, r.width, 0.35) : 0 };
    if (first) sp.to(vals, SPRING.quick); else sp.set(vals);
    if (nv !== v) { v = nv; show(); onInput?.(v); }
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    el.setPointerCapture(e.pointerId);
    drag = e.pointerId;
    el.classList.add('active');
    fromX(e.clientX, true);
  });
  el.addEventListener('pointermove', (e) => { if (drag === e.pointerId) fromX(e.clientX, false); });
  const end = (e) => {
    if (drag !== e.pointerId) return;
    drag = null;
    el.classList.remove('active');
    sp.to({ f: frac(v), sl: 0, sr: 0 }, SPRING.snappy);
    onChange?.(v);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const big = (max - min) / 10;
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }[e.key];
    let nv = v;
    if (d !== undefined) nv = snap(v + d * (e.shiftKey ? 10 : 1));
    else if (e.key === 'Home') nv = min;
    else if (e.key === 'End') nv = max;
    else return;
    e.preventDefault();
    if (nv === v) {
      const side = d > 0 || e.key === 'End' ? 'sr' : 'sl';
      sp.to({ [side]: 10 }, SPRING.quick);
      setTimeout(() => sp.to({ [side]: 0 }, SPRING.snappy), 90);
      return;
    }
    v = nv; show(); sp.to({ f: frac(v) }, SPRING.ui);
    onInput?.(v); onChange?.(v);
  });
  return {
    get value() { return v; },
    set(nv) { nv = snap(nv); if (nv === v) return; v = nv; show(); sp.to({ f: frac(v) }, SPRING.ui); },
    refresh: show,
  };
}

export function steppers(scope = document) {
  scope.querySelectorAll('.stepper').forEach((st) => {
    const input = st.querySelector('input');
    st.querySelectorAll('button[data-step]').forEach((b) => {
      let timer = null;
      const bump = () => {
        const min = Number(input.min || -Infinity), max = Number(input.max || Infinity);
        const v = Math.min(max, Math.max(min, (Number(input.value) || 0) + Number(b.dataset.step)));
        if (String(v) === input.value) { input.animate?.([{ translate: `${Math.sign(b.dataset.step) * 3}px 0` }, { translate: '0 0' }], { duration: 180 }); return; }
        input.value = Math.round(v * 10) / 10;
        input.animate?.([{ opacity: 0.2, translate: `0 ${Math.sign(b.dataset.step) * -6}px`, filter: 'blur(3px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const stop = () => { clearTimeout(timer); timer = null; };
      b.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        bump();
        const again = (d) => { timer = setTimeout(() => { bump(); again(60); }, d); };
        again(400);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(); } });
    });
  });
}

export function score(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, ''), s = text.toLowerCase();
  if (!q) return 0;
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
  }
  return i === q.length ? gaps + (s.startsWith(q[0]) ? 0 : 1) : null;
}
