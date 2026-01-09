// ...existing code...
import { utf8Encode, utf8Decode } from './utils.js';

// Payload block format inside image LSB:
// [MAGIC "SIMG1"](5B) [mimeLen u16][mime ascii][dataLen u32][data bytes]
const MAGIC = new TextEncoder().encode('SIMG1');

export async function estimateImageCapacity(imgUrl) {
  const img = await loadImage(imgUrl);
  return img.width * img.height * 3; // bits in RGB channels
}

export async function encodeImageLSB(imgUrl, payloadBytes, mime = 'application/octet-stream', mode = 'rgb') {
  const img = await loadImage(imgUrl);
  const { ctx, canvas } = makeCanvas(img);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data; // RGBA
  const bitCapacity = canvas.width * canvas.height * (mode === 'blue' ? 1 : 3);
  const meta = buildHeader(mime, payloadBytes.length);
  const bitstream = bytesToBits(concatUint8(MAGIC, meta, payloadBytes));
  if (bitstream.length > bitCapacity) throw new Error('Payload too large for this image.');
  let bi = 0;
  const channels = mode === 'blue' ? [2] : [0,1,2];
  for (let i = 0; i < pixels.length && bi < bitstream.length; i += 4) {
    for (const c of channels) { if (bi < bitstream.length) pixels[i + c] = (pixels[i + c] & 0xFE) | bitstream[bi++]; }
  }
  ctx.putImageData(imgData, 0, 0);
  return await canvasToPngBytes(canvas);
}

export async function decodeImageLSB(imgUrl, mode = 'rgb') {
  const img = await loadImage(imgUrl);
  const { ctx, canvas } = makeCanvas(img);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const bits = [];
  const channels = mode === 'blue' ? [2] : [0,1,2];
  for (let i = 0; i < pixels.length; i += 4) { for (const c of channels) bits.push(pixels[i+c] & 1); }
  const bytes = bitsToBytes(bits);
  if (!startsWith(bytes, MAGIC)) return null;
  let off = MAGIC.length;
  const mimeLen = (bytes[off] << 8) | bytes[off+1]; off += 2;
  const mime = new TextDecoder().decode(bytes.subarray(off, off+mimeLen)); off += mimeLen;
  const len = (bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|(bytes[off+3]); off += 4;
  const payload = bytes.subarray(off, off + len);
  if (payload.length !== len) return null;
  return { payload, mime };
}

function buildHeader(mime, len) {
  const m = new TextEncoder().encode(mime);
  const hdr = new Uint8Array(2 + m.length + 4);
  hdr[0] = (m.length >> 8) & 0xFF; hdr[1] = m.length & 0xFF;
  hdr.set(m, 2);
  hdr[2 + m.length] = (len >>> 24) & 0xFF;
  hdr[3 + m.length] = (len >>> 16) & 0xFF;
  hdr[4 + m.length] = (len >>> 8) & 0xFF;
  hdr[5 + m.length] = len & 0xFF;
  return hdr;
}

function concatUint8(...arrs) {
  const total = arrs.reduce((a,b)=>a+b.length,0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

function bytesToBits(bytes) {
  const bits = new Array(bytes.length * 8);
  let i = 0;
  for (const b of bytes) for (let k = 7; k >= 0; k--) bits[i++] = (b >> k) & 1;
  return bits;
}

function bitsToBytes(bits) {
  const len = Math.floor(bits.length / 8);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (let k = 0; k < 8; k++) v = (v << 1) | bits[i*8 + k];
    out[i] = v;
  }
  return out;
}

function startsWith(buf, prefix) {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.decoding = 'async';
    img.src = url;
  });
}

function makeCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx };
}

function canvasToPngBytes(canvas) {
  return new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}