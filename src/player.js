import { prettyBytes } from "utils";

// Modal Refs
const playerModal = document.getElementById('playerModal');
const playerModalTitle = document.getElementById('playerModalTitle');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalImage = document.getElementById('modalImage');
const modalCarrierVideo = document.getElementById('modalCarrierVideo');
const modalCarrierAudioWrap = document.getElementById('modalCarrierAudioWrap');
const modalCarrierAudio = document.getElementById('modalCarrierAudio');
const modalCarrierFrame = document.getElementById('modalCarrierFrame');

// Content Containers
const modalAudio = document.getElementById('modalAudio');
const modalVideo = document.getElementById('modalVideo');
const modalImageViewer = document.getElementById('modalImageViewer');
const modalPdfViewer = document.getElementById('modalPdfViewer');
const modalTextViewer = document.getElementById('modalTextViewer');

// Controls
const modalPlayBtn = document.getElementById('modalPlayBtn');
const modalPauseBtn = document.getElementById('modalPauseBtn');
const modalLoopChk = document.getElementById('modalLoopChk');
const modalLoopLabel = document.getElementById('modalLoopLabel');
const modalDownloadLink = document.getElementById('modalDownloadLink');
const modalDownloadBtn = document.getElementById('modalDownloadBtn');
const modalMeta = document.getElementById('modalMeta');
const statusElement = document.getElementById('status');

let modalImageURL = null;
let modalContentURL = null;
let activeMediaElement = null;

export function initPlayer() {
  modalCloseBtn.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => { if (e.target === playerModal) closePlayerModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playerModal.classList.contains('open')) closePlayerModal(); });
  
  modalPlayBtn.addEventListener('click', () => activeMediaElement?.play());
  modalPauseBtn.addEventListener('click', () => activeMediaElement?.pause());
  modalLoopChk.addEventListener('change', () => { 
    if(activeMediaElement) activeMediaElement.loop = modalLoopChk.checked; 
  });
}

export function openPlayerModal(carrierUrl, carrierMime, contentURL, title, artist, mimeType, sizeBytes) {
  // Cleanup old URLs
  if (modalImageURL && modalImageURL !== carrierUrl) URL.revokeObjectURL(modalImageURL);
  if (modalContentURL && modalContentURL !== contentURL && modalContentURL) URL.revokeObjectURL(modalContentURL);

  modalImageURL = carrierUrl;
  
  // Reset Carrier Views
  modalImage.style.display = 'none';
  modalCarrierVideo.style.display = 'none';
  modalCarrierAudioWrap.style.display = 'none';
  modalCarrierFrame.style.display = 'none';
  modalCarrierVideo.pause();
  modalCarrierAudio.pause();

  // Set Carrier Preview
  const cMime = (carrierMime || '').toLowerCase();
  
  if (cMime.startsWith('video/')) {
    modalCarrierVideo.src = carrierUrl;
    modalCarrierVideo.style.display = 'block';
  } else if (cMime.startsWith('audio/')) {
    modalCarrierAudio.src = carrierUrl;
    modalCarrierAudioWrap.style.display = 'flex';
  } else if (cMime === 'application/pdf' || cMime.startsWith('text/')) {
    modalCarrierFrame.src = carrierUrl;
    modalCarrierFrame.style.display = 'block';
  } else if (carrierUrl) {
    // Default to image or fallback
    modalImage.src = carrierUrl;
    modalImage.style.display = 'block';
    modalImage.classList.remove('placeholder');
  } else {
    // No carrier URL provided
    modalImage.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='rgba(100,116,139,0.5)' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E";
    modalImage.style.display = 'block';
    modalImage.classList.add('placeholder');
  }

  // Set Title and Artist
  playerModalTitle.innerHTML = `
    <div style="line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title || 'Unknown'}</div>
    <div style="font-size:12px; font-weight:400; opacity:0.7; margin-top:2px;">${artist || ''}</div>
  `;

  if (contentURL) {
    updatePlayerModalContent(contentURL, mimeType, sizeBytes);
  } else {
    // Reset/Loading State
    resetMediaDisplay();
    modalMeta.innerHTML = '<span class="pulse">Extracting payload...</span>';
    modalDownloadLink.style.display = 'none';
  }

  playerModal.classList.add('open');
  playerModal.setAttribute('aria-hidden', 'false');
}

export function updatePlayerModalContent(url, mimeType, sizeBytes) {
  modalContentURL = url;
  resetMediaDisplay();
  
  const mime = (mimeType || '').toLowerCase();
  let typeLabel = 'File';

  if (mime.startsWith('audio/')) {
    typeLabel = 'Audio';
    modalAudio.src = url;
    modalAudio.style.display = 'block';
    activeMediaElement = modalAudio;
    showPlaybackControls();
    modalAudio.play().catch(() => {});
  } 
  else if (mime.startsWith('video/')) {
    typeLabel = 'Video';
    modalVideo.src = url;
    modalVideo.style.display = 'block';
    modalVideo.style.minHeight = '240px'; // Prevent collapse if metadata loads slowly
    activeMediaElement = modalVideo;
    showPlaybackControls();
    modalVideo.play().catch((e) => console.warn("Autoplay blocked:", e));
  } 
  else if (mime.startsWith('image/')) {
    typeLabel = 'Image';
    modalImageViewer.src = url;
    modalImageViewer.style.display = 'block';
  } 
  else if (mime === 'application/pdf') {
    typeLabel = 'PDF';
    modalPdfViewer.src = url;
    modalPdfViewer.style.display = 'block';
  }
  else if (mime.startsWith('text/') || mime === 'application/json' || mime.includes('xml')) {
    typeLabel = 'Text';
    modalTextViewer.style.display = 'block';
    fetch(url).then(r => r.text()).then(txt => {
      modalTextViewer.textContent = txt.slice(0, 50000) + (txt.length > 50000 ? '... (truncated)' : '');
    });
  } 
  else {
    modalMeta.textContent = `Binary Content (${mime}) • ${prettyBytes(sizeBytes || 0)}`;
  }

  // Common metadata and download button setup
  modalDownloadLink.style.display = 'inline-block';
  modalDownloadLink.href = url || '#';
  // Attempt to guess extension from mime if possible, though browser handles download attribute well
  const ext = mime.split('/')[1] || 'bin';
  modalDownloadLink.download = `extracted_${Date.now()}.${ext.replace(/;.*/, '')}`; 
  modalDownloadBtn.textContent = `Download ${typeLabel}`;
  
  if (mime) {
    modalMeta.textContent = `Content: ${mime} • Size: ${prettyBytes(sizeBytes || 0)}`;
  }
}

export function closePlayerModal() {
  if (activeMediaElement) activeMediaElement.pause();
  playerModal.classList.remove('open');
  playerModal.setAttribute('aria-hidden', 'true');
  resetMediaDisplay();
}

function resetMediaDisplay() {
  modalAudio.pause();
  modalVideo.pause();
  modalCarrierVideo.pause();
  modalCarrierAudio.pause();
  
  modalAudio.style.display = 'none';
  modalVideo.style.display = 'none';
  modalImageViewer.style.display = 'none';
  modalTextViewer.style.display = 'none';
  modalPdfViewer.style.display = 'none';
  
  modalPlayBtn.style.display = 'none';
  modalPauseBtn.style.display = 'none';
  modalLoopLabel.style.display = 'none';
  
  activeMediaElement = null;
  modalTextViewer.textContent = '';
}

function showPlaybackControls() {
  modalPlayBtn.style.display = 'inline-block';
  modalPauseBtn.style.display = 'inline-block';
  modalLoopLabel.style.display = 'inline-flex';
}