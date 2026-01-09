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
      
      card.innerHTML = `
        <img src="${post.image_url}" class="gallery-img" loading="lazy" alt="${post.title || 'Stego Song'}">
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
    // 1. Upload image to blob storage
    const url = await window.websim.upload(blob);
    // 2. Create record
    const record = await this.room.collection('stego_post').create({
      image_url: url,
      title: title || 'Untitled',
      artist: artist || 'Unknown Artist'
    });
    return record;
  }
}