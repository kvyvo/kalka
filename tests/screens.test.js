import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, baseScale, signature, screenMm, SCREENS } from '../js/screens.js';
import { spring, settleTime, fromApple } from '../js/spring.js';

test('MacBook Air 13 default mode is recognised', () => {
  const c = candidates(1470, 956, 2);
  assert.deepEqual(c.map((s) => s.id), ['mba13m2']);
  const k = baseScale(c[0], 1470, 956);
  assert.ok(Math.abs(85.6 * k.x - 433.4) < 1.5);
});

test('short side trimmed by a few px still matches, scale uses the real mode', () => {
  const [a] = candidates(1710, 1107, 2).filter((s) => s.id === 'mba15');
  assert.ok(a);
  const k1 = baseScale(a, 1710, 1107), k2 = baseScale(a, 1710, 1112);
  assert.equal(k1.y, k2.y);
});

test('ambiguous signature returns several candidates', () => {
  const ids = candidates(1710, 1112, 2).map((s) => s.id);
  assert.deepEqual(ids, ['mba15', 'mba13m2'], 'default mode of MBA 15 wins over MBA 13 "more space"');
});

test('iPad works in both orientations', () => {
  const [ipad] = candidates(1180, 820, 2);
  assert.equal(ipad.id, 'ipad11');
  const land = baseScale(ipad, 1180, 820), port = baseScale(ipad, 820, 1180);
  assert.ok(Math.abs(land.x - port.y) < 1e-9);
  const s = screenMm(1180, 820, land);
  assert.ok(Math.abs(s.w - 227.1) < 0.5 && Math.abs(s.h - 157.8) < 0.5);
});

test('diagonal fallback: 15.6″ 1366×768 laptop', () => {
  const k = baseScale({ diag: 15.6 }, 1366, 768);
  assert.ok(Math.abs(85.6 * k.x - 340) < 7);
});

test('unknown screen falls back to CSS 96 dpi', () => {
  assert.equal(candidates(1366, 768, 1).length, 0);
  assert.ok(Math.abs(baseScale(null, 1366, 768).x - 3.7795) < 1e-3);
});

test('signature ignores orientation', () => {
  assert.equal(signature(820, 1180, 2), signature(1180, 820, 2));
});

test('every screen has sane physical size', () => {
  for (const s of SCREENS) assert.ok(s.w > 100 && s.w < 400 && s.h > 100 && s.h < 400, s.id);
});

test('spring: no overshoot at bounce 0, overshoot at 0.3, settles', () => {
  const p0 = spring(fromApple(0.5, 0));
  let max0 = 0;
  for (let t = 0; t < 2; t += 0.005) max0 = Math.max(max0, p0(t));
  assert.ok(max0 <= 1 + 1e-6);
  const p3 = spring(fromApple(0.5, 0.3));
  let max3 = 0;
  for (let t = 0; t < 2; t += 0.005) max3 = Math.max(max3, p3(t));
  assert.ok(max3 > 1.01);
  assert.equal(p0(0), 0);
  const T = settleTime(p0);
  assert.ok(T > 0.6 && T < 0.85);
});

test('spring keeps initial velocity', () => {
  const p = spring({ ...fromApple(0.5, 0), velocity: 4 });
  const v = (p(1e-4) - p(0)) / 1e-4;
  assert.ok(Math.abs(v - 4) < 0.1);
});
