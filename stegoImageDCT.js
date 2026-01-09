// Minimal JPEG DCT stego (experimental): embeds bits into mid-frequency AC coefficients on 8x8 luminance blocks
const MAGIC = new TextEncoder().encode('SDCT1');

export async function estimateImageDCTCapacity(imgUrl) {
  const img = await loadImage(imgUrl);
  const blocks = Math.floor(img.width/8) * Math.floor(img.height/8);
  return Math.max(0, blocks * 8); // ~8 bits per block (mid-band ACs)
}

export async function encodeImageDCT(imgUrl, payloadBytes, mime='application/octet-stream') {
  const img = await loadImage(imgUrl);
  const { canvas, ctx } = makeCanvas(img);
  const { Y, w, h } = rgbToY(canvas, ctx);
  const meta = buildHeader(mime, payloadBytes.length);
  const stream = concat(MAGIC, meta, payloadBytes);
  const bits = bytesToBits(stream);
  let bi = 0;
  for (let by=0; by+7<h; by+=8) {
    for (let bx=0; bx+7<w; bx+=8) {
      const block = getBlock(Y, w, bx, by);
      const d = dct2(block);
      const idx = [[1,2],[2,1],[2,2],[1,3],[3,1],[2,3],[3,2],[3,3]]; // mid-band
      for (const [u,v] of idx) {
        if (bi >= bits.length) break;
        const q = Math.round(d[u][v]);
        d[u][v] = (q & ~1) | bits[bi++];
      }
      const r = idct2(d);
      putBlock(Y, w, bx, by, r);
      if (bi >= bits.length) break;
    }
    if (bi >= bits.length) break;
  }
  const outImg = yToRgb(canvas, ctx, Y, w, h);
  return await canvasToJpeg(outImg);
}

export async function decodeImageDCT(imgUrl) {
  const img = await loadImage(imgUrl);
  const { canvas, ctx } = makeCanvas(img);
  const { Y, w, h } = rgbToY(canvas, ctx);
  const bits = [];
  for (let by=0; by+7<h; by+=8) {
    for (let bx=0; bx+7<w; bx+=8) {
      const block = getBlock(Y, w, bx, by);
      const d = dct2(block);
      const idx = [[1,2],[2,1],[2,2],[1,3],[3,1],[2,3],[3,2],[3,3]];
      for (const [u,v] of idx) bits.push(Math.abs(Math.round(d[u][v])) & 1);
    }
  }
  const bytes = bitsToBytes(bits);
  if (!startsWith(bytes, MAGIC)) return null;
  let off = MAGIC.length;
  const mimeLen = (bytes[off]<<8)|bytes[off+1]; off+=2;
  const mime = new TextDecoder().decode(bytes.subarray(off, off+mimeLen)); off+=mimeLen;
  const len = (bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|(bytes[off+3]); off+=4;
  const payload = bytes.subarray(off, off+len);
  if (payload.length !== len) return null;
  return { payload, mime };
}

/* helpers */
function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.decoding='async';i.src=url;});}
function makeCanvas(img){const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);return {canvas:c,ctx};}
function rgbToY(canvas, ctx){const d=ctx.getImageData(0,0,canvas.width,canvas.height);const p=d.data;const Y=new Float64Array(canvas.width*canvas.height);for(let i=0,j=0;i<p.length;i+=4,j++){Y[j]=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];}return {Y,w:canvas.width,h:canvas.height};}
function yToRgb(canvas, ctx, Y, w, h){const d=ctx.getImageData(0,0,w,h);const p=d.data;for(let i=0,j=0;i<p.length;i+=4,j++){const y=Math.max(0,Math.min(255,Math.round(Y[j])));p[i]=y;p[i+1]=y;p[i+2]=y;}ctx.putImageData(d,0,0);return canvas;}
function getBlock(Y,w,bx,by){const B=Array.from({length:8},()=>Array(8).fill(0));for(let y=0;y<8;y++)for(let x=0;x<8;x++)B[y][x]=Y[(by+y)*w+(bx+x)]-128;return B;}
function putBlock(Y,w,bx,by,B){for(let y=0;y<8;y++)for(let x=0;x<8;x++){Y[(by+y)*w+(bx+x)]=B[y][x]+128;}}
function dct2(B){const N=8;const C=Array.from({length:N},()=>Array(N).fill(0));for(let u=0;u<N;u++)for(let v=0;v<N;v++){let s=0;for(let y=0;y<N;y++)for(let x=0;x<N;x++)s+=B[y][x]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16);const cu=u?1:1/Math.SQRT2;const cv=v?1:1/Math.SQRT2;C[u][v]=0.25*cu*cv*s;}return C;}
function idct2(C){const N=8;const B=Array.from({length:N},()=>Array(N).fill(0));for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0;for(let u=0;u<N;u++)for(let v=0;v<N;v++){const cu=u?1:1/Math.SQRT2;const cv=v?1:1/Math.SQRT2;s+=cu*cv*C[u][v]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16);}B[y][x]=0.25*s;}return B;}
function canvasToJpeg(canvas){return new Promise(res=>canvas.toBlob(async b=>res(new Uint8Array(await b.arrayBuffer())),'image/jpeg',0.92));}
function concat(...arrs){const t=arrs.reduce((a,b)=>a+b.length,0);const o=new Uint8Array(t);let i=0;for(const a of arrs){o.set(a,i);i+=a.length;}return o;}
function bytesToBits(bytes){const out=new Array(bytes.length*8);let i=0;for(const b of bytes)for(let k=7;k>=0;k--)out[i++]=(b>>k)&1;return out;}
function bitsToBytes(bits){const len=Math.floor(bits.length/8);const out=new Uint8Array(len);for(let i=0;i<len;i++){let v=0;for(let k=0;k<8;k++)v=(v<<1)|bits[i*8+k];out[i]=v;}return out;}
function startsWith(buf,prefix){if(buf.length<prefix.length)return false;for(let i=0;i<prefix.length;i++)if(buf[i]!==prefix[i])return false;return true;}
function buildHeader(mime,len){const m=new TextEncoder().encode(mime);const h=new Uint8Array(2+m.length+4);h[0]=(m.length>>8)&255;h[1]=m.length&255;h.set(m,2);h[2+m.length]=(len>>>24)&255;h[3+m.length]=(len>>>16)&255;h[4+m.length]=(len>>>8)&255;h[5+m.length]=len&255;return h;}