import { prettyBytes } from "utils";

// Modal Refs
const playerModal = document.getElementById('playerModal');
const playerModalTitle = document.getElementById('playerModalTitle');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalImage = document.getElementById('modalImage');
const modalAudio = document.getElementById('modalAudio');
const modalPlayBtn = document.getElementById('modalPlayBtn');
const modalPauseBtn = document.getElementById('modalPauseBtn');
const modalLoopChk = document.getElementById('modalLoopChk');
const modalDownloadLink = document.getElementById('modalDownloadLink');
const modalMeta = document.getElementById('modalMeta');
const statusElement = document.getElementById('status');

let modalImageURL = null;
let modalAudioURL = null;

export function initPlayer() {
  modalCloseBtn.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => { if (e.target === playerModal) closePlayerModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playerModal.classList.contains('open')) closePlayerModal(); });
  modalPlayBtn.addEventListener('click', () => modalAudio.play());
  modalPauseBtn.addEventListener('click', () => modalAudio.pause());
  modalLoopChk.addEventListener('change', () => { modalAudio.loop = modalLoopChk.checked; });
}

export function openPlayerModal(imageURL, audioURL, title, artist, mimeType, sizeBytes) {
  // Cleanup old URLs if changing
  if (modalImageURL && modalImageURL !== imageURL) URL.revokeObjectURL(modalImageURL);
  if (modalAudioURL && modalAudioURL !== audioURL && modalAudioURL) URL.revokeObjectURL(modalAudioURL);

  modalImageURL = imageURL;
  modalImage.src = imageURL || '';

  // Set Title and Artist Display
  playerModalTitle.innerHTML = `
    <div style="line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 90%;">${title || 'Unknown'}</div>
    <div style="font-size:12px; font-weight:400; opacity:0.7; margin-top:2px;">${artist || ''}</div>
  `;

  if (audioURL) {
    setupContentInModal(audioURL, mimeType, sizeBytes);
  } else {
    // Loading State
    modalAudioURL = null;
    modalAudio.removeAttribute('src');
    modalAudio.style.opacity = '0.5';
    modalPlayBtn.disabled = true;
    modalPauseBtn.disabled = true;
    modalMeta.innerHTML = '<span class="pulse">Extracting audio from image...</span>';
    modalDownloadLink.style.display = 'none';
  }

  playerModal.classList.add('open');
  playerModal.setAttribute('aria-hidden', 'false');
}

export function updatePlayerModalAudio(audioURL, mimeType, sizeBytes) {
  setupContentInModal(audioURL, mimeType, sizeBytes);
}

export function closePlayerModal() {
  modalAudio.pause();
  playerModal.classList.remove('open');
  playerModal.setAttribute('aria-hidden', 'true');
}

function setupContentInModal(url, mimeType, sizeBytes) {
  modalAudioURL = url;
  
  const isAudio = mimeType && mimeType.startsWith('audio/');
  
  if (isAudio) {
      modalAudio.src = url;
      modalAudio.style.display = 'block';
      modalAudio.style.opacity = '1';
      modalPlayBtn.style.display = 'inline-block';
      modalPauseBtn.style.display = 'inline-block';
      modalLoopChk.parentElement.style.display = 'inline-flex';
      
      modalAudio.play().catch(() => {
        if(statusElement) statusElement.textContent = 'Decoded. Press Play to start.';
      });
  } else {
      // Non-audio content
      modalAudio.style.display = 'none';
      modalPlayBtn.style.display = 'none';
      modalPauseBtn.style.display = 'none';
      modalLoopChk.parentElement.style.display = 'none';
      
      modalAudio.pause();
  }

  modalDownloadLink.style.display = 'inline-block';
  modalDownloadLink.href = url || '#';
  modalDownloadLink.download = 'extracted_file'; // Helper
  
  modalMeta.textContent = `Content: ${mimeType || 'Unknown'} • Size: ${prettyBytes(sizeBytes || 0)}`;
}