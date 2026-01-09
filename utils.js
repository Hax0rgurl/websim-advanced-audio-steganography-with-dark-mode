// ...existing code...
export function readAsArrayBuffer(fileOrBlob, sliceLen) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => res(r.result);
    if (sliceLen) {
      const blob = fileOrBlob.slice(0, sliceLen);
      r.readAsArrayBuffer(blob);
    } else {
      r.readAsArrayBuffer(fileOrBlob);
    }
  });
}

export function readAsText(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => res(r.result);
    r.readAsText(blob);
  });
}

export function bufToBlob(u8, mime='application/octet-stream'){ return new Blob([u8], { type: mime }); }
export function bytesToHuman(n){
  if (n < 1024) return `${n} B`;
  const u = ['KB','MB','GB','TB']; let i = -1; do { n/=1024; i++; } while(n>=1024 && i<u.length-1);
  return `${n.toFixed(2)} ${u[i]}`;
}
export function utf8Encode(s){ return new TextEncoder().encode(s); }
export function utf8Decode(u8){ return new TextDecoder().decode(u8); }
export function downloadBlob(blob, name='download'){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
export function getMimeFromName(name){
  const ext = (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  switch (ext) {
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'bmp': return 'image/bmp';
    case 'wav': return 'audio/wav';
    case 'mp3': return 'audio/mpeg';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'apk': return 'application/vnd.android.package-archive';
    default: return 'application/octet-stream';
  }
}
// ...existing code...