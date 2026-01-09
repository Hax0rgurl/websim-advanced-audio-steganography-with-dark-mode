import { initTheme } from "theme";
import { initWizard } from "wizard";
import { initCrop } from "crop";
import { initOverlays } from "overlays";
import { initEncode } from "encode";
import { initDecode, decodeStegoBlob } from "decode";
import { initPlayer, openPlayerModal, updatePlayerModalAudio } from "player";
import { Gallery } from "gallery";

// Initialize WebsimSocket
const room = new WebsimSocket();
room.initialize();

// Initialize Modules
initTheme();
initWizard();
initCrop();
initOverlays();
initDecode();
initPlayer();

// Gallery Setup
const galleryGrid = document.getElementById('galleryGrid');
const statusElement = document.getElementById('status');
const modalMeta = document.getElementById('modalMeta');

const gallery = new Gallery(room, galleryGrid, async (post) => {
  const fileUrl = post.file_url || post.image_url;
  const mime = post.mime_type || 'image/png';
  const displayImage = mime.startsWith('image/') ? fileUrl : null;

  openPlayerModal(
    displayImage, 
    null, 
    post.title || 'Untitled', 
    post.artist || 'Unknown Artist',
    null, 0
  );

  try {
    statusElement.textContent = `Loading "${post.title}"...`;
    
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    
    const result = await decodeStegoBlob(blob);
    
    updatePlayerModalAudio(result.url, result.mimeType, result.size);
    statusElement.textContent = `Playing "${post.title}".`;
  } catch (e) {
    console.error(e);
    statusElement.textContent = `Error playing song: ${e.message}`;
    if(modalMeta) modalMeta.innerHTML = `<span style="color:var(--vw-pink)">Error: ${e.message}</span>`;
  }
});
gallery.init();

// Pass references to encode module
initEncode(room, gallery);


// Top Level Tabs Logic
(function initTabs(){
  const tabs = [
    {tab: document.getElementById('tab-home'), panel: document.getElementById('panel-home'), key: 'home'},
    {tab: document.getElementById('tab-encode'), panel: document.getElementById('panel-encode'), key: 'encode'},
    {tab: document.getElementById('tab-decode'), panel: document.getElementById('panel-decode'), key: 'decode'},
    {tab: document.getElementById('tab-gallery'), panel: document.getElementById('panel-gallery'), key: 'gallery'},
  ];
  function activate(targetKey) {
    tabs.forEach(({tab, panel, key}) => {
      const active = key === targetKey;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      panel.classList.toggle('active', active);
    });
    localStorage.setItem('astg-tab', targetKey);
  }
  tabs.forEach(({tab, key}) => {
    tab.addEventListener('click', () => activate(key));
  });
  const pref = localStorage.getItem('astg-tab');
  activate(pref || 'home');

  const goEncodeBtn = document.getElementById('goEncodeBtn');
  const goGalleryBtn = document.getElementById('goGalleryBtn');
  if (goEncodeBtn) goEncodeBtn.onclick = () => activate('encode');
  if (goGalleryBtn) goGalleryBtn.onclick = () => activate('gallery');
})();