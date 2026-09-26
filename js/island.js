import { SPRING } from './spring.js';
import { Springs, morph, swap } from './motion.js';
import { score } from './ui.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createIsland({ commands, onIdleClick }) {
  const dlg = $('island'), shape = $('islShape'), live = $('live');
  const m = morph(shape, {
    idle: { layer: $('islIdle') },
    busy: { layer: $('islBusy') },
    done: { layer: $('islDone') },
    toast: { layer: $('islToast') },
    drop: { layer: $('islDrop'), radius: 30 },
    palette: { layer: $('islPal'), radius: 22, light: 1, width: () => Math.min(560, innerWidth - 24) },
    confirm: { layer: $('islConfirm'), radius: 24, light: 1, width: () => Math.min(400, innerWidth - 24) },
  });
  let timer = null, away = false, pendingConfirm = null;

  const modal = (on) => {
    if (dlg.open && dlg.matches(':modal') === on) return;
    if (dlg.open) dlg.close();
    on ? dlg.showModal() : dlg.show();
  };
  const go = (state) => {
    clearTimeout(timer);
    dlg.classList.toggle('away', away && (state === 'idle'));
    m.to(state);
  };
  function idle() {
    modal(false);
    go('idle');
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dismiss(); });
  function dismiss() {
    if (m.state === 'confirm') answer(false);
    else if (m.state === 'palette') idle();
  }
  $('islIdle').addEventListener('click', () => onIdleClick?.());

  const ring = $('islRingFg');
  function summary(text, done = 0, total = 0) {
    swap($('islSummary'), text);
    const f = total ? done / total : 0;
    ring.style.strokeDasharray = `${f * 100} 100`;
    $('islRing').classList.toggle('full', total > 0 && done === total);
    if (m.state === 'idle') m.to('idle');
  }

  let busyCount = 0;
  function busy() {
    busyCount++;
    if (m.state === 'palette' || m.state === 'confirm') return;
    modal(false);
    dlg.classList.remove('away');
    go('busy');
  }
  function done(msg, kind = 'ok') {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount || m.state !== 'busy') { if (msg) toast(msg, kind); return; }
    go('done');
    const path = $('islCheck');
    path.animate?.([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 360, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    timer = setTimeout(() => (msg ? toast(msg, kind) : idle()), 700);
  }

  function toast(msg, kind = 'ok', ms) {
    if (m.state === 'palette' || m.state === 'confirm') modal(false);
    dlg.classList.remove('away');
    $('toastIcon').dataset.kind = kind;
    $('toastText').textContent = msg;
    live.textContent = msg;
    go('toast');
    timer = setTimeout(idle, ms ?? Math.min(8000, 2400 + msg.length * 45));
  }
  $('islToast').addEventListener('click', idle);

  function drop(on) {
    if (on && m.state !== 'drop') { modal(false); dlg.classList.remove('away'); go('drop'); }
    else if (!on && m.state === 'drop') idle();
  }

  function confirm(text, yes) {
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yes;
    modal(true);
    go('confirm');
    $('islConfirm').querySelector('button[value=no]').focus();
    return new Promise((resolve) => { pendingConfirm = resolve; });
  }
  function answer(yes) {
    const r = pendingConfirm;
    pendingConfirm = null;
    idle();
    r?.(yes);
  }
  $('islConfirm').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) answer(b.value === 'yes');
  });

  const input = $('palInput'), list = $('palList'), hi = $('palHi');
  let items = [], sel = 0;
  const hiSp = new Springs({ y: 0, h: 0, o: 0 }, ({ y, h, o }) => {
    hi.style.transform = `translateY(${y}px)`;
    hi.style.height = `${h}px`;
    hi.style.opacity = o;
  });
  function moveHi(animated = true) {
    const li = list.children[sel];
    if (!li || !items.length) { hiSp.to({ o: 0 }, SPRING.quick); return; }
    const vals = { y: li.offsetTop, h: li.offsetHeight, o: 1 };
    animated ? hiSp.to(vals, { y: SPRING.ui, h: SPRING.ui, o: SPRING.quick }) : hiSp.set(vals);
    li.scrollIntoView?.({ block: 'nearest' });
  }
  function render() {
    const q = input.value.trim();
    items = commands(q).map((c) => ({ c, s: c.always ? -1 : score(q, c.title) }))
      .filter((x) => x.s !== null).sort((a, b) => a.s - b.s).map((x) => x.c);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map((c, i) => `<li role="option" id="pal${i}" aria-selected="${i === sel}"><span>${c.title}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ''}</li>`).join('')
      : `<li class="empty">${t('cmdNothing')}</li>`;
    input.setAttribute('aria-activedescendant', items.length ? `pal${sel}` : '');
    moveHi(false);
    if (m.state === 'palette') m.to('palette');
  }
  function select(i) {
    sel = Math.max(0, Math.min(items.length - 1, i));
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === sel)));
    input.setAttribute('aria-activedescendant', `pal${sel}`);
    moveHi();
  }
  function run(i) {
    const c = items[i];
    if (!c) return;
    modal(false);
    const res = c.run();
    if (m.state !== 'palette') return;
    if (c.toast !== false) toast(typeof res === 'string' ? res : c.title, 'ok', 1600);
    else idle();
  }
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { select(sel + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { select(sel - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
  });
  list.addEventListener('pointermove', (e) => { const li = e.target.closest('li[role=option]'); if (li && Number(li.id.slice(3)) !== sel) select(Number(li.id.slice(3))); });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[role=option]'); if (li) run(Number(li.id.slice(3))); });
  function palette() {
    input.value = '';
    input.placeholder = t('palPh');
    sel = 0;
    modal(true);
    dlg.classList.remove('away');
    render();
    go('palette');
    input.focus();
  }

  dlg.show();
  m.to('idle');
  return {
    summary, busy, done, toast, drop, confirm, palette, idle,
    get state() { return m.state; },
    away(on) { away = on; dlg.classList.toggle('away', on && m.state === 'idle'); },
  };
}
