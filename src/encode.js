import { state } from "state";
import { renderOverlaysToContext } from "overlays";
import { goToStep } from "wizard";
import { buildHeader, embedBitsLSB, genericAppend, encodeWavLSB, PRNG_SEED, CHANNELS_USED, LSB_DEPTH, capacityBytesForDims } from "stego";
import { drawScaledImageToCover, prettyBytes } from "utils";
import { Gallery } from "gallery";

// Refs
const audioInput = document.getElementById('audioInput'); // Now represents generic payload
const btnStep4Next = document.getElementById('btnStep4Next');
const capacityWrap = document.getElementById('capacityWrap');
const capacityBar = document.getElementById('capacityBar');
const capacityText = document.getElementById('capacityText');
const scaleText = document.getElementById('scaleText');
const finalStegoPreview = document.getElementById('finalStegoPreview');
const finalStegoVideo = document.getElementById('finalStegoVideo');
const finalStegoAudio = document.getElementById('finalStegoAudio');
const finalStegoFrame = document.getElementById('finalStegoFrame');
const finalStegoGeneric = document.getElementById('finalStegoGeneric');
const downloadStegoBtn = document.getElementById('downloadStegoBtn');
const openPublishBtn = document.getElementById('openPublishBtn');
const statusElement = document.getElementById('status');

// Publish Modal Refs
const publishModal = document.getElementById('publishModal');
const publishCloseBtn = document.getElementById('publishCloseBtn');
const publishTitle = document.getElementById('publishTitle');
const publishArtist = document.getElementById('publishArtist');
const confirmPublishBtn = document.getElementById('confirmPublishBtn');

function updateDropLabel(inputElement, file) {
  const label = inputElement.closest('.drop-wrap')?.querySelector('.drop-main');
  if (label && file) label.textContent = file.name;
}

export function initEncode(room, galleryInstance) {
  audioInput.addEventListener('change', () => {
    const file = audioInput.files[0];
    if (file) {
      state.currentPayloadFile = file; // Renamed state property
      updateDropLabel(audioInput, file);
      
      // If we are in image mode, we need crop to be done.
      // If generic mode, we can proceed immediately if carrier is set.
      if (state.isImageCarrier) {
        if (state.croppedImageBitmap) {
           btnStep4Next.disabled = false;
           updateCapacityUI();
        }
      } else {
        if (state.currentCarrierFile) {
          btnStep4Next.disabled = false;
        }
      }
    }
  });

  document.getElementById('btnStep4Next').addEventListener('click', encodePayload);
  
  initPublishModal(galleryInstance);
}

function updateCapacityUI() {
  // Only relevant for Image LSB mode
  if (!state.isImageCarrier || !state.croppedImageBitmap || !state.currentPayloadFile) {
    capacityWrap.style.display = 'none';
    return;
  }
  
  const width = state.croppedImageBitmap.width;
  const height = state.croppedImageBitmap.height;
  const origPixels = width * height;
  const payloadSize = state.currentPayloadFile.size;
  
  const headerBytes = 512; 
  const totalBytes = headerBytes + payloadSize;
  
  const bitsPerPixel = CHANNELS_USED * LSB_DEPTH;
  const bytesPerPixel = bitsPerPixel / 8;
  const pixelsNeeded = Math.ceil(totalBytes / bytesPerPixel);
  
  const scale = Math.sqrt((origPixels + pixelsNeeded) / Math.max(origPixels, 1));
  const newW = Math.ceil(width * scale);
  const newH = Math.ceil(height * scale);
  const capacityBytes = capacityBytesForDims(newW, newH);
  
  capacityWrap.style.display = 'block';
  capacityText.textContent = `Required Scale: ${scale.toFixed(2)}x`;
  scaleText.textContent = `Output Size: ${newW}x${newH}`;
  
  const usedPct = Math.min(100, (totalBytes / capacityBytes) * 100);
  capacityBar.style.width = usedPct.toFixed(1) + '%';
}

async function encodePayload() {
  if (!state.currentPayloadFile) return;
  if (!state.currentCarrierFile && !state.croppedImageBitmap) return;
  
  goToStep(5);
  btnStep4Next.textContent = "Encoding...";
  
  try {
    const payloadBuf = await state.currentPayloadFile.arrayBuffer();
    const payloadBytes = new Uint8Array(payloadBuf);
    const mime = state.currentPayloadFile.type || 'application/octet-stream';
    const name = state.currentPayloadFile.name || 'file';

    if (state.isImageCarrier) {
      await encodeImageLSBFlow(payloadBytes, mime, name);
    } else {
      await encodeGenericFlow(payloadBytes, mime, name);
    }
  } catch(e) {
    console.error(e);
    statusElement.textContent = "Error encoding: " + e.message;
  } finally {
    btnStep4Next.textContent = "Encode Now";
  }
}

let finalPreviewUrl = null;

function showFinalPreview(blob) {
  if (finalPreviewUrl) URL.revokeObjectURL(finalPreviewUrl);
  finalPreviewUrl = URL.createObjectURL(blob);
  
  // Hide all
  finalStegoPreview.style.display = 'none';
  finalStegoVideo.style.display = 'none';
  finalStegoAudio.style.display = 'none';
  finalStegoFrame.style.display = 'none';
  finalStegoGeneric.style.display = 'none';
  
  // Stop playback
  finalStegoVideo.pause();
  finalStegoAudio.pause();
  finalStegoVideo.src = '';
  finalStegoAudio.src = '';
  finalStegoPreview.src = '';
  finalStegoFrame.src = '';

  const mime = blob.type || 'application/octet-stream';

  if (mime.startsWith('image/')) {
    finalStegoPreview.src = finalPreviewUrl;
    finalStegoPreview.style.display = 'block';
  } else if (mime.startsWith('video/')) {
    finalStegoVideo.src = finalPreviewUrl;
    finalStegoVideo.style.display = 'block';
  } else if (mime.startsWith('audio/')) {
    finalStegoAudio.src = finalPreviewUrl;
    finalStegoAudio.style.display = 'block';
  } else if (mime === 'application/pdf' || mime.startsWith('text/')) {
    finalStegoFrame.src = finalPreviewUrl;
    finalStegoFrame.style.display = 'block';
  } else {
    finalStegoGeneric.style.display = 'block';
    finalStegoGeneric.innerHTML = `
      <div style="font-size:32px; margin-bottom:8px">📄</div>
      <div>${mime}</div>
      <div style="font-size:12px; opacity:0.7">${prettyBytes(blob.size)}</div>
    `;
  }
}

async function encodeImageLSBFlow(payloadBytes, mime, name) {
  // 1. Bake Overlays
  const dim = state.croppedImageBitmap.width;
  const bakeCanvas = document.createElement('canvas');
  bakeCanvas.width = dim;
  bakeCanvas.height = dim;
  const ctx = bakeCanvas.getContext('2d');
  
  await renderOverlaysToContext(ctx, dim, dim);
  
  const bakedBlob = await new Promise(r => bakeCanvas.toBlob(r, 'image/png'));
  const bakedBitmap = await createImageBitmap(bakedBlob);
  
  // 2. Prepare Payload with Header
  const header = buildHeader(payloadBytes.length, mime, name);
  const combined = new Uint8Array(header.length + payloadBytes.length);
  combined.set(header, 0); combined.set(payloadBytes, header.length);
  
  // 3. Encode
  const pixelsNeeded = Math.ceil(combined.length / (CHANNELS_USED * LSB_DEPTH / 8));
  const origPixels = dim * dim;
  const scale = Math.sqrt((origPixels + pixelsNeeded) / Math.max(origPixels, 1));
  
  const finalCanvas = document.createElement('canvas');
  const { w, h } = drawScaledImageToCover(finalCanvas, bakedBitmap, scale);
  const fCtx = finalCanvas.getContext('2d');
  const imgData = fCtx.getImageData(0,0,w,h);
  
  embedBitsLSB(imgData, combined, PRNG_SEED);
  fCtx.putImageData(imgData, 0,0);
  
  // 4. Result
  finalCanvas.toBlob(blob => {
    state.currentStegoBlob = blob;
    showFinalPreview(blob);
    setupDownloadBtn('stego_image.png', finalPreviewUrl);
  }, 'image/png');
}

async function encodeGenericFlow(payloadBytes, mime, name) {
  const carrierBuf = await state.currentCarrierFile.arrayBuffer();
  const carrierBytes = new Uint8Array(carrierBuf);
  
  let resultBytes;
  let ext = 'bin';
  
  // Attempt WAV LSB if WAV
  if (state.currentCarrierFile.type === 'audio/wav' || state.currentCarrierFile.name.endsWith('.wav')) {
    const res = encodeWavLSB(carrierBytes, payloadBytes, mime, name);
    if (res) {
      resultBytes = res;
      ext = 'wav';
    } else {
      console.log('WAV encoding failed, falling back to append.');
      resultBytes = genericAppend(carrierBytes, payloadBytes, mime, name);
      ext = state.currentCarrierFile.name.split('.').pop();
    }
  } else {
    // Generic Append
    resultBytes = genericAppend(carrierBytes, payloadBytes, mime, name);
    ext = state.currentCarrierFile.name.split('.').pop();
  }
  
  // Ensure mime type is present for preview to work
  let mimeType = state.currentCarrierFile.type;
  if (!mimeType) {
     if (state.currentCarrierFile.name.match(/\.mp4$/i)) mimeType = 'video/mp4';
     else if (state.currentCarrierFile.name.match(/\.webm$/i)) mimeType = 'video/webm';
     else if (state.currentCarrierFile.name.match(/\.mp3$/i)) mimeType = 'audio/mpeg';
     else if (state.currentCarrierFile.name.match(/\.wav$/i)) mimeType = 'audio/wav';
  }

  const finalBlob = new Blob([resultBytes], { type: mimeType || 'application/octet-stream' });
  state.currentStegoBlob = finalBlob;
  
  showFinalPreview(finalBlob);
  
  setupDownloadBtn(`stego_file.${ext}`, finalPreviewUrl);
}

function setupDownloadBtn(filename, url) {
    downloadStegoBtn.onclick = () => {
       const a = document.createElement('a');
       a.href = url;
       a.download = filename;
       a.click();
    };
}

function initPublishModal(gallery) {
  function openPublish() {
    if (!state.currentStegoBlob) return;
    publishTitle.value = '';
    publishArtist.value = '';
    publishModal.classList.add('open');
    publishModal.setAttribute('aria-hidden', 'false');
  }
  function closePublish() {
    publishModal.classList.remove('open');
    publishModal.setAttribute('aria-hidden', 'true');
  }
  
  openPublishBtn.addEventListener('click', openPublish);
  publishCloseBtn.addEventListener('click', closePublish);
  
  confirmPublishBtn.addEventListener('click', async () => {
    if (!state.currentStegoBlob) return;
    confirmPublishBtn.disabled = true;
    confirmPublishBtn.textContent = 'Uploading...';
    try {
      const payloadType = state.currentPayloadFile ? state.currentPayloadFile.type : 'application/octet-stream';
      await gallery.uploadPost(state.currentStegoBlob, publishTitle.value, publishArtist.value, payloadType);
      statusElement.textContent = 'Song published to Community Gallery!';
      closePublish();
      document.getElementById('tab-gallery').click();
    } catch (e) {
      console.error(e);
      statusElement.textContent = 'Upload failed: ' + e.message;
    } finally {
      confirmPublishBtn.disabled = false;
      confirmPublishBtn.textContent = 'Publish Now';
    }
  });
}