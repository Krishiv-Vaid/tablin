/**
 * Sanity-checks dist/ so a broken build never gets loaded into Chrome:
 * every file the manifest references exists, the content script is a classic
 * script (no ES module syntax), and host permissions match the content scripts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const manifestPath = join(dist, 'manifest.json');
if (!existsSync(manifestPath)) fail('dist/manifest.json missing');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const files = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((c) => c.js),
];
for (const f of files) if (!existsSync(join(dist, f))) fail(`missing ${f}`);

const content = readFileSync(join(dist, 'content-script.js'), 'utf8');
if (/^\s*(import|export)\s/m.test(content)) fail('content-script.js contains ES module syntax');

for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
  const html = readFileSync(join(dist, page), 'utf8');
  for (const [, src] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(src)) fail(`${page} references remote resource ${src}`);
    const resolved = join(dist, page, '..', src);
    if (!existsSync(resolved)) fail(`${page} references missing ${src}`);
  }
}

const hosts = new Set(manifest.host_permissions);
for (const m of manifest.content_scripts.flatMap((c) => c.matches)) {
  if (!hosts.has(m)) fail(`content script match ${m} not in host_permissions`);
}
console.log(`✓ dist verified (${files.length} manifest files, Tablin ${manifest.version})`);
