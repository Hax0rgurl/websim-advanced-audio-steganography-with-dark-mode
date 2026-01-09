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
    if (mime === 'application/pdf') return 'PDF';
    return 'File';
  }

  renderFilters() {
    // We filter by carrier type primarily
    const counts = { 'all': 0, 'Image': 0, 'Video': 0, 'Audio': 0, 'File': 0 };
    
    this.posts.forEach(p => {
      counts.all++;
      const outType = this.getSimleType(p.mime_type);
      // Simplify 'PDF', 'Text' -> 'File' for the main filter if needed, 
      // but 'getSimleType' already categorizes decently.
      const cat = ['Image','Video','Audio'].includes(outType) ? outType : 'File';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const filters = [
      { id: 'all', label: 'All Files' },
      { id: 'Image', label: 'Photos' },
      { id: 'Video', label: 'Videos' },
      { id: 'Audio', label: 'Audio' },
      { id: 'File', label: 'Docs/Files' }
    ];

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
        this.renderFilters(); 
        this.render();
      };
    });
  }

  render() {
    this.grid.innerHTML = '';
    
    let displayGroups = []; // Array of { title: 'Photos', posts: [] }

    if (this.activeFilter === 'all') {
      // Group them for 'All' view
      const groups = {
        'Photos': [],
        'Videos': [],
        'Audio': [],
        'Documents & Files': []
      };
      
      this.posts.forEach(p => {
        const type = this.getSimleType(p.mime_type);
        if (type === 'Image') groups['Photos'].push(p);
        else if (type === 'Video') groups['Videos'].push(p);
        else if (type === 'Audio') groups['Audio'].push(p);
        else groups['Documents & Files'].push(p);
      });

      // Define order
      ['Photos', 'Videos', 'Audio', 'Documents & Files'].forEach(key => {
        if (groups[key].length > 0) {
          displayGroups.push({ title: key, posts: groups[key] });
        }
      });
    } else {
      // Single flattened list for specific filter
      const typeMap = { 'Image': 'Image', 'Video': 'Video', 'Audio': 'Audio', 'File': 'File' };
      const target = typeMap[this.activeFilter];
      
      const posts = this.posts.filter(p => {
        const t = this.getSimleType(p.mime_type);
        if (this.activeFilter === 'File') return !['Image','Video','Audio'].includes(t);
        return t === this.activeFilter;
      });
      
      if (posts.length > 0) displayGroups.push({ title: null, posts }); // No header needed if just one list
    }

    if (displayGroups.length === 0) {
      this.grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">
          No files found.
        </div>`;
      return;
    }

    displayGroups.forEach(group => {
      // Render Section Header if title exists
      if (group.title) {
        const header = document.createElement('h3');
        header.className = 'gallery-section-header';
        header.textContent = group.title;
        this.grid.appendChild(header);
      }

      // Render Cards
      group.posts.forEach(post => {
        this.renderCard(post);
      });
    });
  }

  renderCard(post) {
    const cardWrap = document.createElement('div');
    cardWrap.className = 'gallery-card-wrap'; 
    
    const card = document.createElement('div');
    card.className = 'gallery-card-media';
    
    const avatar = post.username ? `https://images.websim.com/avatar/${post.username}` : null;
    const fileUrl = post.file_url || post.image_url;
    const mime = post.mime_type || 'image/png';
    
    const outType = this.getSimleType(post.mime_type);
    const inType = this.getSimleType(post.payload_type);
    
    let previewHtml;
    
    // Badge
    const payloadType = post.payload_type || '';
    let badgeHtml = '';
    if (payloadType.startsWith('video/')) badgeHtml = `<div class="gallery-type-badge">🎬 Video</div>`;
    else if (payloadType.startsWith('audio/')) badgeHtml = `<div class="gallery-type-badge">🎵 Audio</div>`;
    else if (payloadType.startsWith('text/')) badgeHtml = `<div class="gallery-type-badge">📝 Text</div>`;
    else if (payloadType.startsWith('image/')) badgeHtml = `<div class="gallery-type-badge">🖼️ Image</div>`;
    else if (payloadType === 'application/pdf') badgeHtml = `<div class="gallery-type-badge">📄 PDF</div>`;
    else if (payloadType && !payloadType.startsWith('application/octet-stream')) badgeHtml = `<div class="gallery-type-badge">📁 File</div>`;

    // Preview
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

    // Permissions
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

    card.innerHTML = `${previewHtml}${badgeHtml}<div class="gallery-play-icon"></div>`;
    
    // Details Layout: Title -> Artist -> Username
    let artistRow = '';
    if (post.artist && post.artist.trim()) {
      artistRow = `<div class="gallery-artist-row">${post.artist}</div>`;
    }

    const details = document.createElement('div');
    details.className = 'gallery-details';
    details.innerHTML = `
      <div class="gallery-row-main">
         <div class="gallery-title" title="${post.title || 'Untitled'}">${post.title || 'Untitled'}</div>
      </div>
      ${artistRow}
      <div class="gallery-meta-row">
         <div class="gallery-user">
            ${avatar ? `<img src="${avatar}" class="gallery-avatar" alt="">` : '<div class="gallery-avatar-placeholder"></div>'}
            <span>@${post.username}</span>
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
    
    // Video hover logic
    const vid = card.querySelector('video');
    if (vid) {
      card.addEventListener('mouseenter', () => { const p=vid.play(); if(p&&typeof p.catch==='function')p.catch(()=>{}); });
      card.addEventListener('mouseleave', () => { vid.pause(); try{vid.currentTime=0;}catch(e){} });
    }

    // Controls
    const editBtn = details.querySelector('.gallery-btn-edit');
    const delBtn = details.querySelector('.gallery-btn-delete');
    if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); this.openEditModal(post); };
    if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); if (confirm('Delete this file?')) this.room.collection('stego_post').delete(post.id); };

    cardWrap.onclick = (e) => {
      if (e.target.closest('.gallery-controls')) return;
      this.onPlay(post);
    };
    
    this.grid.appendChild(cardWrap);
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