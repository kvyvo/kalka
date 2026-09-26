export const fromApple = (duration = 0.5, bounce = 0) => ({
  stiffness: (2 * Math.PI / duration) ** 2,
  damping: 4 * Math.PI * (1 - bounce) / duration,
});

export const SPRING = {
  quick: fromApple(0.3, 0),
  ui: fromApple(0.35, 0.1),
  smooth: fromApple(0.5, 0),
  snappy: fromApple(0.5, 0.15),
};

export function spring({ stiffness = 158, damping = 25, velocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness), z = damping / (2 * w0), v0 = -velocity;
  let x;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z), B = (v0 + z * w0) / wd;
    x = (t) => Math.exp(-z * w0 * t) * (Math.cos(wd * t) + B * Math.sin(wd * t));
  } else if (Math.abs(z - 1) < 1e-9) {
    x = (t) => Math.exp(-w0 * t) * (1 + (v0 + w0) * t);
  } else {
    const s = w0 * Math.sqrt(z * z - 1), r1 = -z * w0 + s, r2 = -z * w0 - s;
    const c1 = (v0 - r2) / (r1 - r2), c2 = 1 - c1;
    x = (t) => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  return (t) => (t <= 0 ? 0 : 1 - x(t));
}

export function settleTime(p, eps = 1e-3) {
  let last = 0;
  for (let t = 0; t < 10; t += 1 / 240) if (Math.abs(1 - p(t)) > eps) last = t;
  return last + 1 / 240;
}

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

export function animate(from, to, onUpdate, opts = SPRING.smooth) {
  let start = from, v = 0;
  if (typeof from === 'object' && from) { start = from.value; v = from.velocity; from.stop(); }
  const dist = to - start;
  if (reduce.matches || Math.abs(dist) < 1e-6) {
    onUpdate(to);
    return { stop() {}, value: to, velocity: 0 };
  }
  const p = spring({ ...opts, velocity: v / dist }), T = settleTime(p), t0 = performance.now();
  let raf = 0, cur = start;
  const frame = (now) => {
    const t = (now - t0) / 1000;
    cur = t >= T ? to : start + dist * p(t);
    onUpdate(cur);
    if (t < T) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    stop: () => cancelAnimationFrame(raf),
    get value() { return cur; },
    get velocity() {
      const t = (performance.now() - t0) / 1000;
      return t >= T ? 0 : dist * (p(t + 1e-3) - p(t)) / 1e-3;
    },
  };
}
