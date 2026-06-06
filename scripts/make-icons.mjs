// PWA アイコンを Node 標準ライブラリのみで生成する(実行時依存なし)。
// 使い方: node scripts/make-icons.mjs
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---- 小さな PNG エンコーダ(RGBA, 8bit) ----
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
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // フィルタ 0 を各走査線の先頭に付ける
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 描画ヘルパ ----
function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // 単純なアルファ合成
    const ia = a / 255;
    buf[i] = buf[i] * (1 - ia) + r * ia;
    buf[i + 1] = buf[i + 1] * (1 - ia) + g * ia;
    buf[i + 2] = buf[i + 2] * (1 - ia) + b * ia;
    buf[i + 3] = Math.max(buf[i + 3], a);
  };
  const rect = (x0, y0, w, h, r, g, b, a) => {
    x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b, a);
  };
  const rrect = (x0, y0, w, h, rad, r, g, b, a) => {
    x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.min(x - x0, x0 + w - 1 - x);
      const dy = Math.min(y - y0, y0 + h - 1 - y);
      if (dx < rad && dy < rad) {
        const d = Math.hypot(rad - dx, rad - dy);
        if (d > rad) continue;
      }
      set(x, y, r, g, b, a);
    }
  };
  const circle = (cx, cy, rad, r, g, b, a) => {
    cx = Math.round(cx); cy = Math.round(cy); rad = Math.round(rad);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++)
      if (Math.hypot(x - cx, y - cy) <= rad) set(x, y, r, g, b, a);
  };

  const S = size;
  // 背景(青の角丸)
  rrect(0, 0, S, S, S * 0.22, 43, 108, 176, 255);
  // 線路(下部)
  rect(0, S * 0.78, S, S * 0.04, 184, 199, 217, 255);
  // 電車のからだ(白〜黄)
  const bx = S * 0.18, by = S * 0.30, bw = S * 0.64, bh = S * 0.40;
  rrect(bx, by, bw, bh, S * 0.10, 255, 243, 191, 255);
  // 屋根の帯
  rrect(bx, by, bw, bh * 0.30, S * 0.10, 246, 201, 69, 255);
  // 窓 2つ
  rrect(bx + bw * 0.12, by + bh * 0.40, bw * 0.28, bh * 0.34, S * 0.04, 43, 108, 176, 255);
  rrect(bx + bw * 0.60, by + bh * 0.40, bw * 0.28, bh * 0.34, S * 0.04, 43, 108, 176, 255);
  // 車輪
  circle(bx + bw * 0.25, by + bh + S * 0.02, S * 0.06, 31, 58, 95, 255);
  circle(bx + bw * 0.75, by + bh + S * 0.02, S * 0.06, 31, 58, 95, 255);
  // プラス記号(中央上)
  const px = S * 0.5, py = S * 0.16, t = S * 0.035, l = S * 0.11;
  rect(px - t, py - l, t * 2, l * 2, 255, 122, 89, 255);
  rect(px - l, py - t, l * 2, t * 2, 255, 122, 89, 255);

  return encodePng(S, S, buf);
}

mkdirSync('icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`icons/icon-${size}.png`, makeIcon(size));
  console.log(`icons/icon-${size}.png written`);
}
