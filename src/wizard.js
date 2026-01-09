import { prepareStep2 } from "crop";
import { renderOverlayPreview } from "overlays";
import { state, resetState } from "state";

// Refs
const wizSteps = [1, 2, 3, 4, 5].map(i => document.getElementById(`wiz-step-${i}`));
const wizDots = [1, 2, 3, 4, 5].map(i => document.getElementById(`dot${i}`));
const statusElement = document.getElementById('status');

// Nav Buttons
const btnStep1Next = document.getElementById('btnStep1Next');
const btnStep2Next = document.getElementById('btnStep2Next');
const btnStep2Back = document.getElementById('btnStep2Back');
const btnStep3Next = document.getElementById('btnStep3Next');
const btnStep3Back = document.getElementById('btnStep3Back');
const btnStep4Back = document.getElementById('btnStep4Back');
const btnRestart = document.getElementById('btnRestart');
const imageInput = document.getElementById('imageInput');
const audioInput = document.getElementById('audioInput');

let currentStep = 1;

export function initWizard() {
  /* Replaced by unified handler below */
  
  btnStep2Next.addEventListener('click', () => {
    if (!state.croppedImageBitmap) {
      statusElement.textContent = "Please confirm the image first.";
      return;
    }
    goToStep(3);
  });
  
  btnStep2Back.addEventListener('click', () => goToStep(1));
  btnStep3Back.addEventListener('click', () => goToStep(2));
  btnStep3Next.addEventListener('click', () => goToStep(4));
  btnStep4Back.addEventListener('click', () => goToStep(3));
  
  btnRestart.addEventListener('click', restartWizard);
  
  // Step 4 Back Logic
  btnStep4Back.onclick = (e) => {
    e.stopImmediatePropagation();
    if (state.isImageCarrier) {
       goToStep(3); // Back to Overlays
    } else {
       goToStep(1); // Back to Carrier Selection
    }
  };

  // Step 1: Upload Listener
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (file) {
      state.currentCarrierFile = file;
      
      // Check if image
      state.isImageCarrier = file.type.startsWith('image/');
      
      const label = imageInput.closest('.drop-wrap')?.querySelector('.drop-main');
      if(label) label.textContent = file.name;
      
      btnStep1Next.disabled = false;
      
      if (state.isImageCarrier) {
        btnStep1Next.textContent = "Next: Edit Image";
      } else {
        btnStep1Next.textContent = "Next: Select Payload";
      }
    }
  });
  
  // Unified Next Step Logic
  btnStep1Next.onclick = async (e) => {
    e.stopImmediatePropagation();
    
    if (state.isImageCarrier) {
       const originalText = btnStep1Next.textContent;
       btnStep1Next.textContent = "Processing...";
       btnStep1Next.disabled = true;
       
       const success = await prepareStep2();
       
       btnStep1Next.disabled = false;
       btnStep1Next.textContent = originalText;

       if (success) {
         goToStep(2);
       } else {
         // Fallback to generic mode if image processing failed
         console.warn("Image processing failed. Falling back to generic file mode.");
         state.isImageCarrier = false;
         goToStep(4);
       }
    } else {
       // Skip Crop & Overlays if not an image
       goToStep(4);
    }
  };
}

export function goToStep(step) {
  wizSteps.forEach((el, idx) => {
    el.classList.toggle('active-step', idx + 1 === step);
  });
  wizDots.forEach((el, idx) => {
    el.classList.toggle('active', idx + 1 === step);
    if (idx + 1 < step) el.classList.add('completed');
  });
  currentStep = step;
  
  if (step === 3) {
    renderOverlayPreview();
  }
}

function restartWizard() {
  imageInput.value = '';
  audioInput.value = '';
  
  const imgLabel = imageInput.closest('.drop-wrap')?.querySelector('.drop-main');
  if(imgLabel) imgLabel.textContent = "Click to select Image";
  
  const audLabel = audioInput.closest('.drop-wrap')?.querySelector('.drop-main');
  if(audLabel) audLabel.textContent = "Click to select Audio";
  
  resetState();
  btnStep1Next.disabled = true;
  goToStep(1);
}