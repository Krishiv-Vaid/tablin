/**
 * Renders the Tablin toolbar icons (16/32/48/128 px PNG) procedurally, with no
 * image dependencies: a tiny anti-aliased rasterizer + PNG encoder.
 * Run: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { crc32 } from './lib/crc32.mjs';

const OUT = new URL('../public/icons/', import.meta.url);
const SIZES = [16, 32, 48, 128];
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const C = {
  outline: hex('#8A4316'),
  body: hex('#FF9F4A'),
  shade: hex('#EE7F2C'),
  belly: hex('#FFD5AE'),
  white: [255, 255, 255],
  ink: hex('#2A1D16'),
  cheek: hex('#FF6F61'),
};

// Shapes in a 100×100 design space (same proportions as the SVG character).
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function sample(x, y, small) {
  // Painter's order, last hit wins. Returns [r,g,b] or null (transparent).
  let color = null;
  const body = (pad) => inEllipse(x, y, 50, 58, 35 + pad, 32 + pad);
  // feet
  if (inEllipse(x, y, 35, 89, 11.5, 7.5) || inEllipse(x, y, 65, 89, 11.5, 7.5)) color = C.outline;
  if (inEllipse(x, y, 35, 89, 9.2, 5.4) || inEllipse(x, y, 65, 89, 9.2, 5.4)) color = C.shade;
  // tuft
  if (inEllipse(x, y, 55, 20, 7, 10)) color = C.outline;
  if (inEllipse(x, y, 55, 20, 4.8, 7.6)) color = C.shade;
  if (body(2.8)) color = C.outline;
  if (body(0)) color = C.body;
  if (!small && inEllipse(x, y, 50, 74, 20, 12)) color = C.belly;
  // cheeks
  if (!small && (inEllipse(x, y, 27, 67, 6, 3.6) || inEllipse(x, y, 73, 67, 6, 3.6)))
    color = C.cheek;
  // eyes
  const er = small ? [9, 10.5] : [8.2, 9.6];
  for (const ex of [38, 62]) {
    if (inEllipse(x, y, ex, 54, er[0] + 1.6, er[1] + 1.6)) color = C.ink;
    if (inEllipse(x, y, ex, 54, er[0], er[1])) color = C.white;
    if (inEllipse(x, y, ex + 1, 55, small ? 5.6 : 5, small ? 6 : 5.4)) color = C.ink;
    if (!small && inEllipse(x, y, ex + 2.8, 52.2, 1.8, 1.8)) color = C.white;
  }
  // smile
  if (!small) {
    const d = Math.hypot(x - 50, y - 64);
    if (y > 67 && d > 6.2 && d < 8.6 && Math.abs(x - 50) < 6.5) color = C.ink;
  }
  return color;
}

function render(size) {
  const ss = 4; // supersampling
  const small = size <= 16;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // map pixel → design space with a small margin
          const x = ((pxx + (sx + 0.5) / ss) / size) * 104 - 2;
          const y = ((py + (sy + 0.5) / ss) / size) * 104 - 2 + 3;
          const c = sample(x, y, small);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const i = (py * size + pxx) * 4;
      const n = ss * ss;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon-${size}.png`, OUT), png(size, render(size)));
  console.log(`icons/icon-${size}.png`);
}
