// ...existing code...
// Footer format appended to any file:
// [MAGIC "SGEN1"](5B)[mimeLen u16][mime][dataLen u32][data][MAGIC_END "SGE1"](4B)
const MAGIC = new TextEncoder().encode('SGEN1');
const MAGIC_END = new TextEncoder().encode('SGE1');

export function genericAppend(carrier, payload, mime = 'application/octet-stream') {
  const m = new TextEncoder().encode(mime);
  const hdr = new Uint8Array(MAGIC.length + 2 + m.length + 4);
  hdr.set(MAGIC, 0);
  const p = MAGIC.length;
  hdr[p] = (m.length >> 8) & 0xFF; hdr[p+1] = m.length & 0xFF;
  hdr.set(m, p+2);
  const lenOff = p + 2 + m.length;
  const len = payload.length >>> 0;
  hdr[lenOff] = (len >>> 24) & 0xFF; hdr[lenOff+1] = (len >>> 16) & 0xFF; hdr[lenOff+2] = (len >>> 8) & 0xFF; hdr[lenOff+3] = len & 0xFF;
  const out = new Uint8Array(carrier.length + hdr.length + payload.length + MAGIC_END.length);
  out.set(carrier, 0);
  out.set(hdr, carrier.length);
  out.set(payload, carrier.length + hdr.length);
  out.set(MAGIC_END, carrier.length + hdr.length + payload.length);
  return out;
}

export function hasGenericFooter(bytes) {
  // quick scan from end
  const endStr = 'SGE1';
  for (let i = bytes.length - 4; i >= Math.max(0, bytes.length - 1024*1024); i--) {
    if (matchAscii(bytes, i, endStr)) return true;
  }
  return false;
}

export function genericExtract(bytes) {
  // scan backward for SGE1, then locate SGEN1 before data
  let endPos = -1;
  for (let i = bytes.length - 4; i >= Math.max(0, bytes.length - 1024*1024); i--) {
    if (matchAscii(bytes, i, 'SGE1')) { endPos = i; break; }
  }
  if (endPos < 0) return null;
  // scan backward to MAGIC
  let magicPos = -1;
  for (let i = endPos - 1; i >= 0; i--) {
    if (matchAscii(bytes, i, 'SGEN1')) { magicPos = i; break; }
  }
  if (magicPos < 0) return null;
  let off = magicPos + 5;
  const mimeLen = (bytes[off]<<8)|bytes[off+1]; off += 2;
  const mime = new TextDecoder().decode(bytes.subarray(off, off+mimeLen)); off += mimeLen;
  const len = (bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|(bytes[off+3]); off += 4;
  const payload = bytes.subarray(off, off + len);
  if (off + len !== endPos) return null;
  return { payload, mime };
}

function matchAscii(bytes, pos, s) {
  if (pos + s.length > bytes.length) return false;
  for (let i = 0; i < s.length; i++) if (bytes[pos+i] !== s.charCodeAt(i)) return false;
  return true;
}
// ...existing code...

