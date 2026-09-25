import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sheetSize, fitDrawing, printTiles, cellSize, suggestGrid, gridLines, neighbour, nextTodo,
} from '../js/geometry.js';

test('sheet presets and orientation', () => {
  assert.deepEqual(sheetSize('A1', true), { w: 841, h: 594 });
  assert.deepEqual(sheetSize('A4', false), { w: 210, h: 297 });
  assert.deepEqual(sheetSize('custom', false, { w: 1000, h: 700 }), { w: 1000, h: 700 });
});

test('fitDrawing reproduces the original A1 layout', () => {
  // original: 3:2 picture, 810 × 540 on 841 × 594
  const d = fitDrawing({ w: 841, h: 594 }, 1.5, 15.5);
  assert.deepEqual([d.w, d.h], [810, 540]);
  assert.equal(d.x, 15.5);
  assert.equal(d.y, 27);
});

test('fitDrawing limited by height for tall images', () => {
  const d = fitDrawing({ w: 841, h: 594 }, 0.5, 10);
  assert.equal(d.h, 574);
  assert.equal(d.w, 287);
});

test('suggestGrid picks the fewest parts that fit the screen', () => {
  const drawing = { w: 810, h: 540 };
  // MacBook Air 15 visible area ≈ 327 × 204 mm
  assert.deepEqual(suggestGrid(drawing, { w: 327, h: 204 }, 10), { cols: 3, rows: 3 });
  // a big monitor needs fewer parts
  const g = suggestGrid(drawing, { w: 597, h: 336 }, 10);
  assert.equal(g.cols * g.rows, 4);
  // every suggested cell really fits
  const c = cellSize(drawing, 3, 3);
  assert.ok(c.w + 20 <= 327 && c.h + 20 <= 204);
});

test('gridLines are measured from the sheet edge', () => {
  const sheet = { w: 841, h: 594 }, d = fitDrawing(sheet, 1.5, 15.5);
  const { xs, ys } = gridLines(sheet, d, 3, 3);
  assert.deepEqual(xs, [15.5, 285.5, 555.5, 825.5]);
  assert.deepEqual(ys, [27, 207, 387, 567]);
});

test('neighbour stays inside the grid', () => {
  assert.equal(neighbour(0, 3, 3, -1, 0), 0);
  assert.equal(neighbour(0, 3, 3, 1, 0), 1);
  assert.equal(neighbour(4, 3, 3, 0, 1), 7);
  assert.equal(neighbour(8, 3, 3, 0, 1), 8);
});

test('nextTodo skips done parts and wraps', () => {
  assert.equal(nextTodo(0, 4, [1]), 2);
  assert.equal(nextTodo(3, 4, [0]), 1);
  assert.equal(nextTodo(2, 3, [0, 1, 2]), 2);
});

test('printTiles covers the drawing with overlapping A4 windows', () => {
  const d = { w: 400, h: 267 }, win = { w: 190, h: 267 };
  const p = printTiles(d, win, 10);
  assert.equal(p.cols, 3); // 180 mm step: 0..190, 180..370, 360..550
  assert.equal(p.rows, 1);
  const last = p.tiles.at(-1);
  assert.ok(last.x + win.w >= d.w);
  assert.equal(printTiles({ w: 190, h: 267 }, win, 10).tiles.length, 1);
});
