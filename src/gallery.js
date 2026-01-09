export class Gallery {
  constructor(room, gridElement, onPlayCallback) {
    this.room = room;
    this.grid = gridElement;
    this.onPlay = onPlayCallback;
    this.posts = [];
    this.unsubscribe = null;
    this.activeFilter = 'all';
    
    // Create filter UI container
    this.filterContainer = document.getElementById('galleryFilters');
    if (!this.filterContainer) {
      // Fallback if not found in HTML (auto-create)
      this.filterContainer = document.createElement('div');
      this.filterContainer.className = 'gallery-filters';
      this.filterContainer.id = 'galleryFilters';
      this.grid.parentElement.insertBefore(this.filterContainer, this.grid);
    }

    // Edit Modal Elements
    this.editModal = document.getElementById('editModal');
    this.editTitleInput = document.getElementById('editTitle');
    this.editArtistInput = document.getElementById('editArtist');
    this.editSaveBtn = document.getElementById('editSaveBtn');
    this.editCloseBtn = document.getElementById('editCloseBtn');
    this.currentEditId = null;

    if (this.editModal) {
      this.editCloseBtn.onclick = () => this.closeEditModal();
      this.editSaveBtn.onclick = () => this.saveEdit();
      // Click outside to close
      this.editModal.onclick = (e) => { if (e.target === this.editModal) this.closeEditModal(); };
    }
  }

  async init() {
    this.currentUser = await window.websim.getCurrentUser();
    this.creator = await window.websim.getCreatedBy();

    // Subscribe to latest posts (newest first usually)
    // WebsimSocket.collection.getList returns records.
    this.unsubscribe = this.room.collection('stego_post').subscribe((records) => {
      // sort by created_at desc if not already
      this.posts = records.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      this.renderFilters();
      this.render();
    });
  }

  getSimleType(mime) {
    if (!mime) return 'File';
    if (mime.startsWith('image/')) return 'Image';
    if (mime.startsWith('audio/')) return 'Audio';
    if (mime.startsWith('video/')) return 'Video';
    if (mime.startsWith('text/')) return 'Text';
    return 'File';
  }

  renderFilters() {
    const counts = { 'all': 0 };
    
    // Calculate counts for dynamic filters
    this.posts.forEach(p => {
      counts.all++;
      const outType = this.getSimleType(p.mime_type);
      const inType = this.getSimleType(p.payload_type);
      const key = `${outType} → ${inType}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    const filters = [
      { id: 'all', label: 'All Files' },
      { id: 'Image → Audio', label: 'Image → Audio' },
      { id: 'Image → Video', label: 'Image → Video' },
      { id: 'Video → Audio', label: 'Video → Audio' },
      { id: 'Audio → Audio', label: 'Audio → Audio' }
    ];

    // Add any other existing combos that aren't standard
    Object.keys(counts).forEach(k => {
      if (k !== 'all' && !filters.find(f => f.id === k)) {
        if (counts[k] > 0) filters.push({ id: k, label: k });
      }
    });

    let html = '';
    filters.forEach(f => {
      if (counts[f.id] > 0 || f.id === 'all') {
        const active = this.activeFilter === f.id ? 'active' : '';
        html += `<button class="filter-pill ${active}" data-filter="${f.id}">${f.label} <span class="count">${counts[f.id] || 0}</span></button>`;
      }
    });

    this.filterContainer.innerHTML = html;
    
    this.filterContainer.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => {
        this.activeFilter = btn.dataset.filter;
        this.renderFilters(); // Re-render to update active state
        this.render();
      };
    });
  }

  render() {
    this.grid.innerHTML = '';
    
    const filteredPosts = this.activeFilter === 'all' 
      ? this.posts 
      : this.posts.filter(p => {
          const outType = this.getSimleType(p.mime_type);
          const inType = this.getSimleType(p.payload_type);
          return `${outType} → ${inType}` === this.activeFilter;
        });

    if (filteredPosts.length === 0) {
      this.grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">
          No files found for this filter.
        </div>`;
      return;
    }
    
    filteredPosts.forEach(post => {
      const cardWrap = document.createElement('div');
      cardWrap.className = 'gallery-card-wrap'; // Wrapper for layout
      
      const card = document.createElement('div');
      card.className = 'gallery-card-media'; // Inner media container
      
      const avatar = post.username ? `https://images.websim.com/avatar/${post.username}` : null;
      const fileUrl = post.file_url || post.image_url;
      const mime = post.mime_type || 'image/png';
      
      const outType = this.getSimleType(post.mime_type);
      const inType = this.getSimleType(post.payload_type);
      
      let previewHtml;
      
      // Visual Badge Logic
      const payloadType = post.payload_type || '';
      let badgeHtml = '';
      if (payloadType.startsWith('video/')) {
        badgeHtml = `<div class="gallery-type-badge">🎬 Video</div>`;
      } else if (payloadType.startsWith('audio/')) {
        badgeHtml = `<div class="gallery-type-badge">🎵 Audio</div>`;
      } else if (payloadType.startsWith('text/')) {
        badgeHtml = `<div class="gallery-type-badge">📝 Text</div>`;
      } else if (payloadType && !payloadType.startsWith('application/octet-stream')) {
        badgeHtml = `<div class="gallery-type-badge">📁 File</div>`;
      }

      if (mime.startsWith('image/')) {
        previewHtml = `<img src="${fileUrl}" class="gallery-img" loading="lazy" alt="${post.title || 'Stego Media'}">`;
      } else if (mime.startsWith('video/')) {
        previewHtml = `<video src="${fileUrl}" class="gallery-img" muted loop playsinline style="object-fit:cover;"></video>
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

      // Check permissions
      const isOwner = this.currentUser && post.username === this.currentUser.username;
      const isAdmin = this.creator && this.currentUser && this.creator.username === this.currentUser.username;
      let controlsHtml = '';
      if (isOwner || isAdmin) {
        controlsHtml = `
          <div class="gallery-controls">
            ${isOwner ? `<button class="gallery-btn-edit" title="Edit Info">✏️</button>` : ''}
            <button class="gallery-btn-delete" title="Delete Post">🗑️</button>
          </div>
        `;
      }

      card.innerHTML = `
        ${previewHtml}
        ${badgeHtml}
        <div class="gallery-play-icon"></div>
      `;
      
      const artistDisplay = post.artist ? `${post.artist} <span style="opacity:0.6;font-size:10px;">(@${post.username})</span>` : post.username || 'Anonymous';

      const details = document.createElement('div');
      details.className = 'gallery-details';
      details.innerHTML = `
        <div class="gallery-row-main">
           <div class="gallery-title" title="${post.title || 'Untitled'}">${post.title || 'Untitled'}</div>
        </div>
        <div class="gallery-meta-row">
           <div class="gallery-artist">
              ${avatar ? `<img src="${avatar}" class="gallery-avatar" alt="">` : '<div class="gallery-avatar-placeholder"></div>'}
              <span>${artistDisplay}</span>
           </div>
        </div>
        <div class="gallery-types">
           <span class="type-tag">${outType}</span>
           <span class="type-arrow">→</span>
           <span class="type-tag highlight">${inType}</span>
        </div>
        ${controlsHtml}
      `;

      cardWrap.appendChild(card);
      cardWrap.appendChild(details);
      
      const vid = card.querySelector('video');
      if (vid) {
        card.addEventListener('mouseenter', () => {
          const p = vid.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        });
        card.addEventListener('mouseleave', () => {
          vid.pause();
          try { vid.currentTime = 0; } catch(e){}
        });
      }

      // Interaction Logic
      const editBtn = details.querySelector('.gallery-btn-edit');
      const delBtn = details.querySelector('.gallery-btn-delete');

      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          this.openEditModal(post);
        };
      }
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (confirm('Are you sure you want to delete this file?')) {
            this.room.collection('stego_post').delete(post.id);
          }
        };
      }

      cardWrap.onclick = (e) => {
        // Don't open if clicked on controls
        if (e.target.closest('.gallery-controls')) return;
        this.onPlay(post);
      };
      
      this.grid.appendChild(cardWrap);
    });
  }

  openEditModal(post) {
    this.currentEditId = post.id;
    this.editTitleInput.value = post.title || '';
    this.editArtistInput.value = post.artist || '';
    this.editModal.classList.add('open');
    this.editModal.setAttribute('aria-hidden', 'false');
  }

  closeEditModal() {
    this.editModal.classList.remove('open');
    this.editModal.setAttribute('aria-hidden', 'true');
    this.currentEditId = null;
  }

  async saveEdit() {
    if (!this.currentEditId) return;
    const title = this.editTitleInput.value;
    const artist = this.editArtistInput.value;
    
    this.editSaveBtn.disabled = true;
    this.editSaveBtn.textContent = 'Saving...';
    try {
      await this.room.collection('stego_post').update(this.currentEditId, {
        title, artist
      });
      this.closeEditModal();
    } catch(e) {
      alert('Error updating: ' + e.message);
    } finally {
      this.editSaveBtn.disabled = false;
      this.editSaveBtn.textContent = 'Save Changes';
    }
  }

  async uploadPost(blob, title, artist, payloadType) {
    // 1. Upload file to blob storage
    const url = await window.websim.upload(blob);
    // 2. Create record
    const record = await this.room.collection('stego_post').create({
      file_url: url,
      image_url: url, // Fallback for legacy
      title: title || 'Untitled',
      artist: artist || 'Unknown Artist',
      mime_type: blob.type || 'application/octet-stream',
      payload_type: payloadType || 'application/octet-stream'
    });
    return record;
  }
}