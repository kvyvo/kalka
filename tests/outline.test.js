import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outline } from '../js/outline.js';

// 40×40 white image with a black 20×20 square in the middle
function square() {
  const w = 40, h = 40, data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) {
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { data, width: w, height: h };
}
const px = (out, x, y, w = 40) => out[(y * w + x) * 4];

test('edges of a filled square become dark lines, inside and outside stay white', () => {
  const out = outline(square(), 50);
  assert.equal(px(out, 20, 20), 255, 'inside of the square is paper');
  assert.equal(px(out, 3, 3), 255, 'background is paper');
  assert.ok(px(out, 10, 20) < 80, 'left edge is a line');
  assert.ok(px(out, 20, 29) < 80, 'bottom edge is a line');
});

test('transparent pixels count as white paper', () => {
  const img = square();
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 0;
  const out = outline(img, 100);
  assert.ok(out.every((v, i) => i % 4 === 3 || v === 255));
});

test('higher strength never removes lines', () => {
  const lo = outline(square(), 10), hi = outline(square(), 90);
  for (let i = 0; i < lo.length; i += 4) assert.ok(hi[i] <= lo[i] + 1);
});
