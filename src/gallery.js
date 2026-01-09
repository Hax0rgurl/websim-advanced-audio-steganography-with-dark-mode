export class Gallery {
  constructor(room, gridElement, onPlayCallback) {
    this.room = room;
    this.grid = gridElement;
    this.onPlay = onPlayCallback;
    this.posts = [];
    this.unsubscribe = null;
  }

  async init() {
    // Subscribe to latest posts (newest first usually)
    // WebsimSocket.collection.getList returns records.
    this.unsubscribe = this.room.collection('stego_post').subscribe((records) => {
      // sort by created_at desc if not already
      this.posts = records.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      this.render();
    });
  }

  render() {
    this.grid.innerHTML = '';
    if (this.posts.length === 0) {
      this.grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">
          No songs posted yet. Be the first to share your hidden audio!
        </div>`;
      return;
    }
    
    this.posts.forEach(post => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const avatar = post.username ? `https://images.websim.com/avatar/${post.username}` : null;
      const fileUrl = post.file_url || post.image_url;
      const mime = post.mime_type || 'image/png';
      
      let previewHtml;
      if (mime.startsWith('image/')) {
        previewHtml = `<img src="${fileUrl}" class="gallery-img" loading="lazy" alt="${post.title || 'Stego Media'}">`;
      } else if (mime.startsWith('video/')) {
        previewHtml = `<video src="${fileUrl}" class="gallery-img" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()" style="object-fit:cover;"></video>
        <div class="gallery-play-icon" style="pointer-events:none;"></div>`;
      } else if (mime.startsWith('audio/')) {
        previewHtml = `<div class="gallery-generic-preview audio">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
        </div>`;
      } else if (mime === 'application/pdf') {
        previewHtml = `<div class="gallery-generic-preview pdf" style="color:#ef4444;">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 9h6m-6 4h6m-6 4h4" /></svg>
        </div>`;
      } else if (mime.startsWith('text/')) {
        previewHtml = `<div class="gallery-generic-preview text" style="color:#a78bfa;">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7" /></svg>
        </div>`;
      } else {
        previewHtml = `<div class="gallery-generic-preview file">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        </div>`;
      }

      card.innerHTML = `
        ${previewHtml}
        <div class="gallery-play-icon"></div>
        <div class="gallery-overlay">
          <div class="gallery-info">
            <div class="gallery-title">${post.title || 'Untitled'}</div>
            <div class="gallery-artist">
              ${avatar ? `<img src="${avatar}" class="gallery-avatar" alt="">` : ''}
              ${post.artist || post.username || 'Anonymous'}
            </div>
          </div>
        </div>
      `;
      card.onclick = () => this.onPlay(post);
      this.grid.appendChild(card);
    });
  }

  async uploadPost(blob, title, artist) {
    // 1. Upload file to blob storage
    const url = await window.websim.upload(blob);
    // 2. Create record
    const record = await this.room.collection('stego_post').create({
      file_url: url,
      image_url: url, // Fallback for legacy
      title: title || 'Untitled',
      artist: artist || 'Unknown Artist',
      mime_type: blob.type || 'application/octet-stream'
    });
    return record;
  }
}