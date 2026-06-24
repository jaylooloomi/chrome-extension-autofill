// Generate Autofy PNG icons (16/48/128) with no dependencies.
// Design ("Spark-fill", by the design agent): indigo gradient rounded square,
// two form-field bars, an amber lightning bolt (two triangles), a white spark.
// Antialiased via 4x4 supersampling; encoded as RGBA PNG using node:zlib.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- palette ----------
const BG_TOP = [99, 102, 241]; // #6366f1
const BG_BOT = [67, 56, 202]; // #4338ca
const WHITE = [255, 255, 255];
const INDIGO200 = [199, 210, 254]; // #c7d2fe
const AMBER = [251, 191, 36]; // #fbbf24

// ---------- primitives (normalized 0..1) ----------
function inRoundedRect(px, py, x, y, w, h, r) {
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;
  const dx = px < x0 + r ? x0 + r - px : px > x1 - r ? px - (x1 - r) : 0;
  const dy = py < y0 + r ? y0 + r - py : py > y1 - r ? py - (y1 - r) : 0;
  return dx * dx + dy * dy <= r * r;
}

function inCircle(px, py, cx, cy, r) {
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function lerp(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// ---------- composition (painter's order) ----------
const SHAPES = [
  { test: (x, y) => inRoundedRect(x, y, 0.047, 0.047, 0.906, 0.906, 0.219), color: (_x, y) => lerp(BG_TOP, BG_BOT, y) },
  { test: (x, y) => inRoundedRect(x, y, 0.203, 0.609, 0.594, 0.102, 0.051), color: () => WHITE },
  { test: (x, y) => inRoundedRect(x, y, 0.203, 0.766, 0.391, 0.102, 0.051), color: () => INDIGO200 },
  { test: (x, y) => inPolygon(x, y, [[0.58, 0.16], [0.398, 0.5], [0.586, 0.445]]), color: () => AMBER },
  { test: (x, y) => inPolygon(x, y, [[0.422, 0.617], [0.602, 0.297], [0.414, 0.359]]), color: () => AMBER },
  { test: (x, y) => inCircle(x, y, 0.672, 0.234, 0.043), color: () => WHITE },
];

function colorAt(nx, ny) {
  let c = null;
  for (const s of SHAPES) if (s.test(nx, ny)) c = s.color(nx, ny);
  return c; // null => transparent
}

function render(size) {
  const SS = 4;
  const data = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let opaque = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!c) continue;
          opaque++;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (py * size + px) * 4;
      if (opaque === 0) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      } else {
        data[i] = Math.round(r / opaque);
        data[i + 1] = Math.round(g / opaque);
        data[i + 2] = Math.round(b / opaque);
        data[i + 3] = Math.round((opaque / (SS * SS)) * 255);
      }
    }
  }
  return data;
}

// ---------- PNG encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, encodePng(size, render(size)));
  console.log(`icons/icon${size}.png`);
}
console.log('[autofy] icons generated');
