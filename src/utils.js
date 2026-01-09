// Utilities and UI helpers moved from inline script
export function prettyBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB','MB','GB','TB'];
  let i = -1;
  do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length - 1);
  return bytes.toFixed(2) + ' ' + units[i];
}

export function getImageDimsFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function drawScaledImageToCover(canvas, imageBitmap, scale) {
  const w = Math.ceil(imageBitmap.width * scale);
  const h = Math.ceil(imageBitmap.height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width, imageBitmap.height, 0, 0, w, h);
  return { w, h };
}

export function getMimeFromName(name){
  const ext = (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  switch (ext) {
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'bmp': return 'image/bmp';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'wav': return 'audio/wav';
    case 'mp3': return 'audio/mpeg';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    case 'flac': return 'audio/flac';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'apk': return 'application/vnd.android.package-archive';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    case 'mkv': return 'video/x-matroska';
    default: return 'application/octet-stream';
  }
}