// ...existing code...
import { encodeImageLSB, decodeImageLSB, estimateImageCapacity } from './stegoImageLSBLegacy.js';
import { encodeImageDCT, decodeImageDCT, estimateImageDCTCapacity } from './stegoImageDCT.js';
import { scanMagic, extractSlice } from './stegoScan.js';
import { encodeWavLSB, decodeWavLSB, estimateWavCapacity, sniffWavPcm16 } from './stegoAudio.js';
import { genericAppend, genericExtract, hasGenericFooter } from './stegoGeneric.js';
import { readAsArrayBuffer, readAsText, bufToBlob, bytesToHuman, utf8Encode, utf8Decode, downloadBlob, getMimeFromName } from './utils.js';

document.body.classList.add('mode-simple');
const advToggle = document.getElementById('advancedToggle');
if (advToggle) advToggle.addEventListener('change', () => {
  const advanced = advToggle.checked;
  document.body.classList.toggle('mode-simple', !advanced);
  if (!advanced) {
    const auto = document.querySelector('input[name="method"][value="auto"]');
    if (auto) { auto.checked = true; updateMethodUI(); }
  }
});

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

// Wizard state
let wizardStep = 1;
let wizardMode = null; // 'encode' or 'decode'
let wizardCarrierFile = null;
let wizardCarrierText = '';
let wizardCarrierIsText = true;
let wizardPayloadBlob = null;
let wizardPayloadTextMode = true;
let wizardExtractedBlob = null;

function initWizard() {
  // Wizard action selection
  $('#wizardActionHide').addEventListener('click', () => selectWizardAction('encode'));
  $('#wizardActionExtract').addEventListener('click', () => selectWizardAction('decode'));
  
  // Wizard navigation
  $('#wizardNext1').addEventListener('click', () => goToWizardStep(2));
  $('#wizardBack2').addEventListener('click', () => goToWizardStep(1));
  $('#wizardNext2').addEventListener('click', () => {
    if (wizardMode === 'encode') {
      goToWizardStep(3);
    } else {
      processWizardDecode();
    }
  });
  $('#wizardBack3').addEventListener('click', () => goToWizardStep(2));
  $('#wizardNext3').addEventListener('click', () => {
    if (wizardMode === 'encode') {
      processWizardEncode();
    } else {
      goToWizardStep(4);
    }
  });
  $('#wizardStartOver').addEventListener('click', () => {
    resetWizard();
    goToWizardStep(1);
  });
  $('#wizardSwitchMode').addEventListener('click', () => {
    advToggle.checked = true;
    advToggle.dispatchEvent(new Event('change'));
  });

  // Wizard decode actions
  $('#wizardViewData').addEventListener('click', () => goToWizardStep(4));
  $('#wizardDownloadData').addEventListener('click', () => {
    if (wizardExtractedBlob) {
      const ext = extFromMime(wizardExtractedBlob.type);
      downloadBlob(wizardExtractedBlob, `extracted${ext}`);
    }
  });
  $('#wizardCopyResult').addEventListener('click', async () => {
    if (wizardExtractedBlob && /^text\//.test(wizardExtractedBlob.type)) {
      const text = await readAsText(wizardExtractedBlob);
      await navigator.clipboard.writeText(text);
    }
  });
  $('#wizardDownloadResult').addEventListener('click', () => {
    if (wizardExtractedBlob) {
      const ext = extFromMime(wizardExtractedBlob.type);
      downloadBlob(wizardExtractedBlob, `extracted${ext}`);
    }
  });

  // Wizard file inputs
  $('#wizardCarrierInput').addEventListener('change', (e) => handleWizardCarrier(e.target.files[0]));
  $('#wizardCarrierInput').addEventListener('click', (e) => { e.target.value = ''; });
  $('#wizardPayloadInput').addEventListener('change', (e) => handleWizardPayload(e.target.files[0]));
  $('#wizardPayloadInput').addEventListener('click', (e) => { e.target.value = ''; });
  $('#wizardPayloadText').addEventListener('input', handleWizardTextPayload);
  $('#wizardCarrierText').addEventListener('input', handleWizardCarrierText);

  // Wizard carrier type toggle
  $$('input[name="wizardCarrierType"]').forEach(r => r.addEventListener('change', (e) => {
    wizardCarrierIsText = e.target.value === 'text';
    $('#wizardCarrierFileSection').classList.toggle('hidden', wizardCarrierIsText);
    $('#wizardCarrierTextSection').classList.toggle('hidden', !wizardCarrierIsText);
    wizardCarrierFile = null;
    wizardCarrierText = '';
    $('#wizardCarrierInfo').classList.add('hidden');
    $('#wizardCarrierInput').value = '';
    $('#wizardCarrierText').value = '';
    updateWizardStep2State();
  }));
  // Set default to "Use Text" in simple mode
  $('input[name="wizardCarrierType"][value="text"]').checked = true;
  $('#wizardCarrierFileSection').classList.add('hidden');
  $('#wizardCarrierTextSection').classList.remove('hidden');
  wizardCarrierIsText = true;
  updateWizardStep2State();

  // Wizard payload type toggle
  $$('input[name="wizardPayloadType"]').forEach(r => r.addEventListener('change', (e) => {
    wizardPayloadTextMode = e.target.value === 'text';
    $('#wizardTextPayload').classList.toggle('hidden', !wizardPayloadTextMode);
    $('#wizardFilePayload').classList.toggle('hidden', wizardPayloadTextMode);
    wizardPayloadBlob = null;
    $('#wizardPayloadInfo').classList.add('hidden');
    updateWizardStep3State();
  }));

  // Wizard drag and drop
  setupWizardDrop('wizardCarrierDrop', 'wizardCarrierInput', handleWizardCarrier);
  setupWizardDrop('wizardPayloadDrop', 'wizardPayloadInput', handleWizardPayload);
}

function selectWizardAction(mode) {
  wizardMode = mode;
  
  // Update UI
  $$('.wizard-action-card').forEach(card => card.classList.remove('selected'));
  $(`#wizardAction${mode === 'encode' ? 'Hide' : 'Extract'}`).classList.add('selected');
  
  $('#wizardNext1').disabled = false;
}

function setupWizardDrop(dropId, inputId, handler) {
  const dz = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  
  dz.addEventListener('click', () => { input.value = ''; input.click(); });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.style.borderColor = '#94a3b8';
    dz.style.background = '#f8fafc';
  });
  dz.addEventListener('dragleave', () => {
    dz.style.borderColor = '';
    dz.style.background = '';
  });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.style.borderColor = '';
    dz.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) {
      input.files = createFileList(file);
      handler(file);
    }
  });
}

function handleWizardCarrier(file) {
  // Force "Use File" mode when a file is selected (fixes upload not registering)
  if (file) {
    wizardCarrierIsText = false;
    $('input[name="wizardCarrierType"][value="file"]').checked = true;
    $('#wizardCarrierFileSection').classList.remove('hidden');
    $('#wizardCarrierTextSection').classList.add('hidden');
  }
  wizardCarrierFile = file;
  const dropzone = $('#wizardCarrierDrop');
  const info = $('#wizardCarrierInfo');
  
  if (file) {
    dropzone.classList.add('has-file');
    dropzone.querySelector('.wizard-icon').textContent = getFileIcon(file);
    dropzone.querySelector('.wizard-text').textContent = file.name;
    dropzone.querySelector('.wizard-hint').textContent = `${bytesToHuman(file.size)} • Ready to use`;
    
    $('#wizardCarrierName').textContent = file.name;
    $('#wizardCarrierDetails').textContent = `${bytesToHuman(file.size)} • ${file.type || 'Unknown type'}`;
    info.classList.remove('hidden');
  } else {
    dropzone.classList.remove('has-file');
    dropzone.querySelector('.wizard-icon').textContent = '📁';
    dropzone.querySelector('.wizard-text').textContent = 'Drop your file here or click to browse';
    dropzone.querySelector('.wizard-hint').textContent = 'Images work best, but any file type is supported';
    info.classList.add('hidden');
  }
  
  updateWizardStep1State();
  updateWizardStep2State();
}

function handleWizardPayload(file) {
  wizardPayloadBlob = file;
  const dropzone = $('#wizardPayloadDrop');
  const info = $('#wizardPayloadInfo');
  
  if (file) {
    dropzone.classList.add('has-file');
    dropzone.querySelector('.wizard-icon').textContent = getFileIcon(file);
    dropzone.querySelector('.wizard-text').textContent = file.name;
    dropzone.querySelector('.wizard-hint').textContent = `${bytesToHuman(file.size)} • Ready to hide`;
    
    $('#wizardPayloadName').textContent = file.name;
    $('#wizardPayloadDetails').textContent = `${bytesToHuman(file.size)} • ${file.type || 'Unknown type'}`;
    info.classList.remove('hidden');
  } else {
    dropzone.classList.remove('has-file');
    dropzone.querySelector('.wizard-icon').textContent = '🗂️';
    dropzone.querySelector('.wizard-text').textContent = 'Drop your secret file here';
    dropzone.querySelector('.wizard-hint').textContent = 'Any file type supported';
    info.classList.add('hidden');
  }
  
  updateWizardStep2State();
}

function handleWizardTextPayload() {
  const text = $('#wizardPayloadText').value;
  wizardPayloadBlob = text ? new Blob([utf8Encode(text)], { type: 'text/plain' }) : null;
  updateWizardStep3State();
}

function handleWizardCarrierText() {
  wizardCarrierText = $('#wizardCarrierText').value;
  updateWizardStep2State();
}

function getFileIcon(file) {
  if (/^image\//.test(file.type)) return '🖼️';
  if (/^audio\//.test(file.type)) return '🎵';
  if (/^video\//.test(file.type)) return '🎬';
  if (/pdf/.test(file.type)) return '📄';
  if (/zip|rar|7z/.test(file.type)) return '📦';
  if (/exe|app/.test(file.name)) return '⚙️';
  if (/apk/.test(file.name)) return '📱';
  return '📄';
}

function goToWizardStep(step) {
  wizardStep = step;
  
  // Update step indicators
  $$('.wizard-step').forEach((el, i) => {
    const stepNum = i + 1;
    el.classList.toggle('active', stepNum === step);
    el.classList.toggle('completed', stepNum < step);
  });
  
  // Show/hide step content
  $$('.wizard-step-content').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== step);
  });
  
  // Update progress bar
  const progress = ((step - 1) / 3) * 100;
  $('.wizard-progress-bar').style.width = `${progress}%`;
  
  // Update step 2 content based on mode
  if (step === 2) {
    if (wizardMode === 'encode') {
      $('#wizardStep2Title').textContent = 'Choose a file or text to hide data in';
      $('#wizardStep2Subtitle').textContent = 'Select any image, audio file, document, or enter text';
      $('#wizardCarrierToggle').classList.remove('hidden');
    } else {
      $('#wizardStep2Title').textContent = 'Select file with hidden data';
      $('#wizardStep2Subtitle').textContent = 'Choose a file that may contain hidden information';
      $('#wizardCarrierToggle').classList.add('hidden');
      $('#wizardCarrierFileSection').classList.remove('hidden');
      $('#wizardCarrierTextSection').classList.add('hidden');
      wizardCarrierIsText = false;
      $('input[name="wizardCarrierType"][value="file"]').checked = true;
    }
  }
  
  // Update step 3 content based mode
  if (step === 3) {
    if (wizardMode === 'encode') {
      $('#wizardStep3Title').textContent = 'What do you want to hide?';
      $('#wizardStep3Subtitle').textContent = 'Add text or choose a file to hide';
      $('#wizardEncodeContent').classList.remove('hidden');
      $('#wizardDecodeContent').classList.add('hidden');
      $('#wizardNext3').textContent = 'Hide & Download';
      $('#wizardNext3').style.display = 'block';
      $('#wizardNext3').disabled = false; // ensure enabled
    } else {
      $('#wizardStep3Title').textContent = 'Extracting hidden data';
      $('#wizardStep3Subtitle').textContent = 'Please wait while we analyze your file';
      $('#wizardEncodeContent').classList.add('hidden');
      $('#wizardDecodeContent').classList.remove('hidden');
      $('#wizardNext3').textContent = 'View Result';
      $('#wizardNext3').style.display = 'none'; // Hidden until data found
    }
  }
  
  // Update step 4 for decode mode
  if (step === 4 && wizardMode === 'decode' && wizardExtractedBlob) {
    displayWizardResult();
  }
}

function updateWizardStep1State() {
  $('#wizardNext1').disabled = !wizardMode;
}

function updateWizardStep2State() {
  const hasInput = wizardCarrierIsText ? 
    wizardCarrierText.trim().length > 0 : 
    !!wizardCarrierFile;
  $('#wizardNext2').disabled = !hasInput;
}

function updateWizardStep3State() {
  if (wizardMode === 'decode') {
    // For decode mode, step 3 is automatic processing
    return;
  }
  // Always enable; we'll validate on click
  $('#wizardNext3').disabled = false;
}

async function processWizardDecode() {
  if (!wizardCarrierFile && !wizardCarrierText) return;
  
  // Move to step 3 to show processing
  goToWizardStep(3);
  
  // Show processing state
  $('#wizardDecodeProcessing').classList.remove('hidden');
  $('#wizardDecodeResult').classList.add('hidden');
  $('#wizardDecodeError').classList.add('hidden');
  
  try {
    let extractedData = null;
    
    if (wizardCarrierIsText && wizardCarrierText) {
      // Try Unicode steganography
      try {
        const textResult = window.unicodeSteganographer.decodeText(wizardCarrierText);
        if (textResult.hiddenText && textResult.hiddenText.length > 0) {
          extractedData = new Blob([textResult.hiddenText], { type: 'text/plain' });
        } else {
          const binaryResult = window.unicodeSteganographer.decodeBinary(wizardCarrierText);
          if (binaryResult.hiddenData && binaryResult.hiddenData.length > 0) {
            extractedData = new Blob([binaryResult.hiddenData], { type: 'application/octet-stream' });
          }
        }
      } catch (e) {
        console.error('Unicode decode failed:', e);
      }
    } else if (wizardCarrierFile) {
      // Try different methods
      const buf = new Uint8Array(await readAsArrayBuffer(wizardCarrierFile));
      
      // Try generic first
      try {
        const result = genericExtract(buf);
        if (result) {
          extractedData = new Blob([result.payload], { type: result.mime });
        }
      } catch (e) {
        console.error('Generic decode failed:', e);
      }
      
      // Try audio if no generic result
      if (!extractedData && (wizardCarrierFile.type === 'audio/wav' || /\.wav$/i.test(wizardCarrierFile.name))) {
        try {
          const result = decodeWavLSB(buf);
          if (result) {
            extractedData = new Blob([result.payload], { type: result.mime });
          }
        } catch (e) {
          console.error('Audio decode failed:', e);
        }
      }
      
      // Try image if no other result
      if (!extractedData && await isImage(wizardCarrierFile)) {
        try {
          const url = URL.createObjectURL(wizardCarrierFile);
          let result = null;
          if (/\.jpe?g$/i.test(wizardCarrierFile.name) || wizardCarrierFile.type === 'image/jpeg') {
            result = await decodeImageDCT(url) || await decodeImageLSB(url, 'rgb');
          } else {
            result = await decodeImageLSB(url, 'rgb');
          }
          URL.revokeObjectURL(url);
          if (result) {
            extractedData = new Blob([result.payload], { type: result.mime });
          }
        } catch (e) {
          console.error('Image decode failed:', e);
        }
      }
    }
    
    if (extractedData) {
      wizardExtractedBlob = extractedData;
      const info = `Found ${bytesToHuman(extractedData.size)} of hidden data (${extractedData.type})`;
      $('#wizardDecodeInfo').textContent = info;
      $('#wizardDecodeResult').classList.remove('hidden');
      
      // Show next button to proceed to step 4
      $('#wizardNext3').style.display = 'block';
      $('#wizardNext3').disabled = false;
      $('#wizardNext3').textContent = 'View Result';
    } else {
      $('#wizardDecodeError').classList.remove('hidden');
      $('#wizardNext3').style.display = 'none';
    }
  } catch (e) {
    console.error('Decode error:', e);
    $('#wizardDecodeError').classList.remove('hidden');
    $('#wizardNext3').style.display = 'none';
  } finally {
    $('#wizardDecodeProcessing').classList.add('hidden');
  }
}

async function processWizardEncode() {
  if ((!wizardCarrierFile && !wizardCarrierText) || !wizardPayloadBlob) {
    alert('Please provide a carrier (file or text) and a payload (text or file) before proceeding.');
    return;
  }
  $('#wizardNext3').disabled = true;
  $('#wizardNext3').textContent = 'Processing...';
  
  try {
    let stegoBlob;
    
    if (wizardCarrierIsText && wizardCarrierText) {
      // Unicode steganography
      let stegoText;
      if (wizardPayloadTextMode) {
        stegoText = window.unicodeSteganographer.encodeText(wizardCarrierText, $('#wizardPayloadText').value || '');
      } else {
        const bytes = new Uint8Array(await wizardPayloadBlob.arrayBuffer());
        stegoText = window.unicodeSteganographer.encodeBinary(wizardCarrierText, bytes);
      }
      stegoBlob = new Blob([stegoText], { type: 'text/plain' });
      downloadBlob(stegoBlob, 'hidden_message.txt');
    } else {
      // File-based steganography
      const carrierBuf = new Uint8Array(await readAsArrayBuffer(wizardCarrierFile));
      const payloadBuf = new Uint8Array(await wizardPayloadBlob.arrayBuffer());
      
      let method = 'generic'; // Default fallback
      
      // Try to determine best method automatically
      if (await isImage(wizardCarrierFile)) {
        try {
          const imgUrl = URL.createObjectURL(wizardCarrierFile);
          const pngBytes = await encodeImageLSB(imgUrl, payloadBuf, wizardPayloadBlob.type || 'application/octet-stream');
          URL.revokeObjectURL(imgUrl);
          stegoBlob = new Blob([pngBytes], { type: 'image/png' });
          method = 'image';
        } catch {
          // Fallback to generic
          const out = genericAppend(carrierBuf, payloadBuf, wizardPayloadBlob.type || 'application/octet-stream');
          stegoBlob = bufToBlob(out, wizardCarrierFile.type);
        }
      } else if (await isWav(wizardCarrierFile)) {
        try {
          const out = encodeWavLSB(carrierBuf, payloadBuf, wizardPayloadBlob.type || 'application/octet-stream');
          if (out) {
            stegoBlob = new Blob([out], { type: 'audio/wav' });
            method = 'audio';
          } else {
            throw new Error('WAV encoding failed');
          }
        } catch {
          // Fallback to generic
          const out = genericAppend(carrierBuf, payloadBuf, wizardPayloadBlob.type || 'application/octet-stream');
          stegoBlob = bufToBlob(out, wizardCarrierFile.type);
        }
      } else {
        // Use generic for all other files
        const out = genericAppend(carrierBuf, payloadBuf, wizardPayloadBlob.type || 'application/octet-stream');
        stegoBlob = bufToBlob(out, wizardCarrierFile.type);
      }
      
      // Generate filename
      const base = wizardCarrierFile.name.replace(/\.[^./\\]+$/, '');
      const ext = (wizardCarrierFile.name.match(/(\.[^./\\]+)$/) || [''])[0] || '';
      let filename;
      
      if (method === 'image') {
        filename = `${base}_stego.png`;
      } else if (method === 'audio') {
        filename = `${base}_stego.wav`;
      } else {
        filename = `${base}_stego${ext}`;
      }
      
      downloadBlob(stegoBlob, filename);
    }
    
    goToWizardStep(4);
    
  } catch (e) {
    console.error(e);
    $('#wizardNext3').textContent = 'Error occurred';
    setTimeout(() => {
      $('#wizardNext3').textContent = 'Hide & Download';
      $('#wizardNext3').disabled = false;
    }, 2000);
  }
}

function resetWizard() {
  wizardStep = 1;
  wizardMode = null;
  wizardCarrierFile = null;
  wizardCarrierText = '';
  wizardCarrierIsText = false;
  wizardPayloadBlob = null;
  wizardPayloadTextMode = true;
  wizardExtractedBlob = null;
  
  // Reset UI
  $$('.wizard-action-card').forEach(card => card.classList.remove('selected'));
  $('#wizardCarrierInput').value = '';
  $('#wizardPayloadInput').value = '';
  $('#wizardPayloadText').value = '';
  $('#wizardCarrierText').value = '';
  $('#wizardCarrierInfo').classList.add('hidden');
  $('#wizardPayloadInfo').classList.add('hidden');
  $('#wizardCarrierDrop').classList.remove('has-file');
  $('#wizardPayloadDrop').classList.remove('has-file');
  $('input[name="wizardPayloadType"][value="text"]').checked = true;
  $('input[name="wizardCarrierType"][value="file"]').checked = true;
  $('#wizardTextPayload').classList.remove('hidden');
  $('#wizardFilePayload').classList.add('hidden');
  $('#wizardCarrierFileSection').classList.remove('hidden');
  $('#wizardCarrierTextSection').classList.add('hidden');
  $('#wizardCarrierToggle').classList.remove('hidden');
  
  // Reset decode UI
  $('#wizardDecodeProcessing').classList.add('hidden');
  $('#wizardDecodeResult').classList.add('hidden');
  $('#wizardDecodeError').classList.add('hidden');
  $('#wizardResultDisplay').classList.add('hidden');
  
  // Reset dropzone content
  const carrierDrop = $('#wizardCarrierDrop');
  carrierDrop.querySelector('.wizard-icon').textContent = '📁';
  carrierDrop.querySelector('.wizard-text').textContent = 'Drop your file here or click to browse';
  carrierDrop.querySelector('.wizard-hint').textContent = 'Images work best, but any file type is supported';
  
  const payloadDrop = $('#wizardPayloadDrop');
  payloadDrop.querySelector('.wizard-icon').textContent = '🗂️';
  payloadDrop.querySelector('.wizard-text').textContent = 'Drop your secret file here';
  payloadDrop.querySelector('.wizard-hint').textContent = 'Any file type supported';
  
  updateWizardStep1State();
  updateWizardStep2State();
  updateWizardStep3State();
}

// Initialize wizard
initWizard();

let carrierFile = null;
let payloadBlob = null;
let payloadTextMode = true;
let detectedMethod = null;
let extractedBlob = null;
let resultIsText = false, resultTextCache = '';

function setActiveTab(name) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === name));
  $('#encode').setAttribute('aria-hidden', name === 'decode');
  $('#decode').setAttribute('aria-hidden', name === 'encode');
}

$$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

const methodRadios = $$('input[name="method"]');
$$('input[name="payloadType"]').forEach(r => r.addEventListener('change', (e) => {
  payloadTextMode = e.target.value === 'text';
  $('#payloadText').classList.toggle('hidden', !payloadTextMode);
  $('#payloadFile').classList.toggle('hidden', payloadTextMode);
  $('#payloadMeta').textContent = '';
  payloadBlob = null;
  updateEncodeState();
}));

$('#payloadText').addEventListener('input', () => {
  const text = $('#payloadText').value;
  payloadBlob = new Blob([utf8Encode(text)], { type: 'application/octet-stream' });
  $('#payloadMeta').textContent = text ? `Text length: ${text.length} chars` : '';
  updateCapacity();
  updateEncodeState();
});

$('#payloadFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) $('input[name="payloadType"][value="file"]').checked = true;
  payloadBlob = f || null;
  $('#payloadMeta').textContent = f ? `Payload: ${f.name} (${bytesToHuman(f.size)})` : '';
  updateCapacity();
  updateEncodeState();
});

function setupDrop(targetSel, cb) {
  const dz = document.querySelector(`.dropzone[data-target="${targetSel}"]`);
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = '#bbb'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.style.borderColor = '';
    cb(e.dataTransfer.files[0] || null);
  });
}

setupDrop('carrier', (f) => {
  $('#carrierInput').files = createFileList(f);
  handleCarrierChange(f);
});
setupDrop('stego', (f) => {
  $('#stegoInput').files = createFileList(f);
  handleStegoChange(f);
});

$('#carrierInput').addEventListener('change', (e) => handleCarrierChange(e.target.files[0] || null));
$('#carrierInput').addEventListener('click', (e) => { e.target.value = ''; });
$('#stegoInput').addEventListener('change', (e) => handleStegoChange(e.target.files[0] || null));
$('#stegoInput').addEventListener('click', (e) => { e.target.value = ''; });

function createFileList(file) {
  const dt = new DataTransfer(); if (file) dt.items.add(file); return dt.files;
}

function handleCarrierChange(f) {
  carrierFile = f || null;
  $('#carrierMeta').textContent = carrierFile ? `${carrierFile.name} • ${bytesToHuman(carrierFile.size)} • ${carrierFile.type || 'unknown'}` : '';
  updateEncodeState();
}

function updateCapacity() {
  const capEl = $('#capacity');
  capEl.textContent = '';
  const isApkCarrier = carrierFile && isApk(carrierFile);
  if (isApkCarrier && getSelectedMethod() !== 'unicode') {
    capEl.textContent = 'APK detected: You can embed via Generic footer, but the APK may no longer be installable. Use Unicode Text stego if installability must be preserved.';
    return;
  }
  if (getSelectedMethod() === 'unicode') {
    capEl.textContent = 'Unicode stego: best for short text/small files in text.';
    return;
  }
  if (!carrierFile || !payloadBlob) return;
  const method = getSelectedMethod();
  if (method === 'generic') {
    capEl.textContent = 'Generic footer: Capacity limited by browser memory only.';
    return;
  }
  if (method === 'image_dct') {
    const imgURL = URL.createObjectURL(carrierFile);
    estimateImageDCTCapacity(imgURL)
      .then(bits => { capEl.textContent = bits ? `Estimated capacity: ${bytesToHuman(Math.floor(bits/8))}` : 'Image could not be processed.'; })
      .catch(() => { capEl.textContent = 'Image could not be processed.'; })
      .finally(() => URL.revokeObjectURL(imgURL));
    return;
  }
  if (method === 'audio' || (method === 'auto' && (carrierFile.type === 'audio/wav' || /\.wav$/i.test(carrierFile.name)))) {
    readAsArrayBuffer(carrierFile).then(buf => {
      const cap = estimateWavCapacity(new Uint8Array(buf));
      capEl.textContent = cap ? `Estimated capacity: ${bytesToHuman(Math.floor(cap/8))}` : 'Unsupported WAV format. Falling back to Generic recommended.';
    });
    return;
  }
  // image or auto
  const looksImage = /^image\//.test(carrierFile.type) || /\.(png|jpe?g|bmp)$/i.test(carrierFile.name);
  if (!looksImage) { capEl.textContent = 'Generic footer: works for any file type (recommended here).'; return; }
  const imgURL = URL.createObjectURL(carrierFile);
  estimateImageCapacity(imgURL)
    .then(bits => { capEl.textContent = bits ? `Estimated capacity: ${bytesToHuman(Math.floor(bits/8))}` : 'Image could not be processed.'; })
    .catch(() => { capEl.textContent = 'Image could not be processed.'; })
    .finally(() => URL.revokeObjectURL(imgURL));
}

function updateEncodeState() {
  const m = getSelectedMethod();
  const isApkCarrier = carrierFile && isApk(carrierFile);
  const okUnicode = m === 'unicode' ? ($('#carrierText').value.trim().length > 0 && (!!payloadBlob || ($('#payloadText').value || '').length >= 0)) : false;
  const ok = m === 'unicode' ? okUnicode : (!!carrierFile && !!payloadBlob);
  $('#encodeBtn').disabled = !ok;
}

function getSelectedMethod() {
  const el = document.querySelector('input[name="method"]:checked');
  return el ? el.value : 'auto';
}

$('#encodeBtn').addEventListener('click', async () => {
  if (getSelectedMethod() === 'unicode') {
    const cover = $('#carrierText').value || '';
    if (!cover) { $('#encodeProgress').textContent = 'Error: Provide carrier text.'; return; }
    $('#encodeProgress').classList.remove('hidden');
    $('#encodeProgress').textContent = 'Encoding...';
    try {
      let stegoText;
      if (payloadTextMode) {
        stegoText = window.unicodeSteganographer.encodeText(cover, $('#payloadText').value || '');
      } else {
        const bytes = new Uint8Array(await ($('#payloadFile').files[0]).arrayBuffer());
        stegoText = window.unicodeSteganographer.encodeBinary(cover, bytes);
      }
      const stegoBlob = new Blob([stegoText], { type: 'text/plain' });
      $('#encodeProgress').textContent = 'Done.';
      downloadBlob(stegoBlob, 'stego.txt');
    } catch(e) {
      $('#encodeProgress').textContent = `Error: ${e.message}`;
    } finally {
      setTimeout(() => $('#encodeProgress').classList.add('hidden'), 1200);
    }
    return;
  }
  if (!carrierFile || !payloadBlob) return;
  const method = getSelectedMethod();
  $('#encodeProgress').classList.remove('hidden');
  $('#encodeProgress').textContent = 'Encoding...';
  try {
    let stegoBlob;
    let usedMethod = method;
    if (method === 'generic' || (method === 'auto' && !(await isImage(carrierFile)) && !(await isWav(carrierFile)))) {
      const carrierBuf = new Uint8Array(await readAsArrayBuffer(carrierFile));
      const payloadBuf = new Uint8Array(await payloadBlob.arrayBuffer());
      const out = genericAppend(carrierBuf, payloadBuf, payloadBlob.type || getMimeFromName(payloadBlob.name || 'payload.bin'));
      stegoBlob = bufToBlob(out, carrierFile.type || 'application/octet-stream');
      usedMethod = 'generic';
      if (isApk(carrierFile)) {
        $('#encodeProgress').textContent = 'Encoded with Generic footer. Note: APK may not be installable after modification.';
      }
    } else if (method === 'audio' || (method === 'auto' && await isWav(carrierFile))) {
      const carrierBuf = new Uint8Array(await readAsArrayBuffer(carrierFile));
      const payloadBuf = new Uint8Array(await payloadBlob.arrayBuffer());
      const out = encodeWavLSB(carrierBuf, payloadBuf, payloadBlob.type || getMimeFromName(payloadBlob.name || 'payload.bin'));
      if (!out) throw new Error('Unsupported WAV format or insufficient capacity.');
      stegoBlob = new Blob([out], { type: 'audio/wav' });
      usedMethod = 'audio';
    } else if (method === 'image_dct') {
      const imgUrl = URL.createObjectURL(carrierFile);
      const payloadBuf = new Uint8Array(await payloadBlob.arrayBuffer());
      const jpgBytes = await encodeImageDCT(imgUrl, payloadBuf, payloadBlob.type || getMimeFromName(payloadBlob.name || 'payload.bin'));
      URL.revokeObjectURL(imgUrl);
      if (!jpgBytes) throw new Error('Failed to process image (DCT).');
      stegoBlob = new Blob([jpgBytes], { type: 'image/jpeg' });
      usedMethod = 'image_dct';
    } else {
      const imgUrl = URL.createObjectURL(carrierFile);
      const payloadBuf = new Uint8Array(await payloadBlob.arrayBuffer());
      const mode = (method === 'image_blue') ? 'blue' : 'rgb';
      const pngBytes = await encodeImageLSB(imgUrl, payloadBuf, payloadBlob.type || getMimeFromName(payloadBlob.name || 'payload.bin'), mode);
      URL.revokeObjectURL(imgUrl);
      if (!pngBytes) throw new Error('Failed to process image.');
      stegoBlob = new Blob([pngBytes], { type: 'image/png' });
      usedMethod = (method === 'image_blue') ? 'image_blue' : 'image';
    }
    $('#encodeProgress').textContent = 'Done.';
    const base = carrierFile.name.replace(/\.[^./\\]+$/, '');
    const ext = (carrierFile.name.match(/(\.[^./\\]+)$/) || [''])[0] || '';
    let name;
    
    if (usedMethod === 'image' || usedMethod === 'image_blue') name = `${base}_stego.png`;
    else if (usedMethod === 'audio') name = `${base}_stego.wav`;
    else if (usedMethod === 'image_dct') name = `${base}_stego.jpg`;
    else name = `${base}_stego${ext}`;
    
    downloadBlob(stegoBlob, name);
    if (isApk(carrierFile)) {
      const script = `#!/usr/bin/env bash
set -euo pipefail
IN="${name}"
ALIGNED="${base}_aligned.apk"
SIGNED="${base}_signed.apk"

echo "==> Preparing debug keystore (if missing)..."
if [ ! -f debug.keystore ]; then
  keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi

echo "==> zipalign..."
zipalign -p -f 4 "$IN" "$ALIGNED" || { echo "zipalign not found. Install Android build-tools and ensure zipalign is on PATH."; exit 1; }

echo "==> apksigner..."
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --v1-signing-enabled true --v2-signing-enabled true --out "$SIGNED" "$ALIGNED" || { echo "apksigner not found. Install Android build-tools and ensure apksigner is on PATH."; exit 1; }

echo "==> Done."
echo "Signed APK: $SIGNED"
`;
      const shBlob = new Blob([script], { type: 'text/x-shellscript' });
      downloadBlob(shBlob, 'resign_testkey.sh');
      $('#encodeProgress').textContent = 'APK created. A resign_testkey.sh script was downloaded — run it to align and resign the APK.';
    }
  } catch (e) {
    console.error(e);
    $('#encodeProgress').textContent = `Error: ${e.message}`;
  } finally {
    setTimeout(() => $('#encodeProgress').classList.add('hidden'), 1200);
  }
});

async function isImage(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|bmp)$/i.test(file.name);
}
async function isWav(file) {
  if (file.type === 'audio/wav' || /\.wav$/i.test(file.name)) return true;
  const sig = new Uint8Array(await readAsArrayBuffer(file, 12));
  return sniffWavPcm16(sig);
}
function isApk(file){ return /\.apk$/i.test(file.name) || file.type === 'application/vnd.android.package-archive'; }

function handleStegoChange(f) {
  $('#stegoMeta').textContent = f ? `${f.name} • ${bytesToHuman(f.size)} • ${f.type || 'unknown'}` : '';
  detectedMethod = null;
  extractedBlob = null;
  $('#detectBtn').disabled = !(f || $('#stegoText').value.trim());
  $('#scanBtn').disabled = !f;
  // In simple mode, always enable decode button if we have a file or text
  const hasInput = f || $('#stegoText').value.trim();
  $('#decodeBtn').disabled = !hasInput;
  $('#detected').textContent = '';
  $('#scanResults').textContent = '';
  $('#result').classList.add('hidden');
}

$('#stegoText').addEventListener('input', () => handleStegoChange($('#stegoInput').files[0] || null));

$('#detectBtn').addEventListener('click', async () => {
  const f = $('#stegoInput').files[0];
  const t = $('#stegoText').value.trim();
  $('#decodeProgress').classList.remove('hidden');
  $('#decodeProgress').textContent = 'Analyzing...';
  try {
    if (t) {
      detectedMethod = 'unicode';
    } else {
      const buf = new Uint8Array(await readAsArrayBuffer(f));
      if (hasGenericFooter(buf)) detectedMethod = 'generic';
      else if (sniffWavPcm16(buf.subarray(0, 44))) detectedMethod = 'audio';
      else if (await isImage(f)) detectedMethod = (/\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg') ? 'image_dct' : 'image';
      else detectedMethod = 'unknown';
    }
    $('#detected').textContent = detectedMethod ? `Detected: ${detectedMethod}` : '';
    $('#decodeBtn').disabled = detectedMethod === 'unknown';
  } catch {
    $('#detected').textContent = 'Detection failed.';
  } finally {
    $('#decodeProgress').classList.add('hidden');
  }
});

$('#decodeBtn').addEventListener('click', async () => {
  const t = $('#stegoText').value.trim();
  if (!detectedMethod) {
    if (t) { detectedMethod = 'unicode'; }
    else {
      const f = $('#stegoInput').files[0]; if (!f) return;
      const buf = new Uint8Array(await readAsArrayBuffer(f));
      if (hasGenericFooter(buf)) detectedMethod = 'generic';
      else if (sniffWavPcm16(buf.subarray(0, 44))) detectedMethod = 'audio';
      else if (await isImage(f)) detectedMethod = (/\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg') ? 'image_dct' : 'image';
      else detectedMethod = 'unknown';
    }
  }
  if (detectedMethod === 'unicode') {
    $('#decodeProgress').classList.remove('hidden');
    $('#decodeProgress').textContent = 'Extracting...';
    try {
      const asText = window.unicodeSteganographer.decodeText(t).hiddenText;
      if (asText && asText.length) {
        extractedBlob = new Blob([asText], { type: 'text/plain' });
      } else {
        const data = window.unicodeSteganographer.decodeBinary(t).hiddenData || new Uint8Array();
        if (!data.length) throw new Error('No payload found.');
        extractedBlob = new Blob([data], { type: 'application/octet-stream' });
      }
      showResult(extractedBlob);
    } catch(e) {
      $('#decodeProgress').textContent = `Error: ${e.message}`;
      $('#result').classList.add('hidden');
    } finally {
      setTimeout(() => $('#decodeProgress').classList.add('hidden'), 1200);
    }
    return;
  }
  const f = $('#stegoInput').files[0]; if (!f) return;
  $('#decodeProgress').classList.remove('hidden');
  $('#decodeProgress').textContent = 'Extracting...';
  try {
    const buf = new Uint8Array(await readAsArrayBuffer(f));
    let out;
    if (detectedMethod === 'generic') {
      out = genericExtract(buf);
    } else if (detectedMethod === 'audio') {
      out = decodeWavLSB(buf);
    } else if (detectedMethod === 'image' || detectedMethod === 'image_blue') {
      const url = URL.createObjectURL(f);
      out = await decodeImageLSB(url, detectedMethod === 'image_blue' ? 'blue' : 'rgb');
      URL.revokeObjectURL(url);
    } else if (detectedMethod === 'image_dct') {
      const url = URL.createObjectURL(f);
      out = await decodeImageDCT(url);
      URL.revokeObjectURL(url);
    }
    if (!out) throw new Error('No payload found or unsupported format.');
    const { payload, mime } = out;
    extractedBlob = new Blob([payload], { type: mime || 'application/octet-stream' });
    showResult(extractedBlob);
  } catch (e) {
    $('#decodeProgress').textContent = `Error: ${e.message}`;
    $('#result').classList.add('hidden');
  } finally {
    setTimeout(() => $('#decodeProgress').classList.add('hidden'), 1200);
  }
});

$('#scanBtn').addEventListener('click', async () => {
  const f = $('#stegoInput').files[0]; if (!f) return;
  $('#decodeProgress').classList.remove('hidden');
  $('#decodeProgress').textContent = 'Scanning...';
  try {
    const buf = new Uint8Array(await readAsArrayBuffer(f));
    const hits = scanMagic(buf);
    if (!hits.length) { $('#scanResults').textContent = 'No known signatures found.'; return; }
    const list = document.createElement('div');
    hits.forEach((h, i) => {
      const row = document.createElement('div');
      row.innerHTML = `${i+1}. ${h.type} at 0x${h.offset.toString(16)} (${bytesToHuman(h.sizeGuess)} est)`;
      const btn = document.createElement('button');
      btn.className = 'secondary'; btn.textContent = 'Extract';
      btn.addEventListener('click', () => {
        const slice = extractSlice(buf, h);
        downloadBlob(new Blob([slice], { type: h.mime || 'application/octet-stream' }), `${h.type.toLowerCase()}_${h.offset}.bin`);
      });
      row.appendChild(btn); list.appendChild(row);
    });
    $('#scanResults').innerHTML = ''; $('#scanResults').appendChild(list);
  } catch(e){ $('#scanResults').textContent = `Scan error: ${e.message}`; }
  finally { setTimeout(() => $('#decodeProgress').classList.add('hidden'), 500); }
});

function showResult(blob) {
  $('#result').classList.remove('hidden');
  const tryText = async () => {
    const head = new Uint8Array(await blob.slice(0, 2048).arrayBuffer());
    const txt = new TextDecoder('utf-8', { fatal: false }).decode(head);
    const printable = txt.replace(/[\x20-\x7E\r\n\t]/g,'').length;
    return printable <= head.length * 0.15;
  };
  const isText = /^text\/|application\/json/.test(blob.type);
  (isText ? Promise.resolve(true) : tryText()).then(async ok => {
    resultIsText = ok;
    if (ok) {
      resultTextCache = await readAsText(blob);
      $('#resultPreview').textContent = resultTextCache.slice(0, 100000);
      $('#copyText').disabled = false;
      $('#downloadTextAs').classList.remove('hidden');
    } else {
      resultTextCache = '';
      $('#resultPreview').textContent = `Binary payload • ${blob.type || 'application/octet-stream'} • ${bytesToHuman(blob.size)}`;
      $('#copyText').disabled = true;
      $('#downloadTextAs').classList.add('hidden');
    }
  });
}

$('#savePayload').addEventListener('click', () => {
  if (!extractedBlob) return;
  const ext = extFromMime(extractedBlob.type);
  downloadBlob(extractedBlob, `payload${ext}`);
});

$('#copyText').addEventListener('click', async () => {
  if (!extractedBlob) return;
  if (!(/^text\/|application\/json/.test(extractedBlob.type))) return;
  const t = await readAsText(extractedBlob);
  await navigator.clipboard.writeText(t);
});

$('#downloadTextAs').addEventListener('click', async () => {
  if (!resultIsText) return;
  const name = prompt('File name', 'secret.txt') || 'secret.txt';
  const blob = new Blob([resultTextCache], { type: 'text/plain' });
  downloadBlob(blob, name);
});

function extFromMime(m){
  if (/json/.test(m)) return '.json';
  if (/plain/.test(m)) return '.txt';
  if (/xml/.test(m)) return '.xml';
  if (/html/.test(m)) return '.html';
  return '';
}

function initDefaults() {
  // seed payload from URL ?text=
  const params = new URLSearchParams(location.search);
  const t = params.get('text');
  if (t) {
    $('input[name="payloadType"][value="text"]').checked = true;
    $('#payloadText').value = t;
    $('#payloadText').dispatchEvent(new Event('input'));
  }
}
initDefaults();

function updateMethodUI() {
  const isUnicode = getSelectedMethod() === 'unicode';
  const carrierDrop = document.querySelector('.dropzone[data-target="carrier"]');
  const carrierText = $('#carrierText');
  carrierDrop.classList.toggle('hidden', isUnicode);
  carrierText.classList.toggle('hidden', !isUnicode);
  if (isUnicode) {
    carrierFile = null;
    $('#carrierMeta').textContent = 'Carrier: using pasted text';
  } else {
    $('#carrierMeta').textContent = carrierFile ? `${carrierFile.name} • ${bytesToHuman(carrierFile.size)} • ${carrierFile.type || 'unknown'}` : '';
  }
  // In simple mode, force auto and hide capacity nuances
  if (document.body.classList.contains('mode-simple')) {
    const auto = document.querySelector('input[name="method"][value="auto"]');
    if (auto && !auto.checked) auto.checked = true;
  }
  updateCapacity();
  updateEncodeState();
}

methodRadios.forEach(r => r.addEventListener('change', updateMethodUI));
$('#carrierText').addEventListener('input', () => { updateCapacity(); updateEncodeState(); });
updateMethodUI();

async function displayWizardResult() {
  if (!wizardExtractedBlob) return;
  
  const isTextType = /^text\//.test(wizardExtractedBlob.type);
  const preview = $('#wizardResultPreview');
  const display = $('#wizardResultDisplay');
  
  // Try to determine if it's actually text content
  const head = new Uint8Array(await wizardExtractedBlob.slice(0, 2048).arrayBuffer());
  const txt = new TextDecoder('utf-8', { fatal: false }).decode(head);
  const printable = txt.replace(/[\x20-\x7E\r\n\t]/g,'').length;
  const seemsText = printable <= head.length * 0.15;
  
  if (isTextType || seemsText) {
    const text = await readAsText(wizardExtractedBlob);
    preview.textContent = text.slice(0, 100000); // Limit display
    $('#wizardCopyResult').style.display = 'inline-block';
    
    // Update success message
    $('#wizardSuccessTitle').textContent = 'Hidden text extracted!';
    $('#wizardSuccessText').textContent = 'The secret message has been successfully extracted.';
  } else {
    preview.textContent = `Binary file extracted\nType: ${wizardExtractedBlob.type}\nSize: ${bytesToHuman(wizardExtractedBlob.size)}`;
    $('#wizardCopyResult').style.display = 'none';
    
    // Update success message
    $('#wizardSuccessTitle').textContent = 'Hidden file extracted!';
    $('#wizardSuccessText').textContent = 'The secret file has been successfully extracted.';
  }
  
  display.classList.remove('hidden');
}