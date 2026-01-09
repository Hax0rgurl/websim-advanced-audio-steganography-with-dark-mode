// Steganography core moved from inline script
export const LSB_DEPTH = 1;
export const CHANNELS_USED = 3;
export const PRNG_SEED = 'astg-v1';

// --- Generic Steganography (Any file to Any file via Footer) ---
const MAGIC_GEN = new TextEncoder().encode('SGEN1');
const MAGIC_GEN_END = new TextEncoder().encode('SGE1');

export function genericAppend(carrier, payload, mime = 'application/octet-stream', filename = 'file.bin') {
  const m = new TextEncoder().encode(mime);
  const n = new TextEncoder().encode(filename);
  
  // Header before payload in footer: [MAGIC](5) [mimeLen u16] [mime] [nameLen u16] [name] [dataLen u32]
  // Then [Payload]
  // Then [MAGIC_END](4)
  
  const hdrLen = MAGIC_GEN.length + 2 + m.length + 2 + n.length + 4;
  const hdr = new Uint8Array(hdrLen);
  hdr.set(MAGIC_GEN, 0);
  let p = MAGIC_GEN.length;
  
  hdr[p++] = (m.length >> 8) & 0xFF; 
  hdr[p++] = m.length & 0xFF;
  hdr.set(m, p); p += m.length;
  
  hdr[p++] = (n.length >> 8) & 0xFF;
  hdr[p++] = n.length & 0xFF;
  hdr.set(n, p); p += n.length;
  
  const len = payload.length >>> 0;
  hdr[p++] = (len >>> 24) & 0xFF; 
  hdr[p++] = (len >>> 16) & 0xFF; 
  hdr[p++] = (len >>> 8) & 0xFF; 
  hdr[p++] = len & 0xFF;
  
  const out = new Uint8Array(carrier.length + hdr.length + payload.length + MAGIC_GEN_END.length);
  out.set(carrier, 0);
  out.set(hdr, carrier.length);
  out.set(payload, carrier.length + hdr.length);
  out.set(MAGIC_GEN_END, carrier.length + hdr.length + payload.length);
  return out;
}

export function genericExtract(bytes) {
  // Scan backwards for SGE1
  let endPos = -1;
  const magicEndLen = MAGIC_GEN_END.length;
  // Scan last 1MB or full file
  for (let i = bytes.length - magicEndLen; i >= Math.max(0, bytes.length - 1024*1024); i--) {
    if (matchBytes(bytes, i, MAGIC_GEN_END)) { endPos = i; break; }
  }
  if (endPos < 0) return null;

  // Scan backwards from endPos for SGEN1
  const magicLen = MAGIC_GEN.length;
  // Limit scan distance to 200MB or start of file
  const startScan = Math.max(0, endPos - 1024*1024*200);
  
  // Robust loop: continue searching if a candidate header doesn't validate against endPos
  for (let i = endPos - 1; i >= startScan; i--) {
    if (matchBytes(bytes, i, MAGIC_GEN)) {
      try {
        let p = i + magicLen;
        if (p + 2 > bytes.length) continue;
        
        const mimeLen = (bytes[p] << 8) | bytes[p+1]; p += 2;
        if (p + mimeLen > bytes.length) continue;
        const mime = new TextDecoder().decode(bytes.subarray(p, p+mimeLen)); p += mimeLen;
        
        if (p + 2 > bytes.length) continue;
        const nameLen = (bytes[p] << 8) | bytes[p+1]; p += 2;
        if (p + nameLen > bytes.length) continue;
        const filename = new TextDecoder().decode(bytes.subarray(p, p+nameLen)); p += nameLen;
        
        if (p + 4 > bytes.length) continue;
        // Use unsigned right shift to ensure we treat this as an unsigned 32-bit integer
        const dataLen = ((bytes[p] << 24) | (bytes[p+1] << 16) | (bytes[p+2] << 8) | bytes[p+3]) >>> 0; 
        p += 4;
        
        // Critical integrity check: The payload must end exactly at endPos (where SGE1 starts)
        if (p + dataLen === endPos) {
          // Use slice() to create a deep copy of the payload. 
          // This ensures the blob is not backed by the huge original buffer, preventing memory issues 
          // and ensuring clean blob creation.
          const payload = bytes.slice(p, p + dataLen);
          return { payload, mime, filename };
        }
      } catch (e) {
        // malformed header candidate, continue search
      }
    }
  }
  
  return null;
}

function matchBytes(buf, pos, pattern) {
  if (pos + pattern.length > buf.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (buf[pos+i] !== pattern[i]) return false;
  }
  return true;
}


// --- WAV LSB Steganography ---
const MAGIC_WAV = new TextEncoder().encode('SWAV1');

export function encodeWavLSB(wavBytes, payloadBytes, mime, filename) {
  if (!sniffWavPcm16(wavBytes)) return null;
  const dataOffset = findWavDataOffset(wavBytes);
  if (dataOffset < 0) return null;
  
  // Reuse existing header builder but with our specific needs or just use buildHeader
  // The existing buildHeader in this file uses ASTG. Let's make a local one or adapt.
  // We'll use the generic structure logic but specific magic.
  const header = buildHeader(payloadBytes.length, mime, filename); 
  // Note: buildHeader uses ASTG magic. We will replace ASTG with SWAV1 for consistency if desired, 
  // or just wrap the payload. 
  // Actually, let's use the buildHeader function already in this file, it's robust.
  // It produces: [ASTG][len][mime][name]. 
  
  // We need to embed (Header + Payload) into samples.
  // bits needed:
  const totalBits = (header.length + payloadBytes.length) * 8;
  const bodyLen = wavBytes.length - dataOffset;
  const maxBits = bodyLen / 2; // 16-bit samples, 1 bit per sample
  
  if (totalBits > maxBits) return null; // Capacity exceeded
  
  const out = new Uint8Array(wavBytes); // copy
  const view = new DataView(out.buffer);
  
  let sampleIdx = dataOffset;
  
  // Embed Header
  embedBytesIntoWav(view, sampleIdx, header);
  sampleIdx += header.length * 8 * 2;
  
  // Embed Payload
  embedBytesIntoWav(view, sampleIdx, payloadBytes);
  
  return out;
}

export function decodeWavLSB(wavBytes) {
  if (!sniffWavPcm16(wavBytes)) return null;
  const dataOffset = findWavDataOffset(wavBytes);
  if (dataOffset < 0) return null;
  
  const view = new DataView(wavBytes.buffer);
  
  // Read Header first to know length
  // Header is dynamic length, so we read chunks or until we parse it.
  // Our buildHeader starts with ASTG (4) + Len (4) + ...
  
  // We'll read first 512 bytes worth of bits to parse header
  // 512 bytes = 4096 bits = 4096 samples = 8192 bytes of WAV
  const probeBytes = extractBytesFromWav(view, dataOffset, 512);
  const meta = parseHeader(probeBytes);
  
  if (!meta) return null;
  
  const totalLen = meta.headerTotal + meta.byteLength;
  const allBytes = extractBytesFromWav(view, dataOffset, totalLen);
  const payload = allBytes.subarray(meta.headerTotal, totalLen);
  
  return { payload, mime: meta.mime, filename: meta.name };
}

function embedBytesIntoWav(view, startOffset, data) {
  let off = startOffset;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    for (let bit = 7; bit >= 0; bit--) {
      const b = (byte >> bit) & 1;
      const s = view.getInt16(off, true);
      view.setInt16(off, (s & ~1) | b, true);
      off += 2;
    }
  }
}

function extractBytesFromWav(view, startOffset, count) {
  const out = new Uint8Array(count);
  let off = startOffset;
  const limit = view.byteLength;
  for (let i = 0; i < count; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      if (off >= limit) break;
      const s = view.getInt16(off, true);
      byte |= (s & 1) << bit;
      off += 2;
    }
    out[i] = byte;
  }
  return out;
}

function sniffWavPcm16(bytes) {
  if (bytes.length < 44) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0x46464952) return false; // RIFF
  if (v.getUint32(8, true) !== 0x45564157) return false; // WAVE
  return true; 
  // Simplified check, stegoAudio.js has more rigor but this suffices for "is this a wav?"
}

function findWavDataOffset(bytes) {
  let off = 12;
  const len = bytes.length;
  while (off + 8 <= len) {
    const id = bytes[off] | (bytes[off+1]<<8) | (bytes[off+2]<<16) | (bytes[off+3]<<24);
    const size = bytes[off+4] | (bytes[off+5]<<8) | (bytes[off+6]<<16) | (bytes[off+7]<<24);
    if (id === 0x61746164) return off + 8; // data
    off += 8 + size + (size & 1);
  }
  return -1;
}

export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function gcd(a, b) {
  while (b !== 0) { const t = b; b = a % b; a = t; }
  return a;
}

export function makeCoprimeStride(n) {
  let s = Math.max(1, Math.floor(n * 0.61803398875)) | 1;
  while (gcd(s, n) !== 1) { s = (s + 2) % n || 1; if (s % 2 === 0) s++; }
  return s;
}

export function capacityBytesForDims(w, h) {
  const totalBits = w * h * CHANNELS_USED * LSB_DEPTH;
  return Math.floor(totalBits / 8);
}

function slotToDataIndex(slot) {
  const bitplane = slot % LSB_DEPTH;
  const t = Math.floor(slot / LSB_DEPTH);
  const channel = t % CHANNELS_USED; 
  const pixel = Math.floor(t / CHANNELS_USED);
  const dataIndex = pixel * 4 + channel;
  return { dataIndex, bitplane };
}

export function embedBitsLSB(imageData, bytes, seedStr) {
  const data = imageData.data;
  const pixels = Math.floor(data.length / 4);
  const totalSlots = pixels * CHANNELS_USED * LSB_DEPTH;
  const neededBits = bytes.length * 8;
  if (neededBits > totalSlots) throw new Error('Insufficient capacity to embed data.');

  const seed = fnv1a32(seedStr);
  let idx = seed % totalSlots;
  const stride = makeCoprimeStride(totalSlots);

  let bitIndex = 0;
  while (bitIndex < neededBits) {
    const { dataIndex, bitplane } = slotToDataIndex(idx);
    const byte = bytes[bitIndex >> 3];
    const bit = (byte >> (7 - (bitIndex & 7))) & 1;

    const mask = ~(1 << bitplane) & 0xFF;
    data[dataIndex] = (data[dataIndex] & mask) | (bit << bitplane);

    idx = (idx + stride) % totalSlots;
    bitIndex++;
  }
}

export function extractBitsLSB(imageData, outByteLen, seedStr) {
  const data = imageData.data;
  const pixels = Math.floor(data.length / 4);
  const totalSlots = pixels * CHANNELS_USED * LSB_DEPTH;
  const neededBits = outByteLen * 8;
  if (neededBits > totalSlots) throw new Error('Requested length exceeds image LSB capacity.');

  const out = new Uint8Array(outByteLen);

  const seed = fnv1a32(seedStr);
  let idx = seed % totalSlots;
  const stride = makeCoprimeStride(totalSlots);

  for (let bitIndex = 0; bitIndex < neededBits; bitIndex++) {
    const { dataIndex, bitplane } = slotToDataIndex(idx);
    const bit = (data[dataIndex] >> bitplane) & 1;
    const byteIndex = bitIndex >> 3;
    out[byteIndex] = (out[byteIndex] << 1) | bit;
    idx = (idx + stride) % totalSlots;
  }

  const rem = neededBits & 7;
  if (rem !== 0) {
    out[out.length - 1] <<= (8 - rem);
  }

  return out;
}

export function writeBytesIntoImageDataRGB(imageData, bytes) {
  const data = imageData.data;
  const totalRGBSlots = Math.floor(data.length / 4) * 3;
  if (bytes.length > totalRGBSlots) {
    throw new Error('Insufficient capacity to embed data.');
  }
  for (let i = 0; i < bytes.length; i++) {
    const pixelIndex = Math.floor(i / 3);
    const channelIndex = i % 3; 
    const di = pixelIndex * 4 + channelIndex;
    data[di] = bytes[i];
  }
}

export function readBytesFromImageDataRGB(imageData, length) {
  const data = imageData.data;
  const totalRGBSlots = Math.floor(data.length / 4) * 3;
  if (length > totalRGBSlots) {
    throw new Error('Requested length exceeds image RGB capacity.');
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const pixelIndex = Math.floor(i / 3);
    const channelIndex = i % 3; 
    const di = pixelIndex * 4 + channelIndex;
    out[i] = data[di];
  }
  return out;
}

export function buildHeader(audioBytesLength, mime, filename) {
  const enc = new TextEncoder();
  const mimeB = enc.encode(mime || 'application/octet-stream');
  const nameB = enc.encode(filename || 'audio');
  const mimeLen = Math.min(255, mimeB.length);
  const nameLen = Math.min(255, nameB.length);
  const header = new Uint8Array(4 + 4 + 1 + mimeLen + 1 + nameLen);
  header[0] = 0x41; header[1] = 0x53; header[2] = 0x54; header[3] = 0x47; 
  header[4] = (audioBytesLength >>> 24) & 255;
  header[5] = (audioBytesLength >>> 16) & 255;
  header[6] = (audioBytesLength >>> 8) & 255;
  header[7] = audioBytesLength & 255;
  let o = 8;
  header[o++] = mimeLen;
  header.set(mimeB.slice(0, mimeLen), o); o += mimeLen;
  header[o++] = nameLen;
  header.set(nameB.slice(0, nameLen), o);
  return header;
}

export function parseHeader(bytes) {
  if (bytes.length < 10) return null;
  if (!(bytes[0] === 0x41 && bytes[1] === 0x53 && bytes[2] === 0x54 && bytes[3] === 0x47)) return null;
  const len = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  let o = 8;
  const mimeLen = bytes[o++]; if (bytes.length < o + mimeLen + 1) return null;
  const mime = new TextDecoder().decode(bytes.slice(o, o + mimeLen)); o += mimeLen;
  const nameLen = bytes[o++]; if (bytes.length < o + nameLen) return null;
  const name = new TextDecoder().decode(bytes.slice(o, o + nameLen)); o += nameLen;
  return { byteLength: len, mime, name, headerTotal: o };
}