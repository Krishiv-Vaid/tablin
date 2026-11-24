/**
 * Zips dist/ into release/tablin-<version>.zip (Chrome Web Store / sharing).
 * Dependency-free ZIP writer (deflate via node:zlib).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from './lib/crc32.mjs';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const DOS_TIME = 0; // fixed timestamps → reproducible archives
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const locals = [];
const centrals = [];
let offset = 0;

for (const file of walk(dist).sort()) {
  const name = Buffer.from(relative(dist, file).split('\\').join('/'), 'utf8');
  if (name.toString().endsWith('.DS_Store')) continue;
  const data = readFileSync(file);
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + compressed.length;
}

const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
const count = centrals.length / 2;
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `tablin-${version}.zip`);
writeFileSync(out, Buffer.concat([...locals, centralBuf, end]));
console.log(
  `✓ ${relative(root, out)} (${count} files, ${(statSync(out).size / 1024).toFixed(1)} KB)`,
);
