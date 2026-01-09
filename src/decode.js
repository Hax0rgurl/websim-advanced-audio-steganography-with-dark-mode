import { openPlayerModal, updatePlayerModalContent } from "player";
import { extractBitsLSB, genericExtract, decodeWavLSB, parseHeader, PRNG_SEED, capacityBytesForDims } from "stego";
import { getMimeFromName } from "utils";

// Refs
const stegoInput = document.getElementById('stegoInput');
const decodeBtn = document.getElementById('decodeBtn');
const statusElement = document.getElementById('status');

export function initDecode() {
  stegoInput.addEventListener('change', () => {
    const file = stegoInput.files[0];
    if (file) {
      const label = stegoInput.closest('.drop-wrap')?.querySelector('.drop-main');
      if (label) label.textContent = file.name;
    }
  });

  decodeBtn.addEventListener('click', decodeFileHandler);
}

// Logic to decode data from a Blob (File Input or Gallery)
export async function decodeStegoBlob(blob) {
  let result = null;

  // 1. Try Image LSB if it looks like an image
  if (blob.type.startsWith('image/')) {
    try {
      result = await tryDecodeImageLSB(blob);
    } catch (e) { console.log('Image LSB check failed', e); }
  }
  
  // Refine result mime type if generic
  if (result && (result.mimeType === 'application/octet-stream' || !result.mimeType)) {
    result.mimeType = getMimeFromName(result.filename);
  }

  // 2. Try WAV LSB if it looks like audio/wav
  if (!result && (blob.type === 'audio/wav' || blob.name?.endsWith('.wav'))) {
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const res = decodeWavLSB(bytes);
      if (res) {
         const plBlob = new Blob([res.payload], { type: res.mime });
         result = {
           url: URL.createObjectURL(plBlob),
           filename: res.filename || 'extracted.bin',
           mimeType: res.mime,
           size: res.payload.length
         };
      }
    } catch (e) { console.log('Wav check failed', e); }
  }

  // 3. Try Generic Footer (Append)
  if (!result) {
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const res = genericExtract(bytes);
      if (res) {
         const plBlob = new Blob([res.payload], { type: res.mime });
         result = {
           url: URL.createObjectURL(plBlob),
           filename: res.filename || 'extracted.bin',
           mimeType: res.mime,
           size: res.payload.length
         };
      }
    } catch(e) { console.log('Generic check failed', e); }
  }

  if (!result) throw new Error('No known steganography found in this file.');
  return result;
}

async function tryDecodeImageLSB(blob) {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const capacityBytes = capacityBytesForDims(canvas.width, canvas.height);
  const probeLen = Math.min(2048, capacityBytes);
  
  let audioData, mimeType, filename;

  // Modern ASTG check
  const probe = extractBitsLSB(imageData, probeLen, PRNG_SEED);
  const meta = parseHeader(probe);
  if (meta) {
    const totalLen = meta.headerTotal + meta.byteLength;
    if (totalLen > capacityBytes) throw new Error('Declared length exceeds capacity.');
    const all = extractBitsLSB(imageData, totalLen, PRNG_SEED);
    audioData = all.slice(meta.headerTotal, totalLen);
    mimeType = meta.mime || 'application/octet-stream';
    filename = meta.name || 'extracted.bin';
  } else {
    // Legacy fallback for old audio encoding
    const data = imageData.data;
    const audioLength = (data[0] << 16) | (data[1] << 8) | data[2];
    const totalAvailable = Math.floor(data.length / 4) * 3;
    if (audioLength > 0 && audioLength < totalAvailable) {
        audioData = new Uint8Array(audioLength);
        for (let i = 0; i < audioLength; i++) {
          const offset = (i + 1) * 4;
          audioData[i] = data[offset + (i % 3)];
        }
        mimeType = 'audio/mp3';
        filename = 'legacy-audio.mp3';
    } else {
       throw new Error('No LSB header found.');
    }
  }

  const payloadBlob = new Blob([audioData], { type: mimeType });
  const url = URL.createObjectURL(payloadBlob);
  return { url, filename, mimeType, size: audioData.byteLength };
}

async function decodeFileHandler() {
  const stegoFile = stegoInput.files[0];
  if (!stegoFile) {
    statusElement.textContent = 'Please select a file.';
    return;
  }
  try {
    statusElement.textContent = 'Decoding...';
    
    const result = await decodeStegoBlob(stegoFile);
    
    // We create a preview URL for the source file to show in the player
    const carrierURL = URL.createObjectURL(stegoFile);
    
    openPlayerModal(carrierURL, stegoFile.type, result.url, result.filename, 'Extracted Data', result.mimeType, result.size);

    statusElement.textContent = 'Data extracted successfully!';
  } catch (error) {
    console.error(error);
    statusElement.textContent = 'Error: ' + error.message;
  }
}