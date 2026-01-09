// ...existing code...
// WAV PCM16 LSB stego
// Footer-like block embedded into sample LSBs:
// [MAGIC "SWAV1"](5B)[mimeLen u16][mime ascii][dataLen u32][data bytes]
const MAGIC = new TextEncoder().encode('SWAV1');

export function sniffWavPcm16(headerBytes) {
  if (headerBytes.length < 44) return false;
  const v = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  if (v.getUint32(0, true) !== 0x46464952) return false; // "RIFF"
  if (v.getUint32(8, true) !== 0x45564157) return false; // "WAVE"
  // find "fmt " chunk
  const fmtChunkId = v.getUint32(12, true);
  if (fmtChunkId !== 0x20746d66) return false; // "fmt "
  const audioFormat = v.getUint16(20, true);
  const bitsPerSample = v.getUint16(34, true);
  return audioFormat === 1 && bitsPerSample === 16;
}

export function estimateWavCapacity(bytes) {
  if (!sniffWavPcm16(bytes)) return 0;
  // samples start around 44 in simple PCM
  const dataOffset = findDataOffset(bytes);
  if (dataOffset < 0) return 0;
  const samples = (bytes.length - dataOffset) / 2; // 16-bit
  return samples; // bits (1 bit per sample)
}

export function encodeWavLSB(wavBytes, payloadBytes, mime = 'application/octet-stream') {
  if (!sniffWavPcm16(wavBytes)) return null;
  const dataOffset = findDataOffset(wavBytes);
  if (dataOffset < 0) return null;
  const header = wavBytes.subarray(0, dataOffset);
  const body = wavBytes.subarray(dataOffset);
  const meta = buildHeader(mime, payloadBytes.length);
  const stream = concatUint8(MAGIC, meta, payloadBytes);
  const bits = bytesToBits(stream);
  const samples = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (bits.length > (body.length / 2)) throw new Error('Payload too large for this audio.');
  // clone buffer
  const out = new Uint8Array(wavBytes.length);
  out.set(wavBytes);
  const outSamples = new DataView(out.buffer, out.byteOffset + dataOffset, body.byteLength);
  let bi = 0;
  for (let i = 0; i < body.byteLength; i += 2) {
    let s = outSamples.getInt16(i, true);
    if (bi < bits.length) {
      s = (s & ~1) | bits[bi++];
      outSamples.setInt16(i, s, true);
    } else break;
  }
  return out;
}

export function decodeWavLSB(wavBytes) {
  if (!sniffWavPcm16(wavBytes)) return null;
  const dataOffset = findDataOffset(wavBytes);
  if (dataOffset < 0) return null;
  const body = wavBytes.subarray(dataOffset);
  const samples = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const bits = [];
  for (let i = 0; i < body.byteLength; i += 2) {
    const s = samples.getInt16(i, true);
    bits.push(s & 1);
  }
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

function findDataOffset(bytes) {
  // naive RIFF chunk walking to find "data"
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = bytes[off] | (bytes[off+1]<<8) | (bytes[off+2]<<16) | (bytes[off+3]<<24);
    const size = bytes[off+4] | (bytes[off+5]<<8) | (bytes[off+6]<<16) | (bytes[off+7]<<24);
    if (id === 0x61746164) return off + 8; // "data"
    off += 8 + size + (size & 1); // align
  }
  return -1;
}

function concatUint8(...arrs){const t=arrs.reduce((a,b)=>a+b.length,0);const o=new Uint8Array(t);let i=0;for(const a of arrs){o.set(a,i);i+=a.length;}return o;}
function bytesToBits(bytes){const bits=new Array(bytes.length*8);let i=0;for(const b of bytes)for(let k=7;k>=0;k--)bits[i++]=(b>>k)&1;return bits;}
function bitsToBytes(bits){const len=Math.floor(bits.length/8);const out=new Uint8Array(len);for(let i=0;i<len;i++){let v=0;for(let k=0;k<8;k++)v=(v<<1)|bits[i*8+k];out[i]=v;}return out;}
function startsWith(buf, prefix){if(buf.length<prefix.length)return false;for(let i=0;i<prefix.length;i++)if(buf[i]!==prefix[i])return false;return true;}
function buildHeader(mime, len){const m=new TextEncoder().encode(mime);const h=new Uint8Array(2+m.length+4);h[0]=(m.length>>8)&255;h[1]=m.length&255;h.set(m,2);h[2+m.length]=(len>>>24)&255;h[3+m.length]=(len>>>16)&255;h[4+m.length]=(len>>>8)&255;h[5+m.length]=len&255;return h;}