// Generate Autofy PNG icons (16/48/128) with no dependencies.
// Design: indigo→violet rounded square with a clean white "A".
// Antialiased via 4x4 supersampling; encoded as RGBA PNG using node:zlib.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- geometry (normalized 0..1) ----------
const APEX = [0.5, 0.2];
const BL = [0.3, 0.8];
const BR = [0.7, 0.8];
const CB_L = [0.3667, 0.6];
const CB_R = [0.6333, 0.6];
const STROKE = 0.072;
const CROSSBAR = 0.058;
const BG_RADIUS = 0.24;

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inA(x, y) {
  return (
    distSeg(x, y, BL[0], BL[1], APEX[0], APEX[1]) <= STROKE ||
    distSeg(x, y, BR[0], BR[1], APEX[0], APEX[1]) <= STROKE ||
    distSeg(x, y, CB_L[0], CB_L[1], CB_R[0], CB_R[1]) <= CROSSBAR
  );
}

function inRoundedSquare(x, y, r) {
  const dx = Math.max(r - x, x - (1 - r), 0);
  const dy = Math.max(r - y, y - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

// indigo (#6366f1) top -> violet-indigo (#4f46e5) bottom
function bg(y) {
  const top = [99, 102, 241];
  const bot = [79, 70, 229];
  return [0, 1, 2].map((i) => Math.round(top[i] + (bot[i] - top[i]) * y));
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
          const nx = (px + (sx + 0.5) / SS) / size;
          const ny = (py + (sy + 0.5) / SS) / size;
          if (!inRoundedSquare(nx, ny, BG_RADIUS)) continue;
          opaque++;
          if (inA(nx, ny)) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            const c = bg(ny);
            r += c[0];
            g += c[1];
            b += c[2];
          }
        }
      }
      const total = SS * SS;
      const i = (py * size + px) * 4;
      if (opaque === 0) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      } else {
        data[i] = Math.round(r / opaque);
        data[i + 1] = Math.round(g / opaque);
        data[i + 2] = Math.round(b / opaque);
        data[i + 3] = Math.round((opaque / total) * 255);
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
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, encodePng(size, render(size)));
  console.log(`icons/icon${size}.png`);
}
console.log('[autofy] icons generated');
