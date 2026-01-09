// Canvas-based Image LSB (legacy style) using 2 LSBs per RGB channel
const MAGIC = new TextEncoder().encode('SIMG2');

export async function estimateImageCapacity(imgUrl) {
  const img = await loadImage(imgUrl);
  // 3 channels * 2 bits per channel = 6 bits per pixel
  return img.width * img.height * 6;
}

export async function encodeImageLSB(imgUrl, payloadBytes, mime='application/octet-stream') {
  const img = await loadImage(imgUrl);
  const { canvas, ctx } = makeCanvas(img);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data; // RGBA
  const header = buildHeader(mime, payloadBytes.length);
  const stream = concat(MAGIC, header, payloadBytes);
  const bits = bytesToBits(stream);
  const capacityBits = Math.floor(pixels.length / 4) * 6; // RGB only, 2 bits each
  if (bits.length > capacityBits) throw new Error('Payload too large for this image.');
  let bi = 0;
  for (let i = 0; i < pixels.length && bi < bits.length; i += 4) {
    for (let c = 0; c < 3 && bi < bits.length; c++) {
      const b0 = bits[bi++] || 0;
      const b1 = bits[bi++] || 0;
      pixels[i + c] = (pixels[i + c] & 0b11111100) | (b0 << 1) | b1;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return await canvasToPngBytes(canvas);
}

export async function decodeImageLSB(imgUrl) {
  const img = await loadImage(imgUrl);
  const { canvas, ctx } = makeCanvas(img);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const bits = [];
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = pixels[i + c] & 0b11;
      bits.push((v >> 1) & 1, v & 1);
    }
  }
  const bytes = bitsToBytes(bits);
  if (!startsWith(bytes, MAGIC)) return null;
  let off = MAGIC.length;
  const mimeLen = (bytes[off] << 8) | bytes[off+1]; off += 2;
  const mime = new TextDecoder().decode(bytes.subarray(off, off+mimeLen)); off += mimeLen;
  const len = (bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|(bytes[off+3]); off += 4;
  const payload = bytes.subarray(off, off + len);
  if (payload.length !== len) return null;
  return { payload, mime };
}

/* helpers */
function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.decoding='async';i.src=url;});}
function makeCanvas(img){const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);return {canvas:c,ctx};}
function canvasToPngBytes(canvas){return new Promise(res=>canvas.toBlob(async b=>res(new Uint8Array(await b.arrayBuffer())),'image/png'));}

function buildHeader(mime, len){const m=new TextEncoder().encode(mime);const h=new Uint8Array(2+m.length+4);h[0]=(m.length>>8)&255;h[1]=m.length&255;h.set(m,2);h[2+m.length]=(len>>>24)&255;h[3+m.length]=(len>>>16)&255;h[4+m.length]=(len>>>8)&255;h[5+m.length]=len&255;return h;}
function concat(...arrs){const t=arrs.reduce((a,b)=>a+b.length,0);const o=new Uint8Array(t);let i=0;for(const a of arrs){o.set(a,i);i+=a.length;}return o;}
function bytesToBits(bytes){const out=new Array(bytes.length*8);let i=0;for(const b of bytes)for(let k=7;k>=0;k--)out[i++]=(b>>k)&1;return out;}
function bitsToBytes(bits){const len=Math.floor(bits.length/8);const out=new Uint8Array(len);for(let i=0;i<len;i++){let v=0;for(let k=0;k<8;k++)v=(v<<1)|bits[i*8+k];out[i]=v;}return out;}
function startsWith(buf,prefix){if(buf.length<prefix.length)return false;for(let i=0;i<prefix.length;i++)if(buf[i]!==prefix[i])return false;return true;}