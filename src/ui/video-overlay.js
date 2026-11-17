// Video Overlay System for Lembah Kenanga Virtual Office.
// Manages HTML5 <video> elements positioned over Canvas avatars (Bubble Mode)
// and top ribbon participant cards (Dock Mode), plus full screen share projector.

export class VideoOverlay {
  constructor({ livekitBridge, onOpenScreenShare } = {}) {
    this.bridge = livekitBridge;
    this.onOpenScreenShare = onOpenScreenShare;
    this.mode = 'bubble'; // 'bubble' | 'dock'
    this.activeSpeakers = new Set(); // participant identities speaking

    // Track registries (identity -> MediaStreamTrack or RemoteTrack)
    this.remoteVideoTracks = new Map();
    this.screenShareTracks = new Map();

    this.localVideoTrack = null;
    this.localSpeaking = false;

    this.container = null;
    this.dockContainer = null;
    this.projectorModal = null;
    this.bubbles = new Map(); // key -> { el, frameEl, videoEl, avatarImg, screenBtn, nameBadge, isLocal, rpId, identity, livekitId }
    this.activeProjector = null; // { identity, track }

    this.initDOM();
  }

  initDOM() {
    // 1. Floating Video Layer Container
    this.container = document.createElement('div');
    this.container.id = 'video-layer';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '15',
    });
    document.body.appendChild(this.container);

    // 2. Top Dock Ribbon Container
    this.dockContainer = document.createElement('div');
    this.dockContainer.id = 'video-dock';
    Object.assign(this.dockContainer.style, {
      position: 'fixed',
      top: '8px',
      left: '250px',
      right: '170px',
      height: '92px',
      display: 'none',
      gap: '8px',
      overflowX: 'auto',
      pointerEvents: 'auto',
      zIndex: '20',
      padding: '4px',
    });
    document.body.appendChild(this.dockContainer);

    // 3. Screen Share Presentation Modal
    this.projectorModal = document.createElement('div');
    this.projectorModal.id = 'screenshare-modal';
    Object.assign(this.projectorModal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '100',
      flexDirection: 'column',
    });

    this.projectorModal.innerHTML = `
      <div style="background: #2a1f18; border: 3px solid #8b5a2b; border-radius: 8px; width: 88vw; height: 84vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #3d2a1d; border-bottom: 2px solid #8b5a2b;">
          <span id="projector-title" style="font-family: 'Press Start 2P', monospace; font-size: 11px; color: #f5e6c8;">Layar Presentasi</span>
          <button id="projector-close" style="background: #8a2c1d; color: #fff; border: 2px solid #3a2a2a; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-family: 'VT323', monospace; font-size: 18px;">✖ Tutup (Esc)</button>
        </div>
        <div id="projector-video-box" style="flex: 1; background: #0f0a07; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
        </div>
      </div>
    `;
    document.body.appendChild(this.projectorModal);

    this.projectorModal.querySelector('#projector-close').addEventListener('click', () => {
      this.closeProjector();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeProjector) {
        this.closeProjector();
      }
    });
  }

  toggleMode() {
    this.mode = this.mode === 'bubble' ? 'dock' : 'bubble';
    this.dockContainer.style.display = this.mode === 'dock' ? 'flex' : 'none';
    this.container.style.display = this.mode === 'bubble' ? 'block' : 'none';

    // Move bubble elements into the active container
    for (const bubble of this.bubbles.values()) {
      if (this.mode === 'bubble') {
        bubble.el.style.position = 'absolute';
        this.container.appendChild(bubble.el);
      } else {
        bubble.el.style.position = 'relative';
        this.dockContainer.appendChild(bubble.el);
      }
    }

    return this.mode;
  }

  setLocalVideoTrack(track) {
    this.localVideoTrack = track;
    const bubble = this.bubbles.get('__local__');
    if (bubble) {
      if (track) {
        this.bindTrackToVideoElement(bubble.videoEl, track, true);
      } else {
        bubble.videoEl.style.display = 'none';
        bubble.videoEl.srcObject = null;
      }
    }
  }

  setLocalSpeaking(speaking) {
    this.localSpeaking = speaking;
  }

  setActiveSpeakers(speakers) {
    this.activeSpeakers.clear();
    for (const s of speakers) {
      if (s.identity) this.activeSpeakers.add(s.identity);
    }
  }

  registerScreenTrack(identity, track) {
    this.screenShareTracks.set(identity, track);
  }

  unregisterScreenTrack(identity) {
    this.screenShareTracks.delete(identity);
    if (this.activeProjector?.identity === identity) {
      this.closeProjector();
    }
  }

  attachVideoTrack(identity, track) {
    this.remoteVideoTracks.set(identity, track);

    // Attempt to bind immediately if matching bubble already exists
    for (const bubble of this.bubbles.values()) {
      if (this.isIdentityMatch(bubble, identity)) {
        this.bindTrackToVideoElement(bubble.videoEl, track);
        break;
      }
    }
  }

  detachVideoTrack(identity) {
    this.remoteVideoTracks.delete(identity);

    for (const bubble of this.bubbles.values()) {
      if (this.isIdentityMatch(bubble, identity)) {
        bubble.videoEl.style.display = 'none';
        bubble.videoEl.srcObject = null;
        break;
      }
    }
  }

  isIdentityMatch(bubble, identity) {
    if (!bubble) return false;
    if (bubble.identity === identity || bubble.rpId === identity || bubble.livekitId === identity) return true;
    if (identity && bubble.identity && (identity.includes(bubble.identity) || bubble.identity.includes(identity))) return true;
    if (identity && bubble.rpId && (identity.includes(bubble.rpId) || bubble.rpId.includes(identity))) return true;
    return false;
  }

  findTrackForRemotePlayer(rp) {
    const keys = [rp.livekitId, rp.name, rp.id].filter(Boolean);
    for (const k of keys) {
      if (this.remoteVideoTracks.has(k)) return this.remoteVideoTracks.get(k);
    }
    // Search substring match
    for (const [idKey, trk] of this.remoteVideoTracks.entries()) {
      if (keys.some(k => idKey.includes(k) || k.includes(idKey))) {
        return trk;
      }
    }
    return null;
  }

  bindTrackToVideoElement(videoEl, track, isLocal = false) {
    if (!videoEl || !track) return;
    videoEl.style.display = 'block';
    if (isLocal) videoEl.muted = true;

    try {
      if (track.attach) {
        track.attach(videoEl);
      } else if (track.mediaStreamTrack) {
        videoEl.srcObject = new MediaStream([track.mediaStreamTrack]);
      } else if (track instanceof MediaStreamTrack) {
        videoEl.srcObject = new MediaStream([track]);
      } else if (track instanceof MediaStream) {
        videoEl.srcObject = track;
      }
      videoEl.play().catch(() => {});
    } catch (e) {
      console.warn('[VideoOverlay] Failed to bind track to video:', e);
    }
  }

  openProjector(identity, track) {
    this.activeProjector = { identity, track };
    const title = this.projectorModal.querySelector('#projector-title');
    const box = this.projectorModal.querySelector('#projector-video-box');
    title.textContent = `Layar: ${identity}`;
    box.innerHTML = '';

    const videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'contain';

    this.bindTrackToVideoElement(videoEl, track);
    box.appendChild(videoEl);
    this.projectorModal.style.display = 'flex';
  }

  closeProjector() {
    this.activeProjector = null;
    const box = this.projectorModal.querySelector('#projector-video-box');
    box.innerHTML = '';
    this.projectorModal.style.display = 'none';
  }

  /**
   * Update video bubbles/cards position every frame following camera and avatars.
   */
  update({ canvas, camera, view, player, remotePlayers }) {
    if (!canvas || !camera) return;

    const r = canvas.getBoundingClientRect();
    const zoom = view.zoom || 1;
    const activeKeys = new Set();

    // 1. Process Local Player
    if (player) {
      const localKey = '__local__';
      activeKeys.add(localKey);

      const screenX = r.left + (player.x - camera.ix) * zoom;
      const screenY = r.top + (player.y - camera.iy - 54) * zoom;

      let bubble = this.bubbles.get(localKey);
      if (!bubble) {
        bubble = this.createBubbleElement(localKey, player.spriteName, true);
        this.bubbles.set(localKey, bubble);
      }

      const hasVideo = !!this.localVideoTrack;
      const isVisibleOnScreen = (
        screenX >= r.left - 60 && screenX <= r.right + 60 &&
        screenY >= r.top - 60 && screenY <= r.bottom + 60
      );

      // In bubble mode, show local bubble if camera is ON or user is speaking
      if (this.mode === 'bubble') {
        if (isVisibleOnScreen && (hasVideo || this.localSpeaking)) {
          bubble.el.style.display = 'flex';
          bubble.el.style.transform = `translate(${Math.round(screenX - 34)}px, ${Math.round(screenY - 74)}px)`;
        } else {
          bubble.el.style.display = 'none';
        }
      } else {
        bubble.el.style.display = 'flex';
        bubble.el.style.transform = 'none';
      }

      if (this.localSpeaking) {
        bubble.frameEl.style.borderColor = '#4f9a29';
        bubble.frameEl.style.boxShadow = '0 0 12px #4f9a29, 0 0 4px #6abe30';
      } else {
        bubble.frameEl.style.borderColor = hasVideo ? '#3f8fd6' : '#3a2a2a';
        bubble.frameEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
      }

      if (hasVideo && !bubble.videoEl.srcObject) {
        this.bindTrackToVideoElement(bubble.videoEl, this.localVideoTrack, true);
      }
    }

    // 2. Process Remote Players
    for (const [id, rp] of remotePlayers.entries()) {
      const rpKey = rp.id || id;
      activeKeys.add(rpKey);

      const screenX = r.left + (rp.x - camera.ix) * zoom;
      const screenY = r.top + (rp.y - camera.iy - 54) * zoom;

      let bubble = this.bubbles.get(rpKey);
      if (!bubble) {
        bubble = this.createBubbleElement(rp.name || rp.id, rp.spriteName, false);
        bubble.rpId = rp.id;
        bubble.identity = rp.name;
        bubble.livekitId = rp.livekitId;
        this.bubbles.set(rpKey, bubble);
      } else {
        bubble.rpId = rp.id;
        bubble.identity = rp.name;
        bubble.livekitId = rp.livekitId;
      }

      // Check remote video track
      const videoTrack = this.findTrackForRemotePlayer(rp);
      if (videoTrack) {
        if (bubble.videoEl.style.display === 'none' || !bubble.videoEl.srcObject) {
          this.bindTrackToVideoElement(bubble.videoEl, videoTrack, false);
        }
      } else {
        if (bubble.videoEl.style.display !== 'none') {
          bubble.videoEl.style.display = 'none';
          bubble.videoEl.srcObject = null;
        }
      }

      // Check screen share track
      const screenTrack = (
        this.screenShareTracks.get(rp.livekitId) ||
        this.screenShareTracks.get(rp.name) ||
        this.screenShareTracks.get(rp.id)
      );

      const isSpeaking = (
        this.activeSpeakers.has(rp.livekitId) ||
        this.activeSpeakers.has(rp.name) ||
        this.activeSpeakers.has(rp.id)
      );

      const isVisibleOnScreen = (
        screenX >= r.left - 60 && screenX <= r.right + 60 &&
        screenY >= r.top - 60 && screenY <= r.bottom + 60
      );

      if (this.mode === 'bubble') {
        if (isVisibleOnScreen) {
          bubble.el.style.display = 'flex';
          bubble.el.style.transform = `translate(${Math.round(screenX - 34)}px, ${Math.round(screenY - 74)}px)`;
        } else {
          bubble.el.style.display = 'none';
        }
      } else {
        bubble.el.style.display = 'flex';
        bubble.el.style.transform = 'none';
      }

      // Voice Activity Glow
      if (isSpeaking) {
        bubble.frameEl.style.borderColor = '#4f9a29';
        bubble.frameEl.style.boxShadow = '0 0 12px #4f9a29, 0 0 4px #6abe30';
      } else {
        bubble.frameEl.style.borderColor = videoTrack ? '#3f8fd6' : '#3a2a2a';
        bubble.frameEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
      }

      // Screen share button
      if (screenTrack) {
        bubble.screenBtn.style.display = 'block';
        bubble.screenBtn.onclick = (e) => {
          e.stopPropagation();
          this.openProjector(rp.name || rp.id, screenTrack);
        };
      } else {
        bubble.screenBtn.style.display = 'none';
      }
    }

    // Clean up participants that left
    for (const [key, bubble] of this.bubbles.entries()) {
      if (!activeKeys.has(key)) {
        bubble.el.remove();
        this.bubbles.delete(key);
      }
    }
  }

  createBubbleElement(identity, spriteName, isLocal = false) {
    const el = document.createElement('div');
    el.className = `player-av-bubble ${isLocal ? 'local-player-bubble' : ''}`;
    Object.assign(el.style, {
      position: this.mode === 'bubble' ? 'absolute' : 'relative',
      width: '68px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      pointerEvents: 'auto',
      transition: 'transform 0.05s linear',
      userSelect: 'none',
    });

    const frame = document.createElement('div');
    Object.assign(frame.style, {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      overflow: 'hidden',
      border: '3px solid #3a2a2a',
      background: '#2b2017',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    // Fallback Portrait / Avatar
    const avatarImg = document.createElement('img');
    avatarImg.src = `assets/sprites/portraits/${spriteName}.png`;
    Object.assign(avatarImg.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      imageRendering: 'pixelated',
    });
    frame.appendChild(avatarImg);

    // Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true; // Never loop local audio back
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      position: 'absolute',
      top: '0',
      left: '0',
      display: 'none',
    });

    if (isLocal && this.localVideoTrack) {
      this.bindTrackToVideoElement(video, this.localVideoTrack, true);
    }
    frame.appendChild(video);

    el.appendChild(frame);

    // Name badge for dock mode or hover
    const nameBadge = document.createElement('span');
    nameBadge.textContent = isLocal ? '(Kamu)' : identity;
    Object.assign(nameBadge.style, {
      fontSize: '11px',
      fontFamily: '"VT323", monospace',
      color: '#f5e6c8',
      background: 'rgba(0,0,0,0.6)',
      padding: '0 4px',
      borderRadius: '3px',
      marginTop: '2px',
      maxWidth: '68px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    el.appendChild(nameBadge);

    // Screen Share badge / button
    const screenBtn = document.createElement('button');
    screenBtn.textContent = '🖥️ Layar';
    Object.assign(screenBtn.style, {
      display: 'none',
      marginTop: '2px',
      padding: '1px 6px',
      background: '#3f8fd6',
      color: '#fff',
      border: '1px solid #1a1410',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: '"VT323", monospace',
      cursor: 'pointer',
      boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
    });
    el.appendChild(screenBtn);

    const targetParent = this.mode === 'bubble' ? this.container : this.dockContainer;
    targetParent.appendChild(el);

    return {
      el,
      frameEl: frame,
      videoEl: video,
      avatarImg,
      nameBadge,
      screenBtn,
      isLocal,
      identity,
    };
  }
}
