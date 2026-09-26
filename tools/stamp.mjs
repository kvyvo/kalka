// Stamps a deploy with its version: every module, stylesheet and worker URL gets ?v=<version>.
// Without it a browser can mix modules from two deploys (one from its cache, one fresh)
// and an import of a name that only the old file had breaks the whole page.
//   node tools/stamp.mjs <site dir> <version>
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Relative .js specifiers in import/export/dynamic import/new URL get the version. */
export const stampJs = (s, v) => s
  .replace(/(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, `$1$2?v=${v}$3`)
  .replace(/(import\(\s*['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, `$1$2?v=${v}$3`)
  .replace(/(new URL\(\s*['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, `$1$2?v=${v}$3`);
export const stampHtml = (s, v) => s
  .replace(/((?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(")/g, `$1$2?v=${v}$3`)
  .replace(/<meta name="build" content="[^"]*">/, `<meta name="build" content="${v}">`);
/** app.js knows its build and compares it with the page's. */
export const stampBuild = (s, v) => s.replace(/const BUILD = '[^']*';/, `const BUILD = '${v}';`);
export const stampSw = (s, v) => s
  .replace(/const VERSION = '[^']*'/, `const VERSION = '${v}'`)
  .replace(/'((?:js|css)\/[^'?]+\.(?:js|css))'/g, `'$1?v=${v}'`);

export async function stamp(dir, v) {
  for (const f of await readdir(join(dir, 'js'))) {
    if (f.endsWith('.js')) { const p = join(dir, 'js', f); await writeFile(p, stampBuild(stampJs(await readFile(p, 'utf8'), v), v)); }
  }
  await writeFile(join(dir, 'index.html'), stampHtml(await readFile(join(dir, 'index.html'), 'utf8'), v));
  await writeFile(join(dir, 'sw.js'), stampSw(await readFile(join(dir, 'sw.js'), 'utf8'), v));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, v] = process.argv.slice(2);
  if (!dir || !v) { console.error('usage: node tools/stamp.mjs <dir> <version>'); process.exit(1); }
  await stamp(dir, v);
  console.log(`stamped ${dir} with ${v}`);
}
