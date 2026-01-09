import { state } from "state";
import QRCode from "qrcode";

// Overlay Refs
const overlayCanvas = document.getElementById('overlayCanvas');
const subtabQr = document.getElementById('subtab-qr');
const subtabText = document.getElementById('subtab-text');
const panelQr = document.getElementById('panel-qr');
const panelText = document.getElementById('panel-text');

// Overlay Inputs
const qrEnableChk = document.getElementById('qrEnableChk');
const qrCornerSel = document.getElementById('qrCornerSel');
const qrUrlInput = document.getElementById('qrUrlInput');
const qrSizeRange = document.getElementById('qrSizeRange');
const qrMarginRange = document.getElementById('qrMarginRange');
const qrOpacityRange = document.getElementById('qrOpacityRange');

const textEnableChk = document.getElementById('textEnableChk');
const textPositionSel = document.getElementById('textPositionSel');
const textContentInput = document.getElementById('textContentInput');
const fontFamilySel = document.getElementById('fontFamilySel');
const fontColorInput = document.getElementById('fontColorInput');
const fontSizeRange = document.getElementById('fontSizeRange');
const lineHeightRange = document.getElementById('lineHeightRange');
const textMarginRange = document.getElementById('textMarginRange');
const neonGlowChk = document.getElementById('neonGlowChk');

const loadedFonts = new Set();

export function initOverlays() {
  // Tabs
  subtabQr.addEventListener('click', () => {
    subtabQr.setAttribute('aria-selected', 'true');
    subtabText.setAttribute('aria-selected', 'false');
    panelQr.style.display = 'block';
    panelText.style.display = 'none';
  });
  subtabText.addEventListener('click', () => {
    subtabQr.setAttribute('aria-selected', 'false');
    subtabText.setAttribute('aria-selected', 'true');
    panelQr.style.display = 'none';
    panelText.style.display = 'block';
  });

  // Live Update Wiring
  const inputs = [
    qrEnableChk, qrCornerSel, qrUrlInput, qrSizeRange, qrMarginRange, qrOpacityRange,
    textEnableChk, textPositionSel, textContentInput, fontFamilySel, fontColorInput,
    fontSizeRange, lineHeightRange, textMarginRange, neonGlowChk
  ];
  inputs.forEach(el => el.addEventListener('input', renderOverlayPreview));
}

function loadGoogleFont(family) {
  if (!family || loadedFonts.has(family)) return;
  const link = document.createElement('link');
  const urlFamily = family.replace(/ /g, '+');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${urlFamily}:wght@400;700;900&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(family);
}

export async function renderOverlaysToContext(ctx, width, height) {
  // 1. Draw Base Image
  if (state.croppedImageBitmap) {
    ctx.drawImage(state.croppedImageBitmap, 0, 0, width, height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0,0,width,height);
  }

  // Helper: Scale factor relative to 1000px canonical width
  const s = width / 1000;

  // 2. QR Code
  if (qrEnableChk.checked) {
    const url = (qrUrlInput.value || 'https://hideaudio.on.websim.com/').trim();
    const pct = Number(qrSizeRange.value) / 100;
    const side = Math.round(width * pct);
    const opacity = Number(qrOpacityRange.value) / 100;
    
    // Generate QR
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = side; qrCanvas.height = side;
    try {
      await QRCode.toCanvas(qrCanvas, url, {
         width: side, margin: 0,
         color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch(e) {}
    
    const margin = Number(qrMarginRange.value) * s; 
    let x = margin, y = margin;
    const corner = qrCornerSel.value;
    
    if (corner.includes('right')) x = width - margin - side;
    if (corner.includes('bottom')) y = height - margin - side;
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(qrCanvas, x, y);
    ctx.restore();
  }

  // 3. Text Overlay
  if (textEnableChk.checked) {
    const rawText = textContentInput.value;
    if (rawText.trim()) {
      const family = fontFamilySel.value || 'Inter';
      loadGoogleFont(family);
      
      const fontSizeRef = Number(fontSizeRange.value); 
      const actualFontSize = fontSizeRef * s;
      
      ctx.font = `700 ${actualFontSize}px "${family}", sans-serif`;
      ctx.fillStyle = fontColorInput.value;
      ctx.textBaseline = 'top';
      
      if (neonGlowChk.checked) {
        ctx.shadowColor = fontColorInput.value;
        ctx.shadowBlur = actualFontSize * 0.6;
      } else {
        ctx.shadowBlur = 0;
      }

      const lines = rawText.split('\n');
      const lh = (Number(lineHeightRange.value) / 100) * actualFontSize;
      
      let maxWidth = 0;
      lines.forEach(line => {
        const m = ctx.measureText(line);
        if (m.width > maxWidth) maxWidth = m.width;
      });
      const totalHeight = lines.length * lh;
      
      const margin = Number(textMarginRange.value) * s;
      const pos = textPositionSel.value;
      let x = margin, y = margin;
      
      if (pos.includes('right')) x = width - margin - maxWidth;
      else if (pos === 'center') x = (width - maxWidth) / 2;
      
      if (pos.includes('bottom')) y = height - margin - totalHeight;
      else if (pos === 'center') y = (height - totalHeight) / 2;
      
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + (i * lh));
      });
      
      ctx.shadowBlur = 0; 
    }
  }
}

export async function renderOverlayPreview() {
  const rect = overlayCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  overlayCanvas.width = rect.width * dpr;
  overlayCanvas.height = rect.height * dpr;
  
  const ctx = overlayCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  const w = rect.width;
  const h = rect.height;
  
  ctx.clearRect(0,0,w,h);
  await renderOverlaysToContext(ctx, w, h);
}