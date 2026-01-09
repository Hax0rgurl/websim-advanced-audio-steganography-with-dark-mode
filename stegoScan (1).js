// Simple binwalk-like signature scan and slice extraction
const signatures = [
  { type: 'PNG', mime: 'image/png', magic: [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A] },
  { type: 'JPEG', mime: 'image/jpeg', magic: [0xFF,0xD8,0xFF] },
  { type: 'GIF', mime: 'image/gif', magicStr: 'GIF8' },
  { type: 'ZIP', mime: 'application/zip', magic: [0x50,0x4B,0x03,0x04] },
  { type: 'PDF', mime: 'application/pdf', magicStr: '%PDF' },
  { type: 'WAV', mime: 'audio/wav', magicStr: 'RIFF' },
  { type: 'MP3', mime: 'audio/mpeg', magicStr: 'ID3' },
  { type: 'GZIP', mime: 'application/gzip', magic: [0x1F,0x8B] }
];

export function scanMagic(bytes) {
  const hits = [];
  for (let i = 0; i < bytes.length; i++) {
    for (const s of signatures) {
      const m = s.magic || strToBytes(s.magicStr);
      if (matchAt(bytes, i, m)) {
        const next = findNext(bytes, i+1);
        hits.push({ type: s.type, mime: s.mime, offset: i, sizeGuess: (next>i?next-i:bytes.length-i) });
      }
    }
  }
  // merge overlapping duplicates (keep earliest of same offset)
  return dedupe(hits);
}

export function extractSlice(bytes, hit) {
  const end = Math.min(bytes.length, hit.offset + hit.sizeGuess);
  return bytes.subarray(hit.offset, end);
}

function matchAt(buf, pos, magic){ if (pos+magic.length>buf.length) return false; for(let k=0;k<magic.length;k++) if (buf[pos+k]!==magic[k]) return false; return true; }
function strToBytes(s){ return new TextEncoder().encode(s); }
function findNext(buf, start){
  let min = buf.length;
  for (let i = start; i < buf.length; i++) {
    for (const s of signatures) {
      const m = s.magic || strToBytes(s.magicStr);
      if (matchAt(buf, i, m)) { min = Math.min(min, i); break; }
    }
    if (min !== buf.length) break;
  }
  return min;
}
function dedupe(hits){
  const seen = new Set(); const out=[];
  for (const h of hits) { const k = `${h.type}@${h.offset}`; if (!seen.has(k)) { seen.add(k); out.push(h); } }
  return out.sort((a,b)=>a.offset-b.offset);
}