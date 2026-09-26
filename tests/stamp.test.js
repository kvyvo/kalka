import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stampJs, stampHtml, stampSw, stampBuild } from '../tools/stamp.mjs';

// A browser that mixes modules from two deploys breaks on the first import that changed
// ("Importing binding name 'toast' is not found" in Safari). Every relative URL must be versioned.
const REL = /(?:from\s+|import\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

test('every relative module URL in js/ gets the version', async () => {
  const dir = new URL('../js/', import.meta.url);
  let n = 0;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.js'))) {
    const out = stampJs(await readFile(new URL(f, dir), 'utf8'), 'v1');
    for (const [, spec] of out.matchAll(REL)) { n++; assert.match(spec, /\?v=v1$/, `${f}: ${spec}`); }
  }
  assert.ok(n > 20, `found only ${n} imports`);
});

test('index.html and the service worker point at versioned files', async () => {
  const html = stampHtml(await readFile(new URL('../index.html', import.meta.url), 'utf8'), 'v1');
  for (const [, u] of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) assert.match(u, /\?v=v1$/);
  const sw = stampSw(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), 'v1');
  assert.match(sw, /const VERSION = 'v1'/);
  for (const [, u] of sw.matchAll(/'((?:js|css)\/[^']+)'/g)) assert.match(u, /\?v=v1$/);
});

test('the page and app.js carry the same build', async () => {
  const html = stampHtml(await readFile(new URL('../index.html', import.meta.url), 'utf8'), 'v1');
  const app = stampBuild(await readFile(new URL('../js/app.js', import.meta.url), 'utf8'), 'v1');
  assert.match(html, /<meta name="build" content="v1">/);
  assert.match(app, /const BUILD = 'v1';/);
});
