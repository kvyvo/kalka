// Small UI pieces: segmented controls with a spring thumb, steppers, toast, confirm, ⌘K palette.
import { animate, SPRING } from './spring.js';
import { t } from './i18n.js';

/** Segmented control: native radios + a thumb that springs to the checked option. */
export function segmented(root, onChange) {
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  root.prepend(thumb);
  let ax = null, aw = null, first = true;
  const place = () => {
    const on = root.querySelector('input:checked');
    const lab = on && on.closest('label');
    if (!lab || lab.hidden || !lab.offsetWidth) { thumb.style.opacity = 0; return; }
    thumb.style.opacity = 1;
    const x = lab.offsetLeft, y = lab.offsetTop, w = lab.offsetWidth, h = lab.offsetHeight;
    thumb.style.height = h + 'px';
    thumb.style.top = y + 'px';
    if (first) { first = false; ax = { value: x, velocity: 0, stop() {} }; aw = { value: w, velocity: 0, stop() {} }; thumb.style.transform = `translateX(${x}px)`; thumb.style.width = w + 'px'; return; }
    // two edges on slightly different springs: the leading edge stretches ahead
    ax = animate(ax, x, (v) => { thumb.style.transform = `translateX(${v}px)`; }, SPRING.ui);
    aw = animate(aw, w, (v) => { thumb.style.width = v + 'px'; }, SPRING.snappy);
  };
  root.addEventListener('change', (e) => { place(); onChange(e.target.value); });
  new ResizeObserver(() => { first = true; place(); }).observe(root);
  return {
    set(value) {
      const r = root.querySelector(`input[value="${value}"]`);
      if (r && !r.checked) r.checked = true;
      place();
    },
  };
}

/** −/+ buttons around a number input; holding repeats. Fires `change` on the input. */
export function steppers(scope = document) {
  scope.querySelectorAll('.stepper').forEach((st) => {
    const input = st.querySelector('input');
    st.querySelectorAll('button[data-step]').forEach((b) => {
      let timer = null;
      const bump = () => {
        const min = Number(input.min || -Infinity), max = Number(input.max || Infinity);
        const v = Math.min(max, Math.max(min, (Number(input.value) || 0) + Number(b.dataset.step)));
        input.value = Math.round(v * 10) / 10;
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

let toastTimer = null;
export function toast(msg, ms = 3800) {
  const el = document.getElementById('toast');
  el.hidden = true; void el.offsetWidth; // restart the entrance spring
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function confirmDialog(text, yes) {
  const d = document.getElementById('confirm');
  document.getElementById('confirmText').textContent = text;
  document.getElementById('confirmYes').textContent = yes;
  d.returnValue = '';
  d.showModal();
  return new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'yes'), { once: true }));
}

/** Fuzzy subsequence score: lower is better, null if no match. */
export function score(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, ''), s = text.toLowerCase();
  if (!q) return 0;
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
  }
  return i === q.length ? gaps + (s.startsWith(q[0]) ? 0 : 1) : null;
}

/** ⌘K palette. `commands()` returns [{title, hint, run}] for the current state. */
export function palette(commands) {
  const dlg = document.getElementById('palette'), input = document.getElementById('palInput'), list = document.getElementById('palList');
  let items = [], sel = 0;
  const render = () => {
    const q = input.value.trim();
    const all = commands(q);
    items = all.map((c) => ({ c, s: c.always ? -1 : score(q, c.title) })).filter((x) => x.s !== null).sort((a, b) => a.s - b.s).map((x) => x.c);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map((c, i) => `<li role="option" id="pal${i}" aria-selected="${i === sel}"><span>${c.title}</span>${c.hint ? `<small>${c.hint}</small>` : ''}</li>`).join('')
      : `<li class="empty">${t('cmdNothing')}</li>`;
    input.setAttribute('aria-activedescendant', items.length ? `pal${sel}` : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const c = items[i]; if (!c) return; dlg.close(); c.run(); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[role=option]'); if (li) run(Number(li.id.slice(3))); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return {
    open() {
      input.value = ''; input.placeholder = t('palPh'); sel = 0;
      render(); dlg.showModal(); input.focus();
    },
  };
}
