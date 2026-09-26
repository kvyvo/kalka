import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const icon = await readFile(new URL('../assets/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const s of [180, 192, 512]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<body style="margin:0">${icon.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`);
  await p.screenshot({ path: new URL(`../assets/icon-${s}.png`, import.meta.url).pathname, omitBackground: true });
}
await b.close();
