import { state } from "state";
import Cropper from "cropperjs";

// Crop Refs
const step2Preview = document.getElementById('step2Preview');
const cropAreaCard = document.getElementById('cropAreaCard');
const previewAreaCard = document.getElementById('previewAreaCard');
const cropImageTarget = document.getElementById('cropImageTarget');
const btnEnableCrop = document.getElementById('btnEnableCrop');
const cropConfirmBtn = document.getElementById('cropConfirmBtn');
const cropZoomInBtn = document.getElementById('cropZoomInBtn');
const cropZoomOutBtn = document.getElementById('cropZoomOutBtn');
const btnStep2Next = document.getElementById('btnStep2Next');
const imageInfo = document.getElementById('imageInfo');

export function initCrop() {
  btnEnableCrop.addEventListener('click', enableCropEditor);
  cropZoomInBtn.addEventListener('click', () => state.cropper && state.cropper.zoom(0.1));
  cropZoomOutBtn.addEventListener('click', () => state.cropper && state.cropper.zoom(-0.1));
  cropConfirmBtn.addEventListener('click', applyCrop);
}

export async function prepareStep2() {
  if (!state.currentCarrierFile) return false;
  
  try {
    const bmp = await createImageBitmap(state.currentCarrierFile);
    
    // Default center crop
    const side = Math.min(bmp.width, bmp.height);
    const outSide = Math.min(3000, side);
    
    const c = document.createElement('canvas');
    c.width = outSide; c.height = outSide;
    const ctx = c.getContext('2d');
    const sx = (bmp.width - side) / 2;
    const sy = (bmp.height - side) / 2;
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, outSide, outSide);
    
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    state.croppedImageBitmap = await createImageBitmap(blob);
    
    step2Preview.src = URL.createObjectURL(blob);
    imageInfo.textContent = `Current Size: ${outSide}x${outSide} (1:1)`;
    
    resetCropUI();
    return true;
  } catch (e) {
    console.error("Failed to process image:", e);
    return false;
  }
}

function resetCropUI() {
  cropAreaCard.style.display = 'none';
  previewAreaCard.style.display = 'block';
  btnEnableCrop.style.display = 'inline-block';
  btnStep2Next.style.display = 'inline-block';
  if (state.cropper) { state.cropper.destroy(); state.cropper = null; }
  btnEnableCrop.textContent = "Yes, Crop It";
}

function enableCropEditor() {
  previewAreaCard.style.display = 'none';
  btnEnableCrop.style.display = 'none';
  btnStep2Next.style.display = 'none';
  cropAreaCard.style.display = 'block';
  
  const url = URL.createObjectURL(state.currentCarrierFile);
  cropImageTarget.src = url;
  
  if (state.cropper) state.cropper.destroy();
  state.cropper = new Cropper(cropImageTarget, {
    viewMode: 1,
    aspectRatio: 1,
    dragMode: 'move',
    autoCropArea: 1,
    responsive: true,
    background: false,
    movable: true,
    zoomable: true,
    scalable: false,
    rotatable: false,
    wheelZoomRatio: 0.1
  });
}

function applyCrop() {
  if (!state.cropper) return;
  const canvas = state.cropper.getCroppedCanvas({
    maxWidth: 3000,
    maxHeight: 3000,
    fillColor: '#000',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });
  
  canvas.toBlob(async (blob) => {
    state.croppedImageBitmap = await createImageBitmap(blob);
    step2Preview.src = URL.createObjectURL(blob);
    imageInfo.textContent = `Cropped Size: ${state.croppedImageBitmap.width}x${state.croppedImageBitmap.height}`;
    
    cropAreaCard.style.display = 'none';
    previewAreaCard.style.display = 'block';
    btnEnableCrop.style.display = 'inline-block';
    btnStep2Next.style.display = 'inline-block';
    btnEnableCrop.textContent = "Edit Crop";
    state.cropper.destroy(); state.cropper = null;
  }, 'image/png');
}