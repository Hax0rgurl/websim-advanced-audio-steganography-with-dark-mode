// Shared application state
export const state = {
  currentCarrierFile: null, // Can be image, audio, or other
  currentPayloadFile: null, // Can be any file
  
  // Legacy/Image specific
  croppedImageBitmap: null, 
  currentStegoBlob: null,
  cropper: null,

  // Flags
  isImageCarrier: false
};

export function resetState() {
  state.currentCarrierFile = null;
  state.currentPayloadFile = null;
  state.croppedImageBitmap = null;
  state.currentStegoBlob = null;
  state.isImageCarrier = false;
  if (state.cropper) {
    state.cropper.destroy();
    state.cropper = null;
  }
}