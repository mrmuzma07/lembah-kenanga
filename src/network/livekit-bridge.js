// LiveKit Client SDK Bridge for Lembah Kenanga Virtual Office.
// Native ES Module integration using browser CDN (zero bundler).
// Manages real hardware capture (Mic, Camera, Screen) with graceful browser API fallbacks.

const LIVEKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/livekit-client/+esm';
const LIVEKIT_BACKUP_CDN = 'https://esm.sh/livekit-client';

export class LiveKitBridge {
  constructor({
    onParticipantConnected,
    onParticipantDisconnected,
    onTrackSubscribed,
    onTrackUnsubscribed,
    onActiveSpeakersChanged,
    onLocalTrackChanged,
    onLocalSpeakingChanged,
  } = {}) {
    this.onParticipantConnected = onParticipantConnected;
    this.onParticipantDisconnected = onParticipantDisconnected;
    this.onTrackSubscribed = onTrackSubscribed;
    this.onTrackUnsubscribed = onTrackUnsubscribed;
    this.onActiveSpeakersChanged = onActiveSpeakersChanged;
    this.onLocalTrackChanged = onLocalTrackChanged;
    this.onLocalSpeakingChanged = onLocalSpeakingChanged;

    this.sdk = null;
    this.room = null;
    this.connected = false;
    this.localTracks = { audio: false, video: false, screen: false };

    // Real media stream objects for local hardware
    this.localAudioMediaTrack = null;
    this.localVideoMediaTrack = null;
    this.localScreenMediaTrack = null;

    // Local VAD (Voice Activity Detection)
    this.vadCtx = null;
    this.vadAnalyser = null;
    this.vadInterval = null;
    this.isSpeaking = false;
  }

  /** Dynamically import LiveKit SDK in the browser with CDN fallbacks. */
  async loadSDK() {
    if (this.sdk) return this.sdk;
    for (const url of [LIVEKIT_CDN_URL, LIVEKIT_BACKUP_CDN]) {
      try {
        this.sdk = await import(/* webpackIgnore: true */ url);
        if (this.sdk) {
          console.log('[LiveKit] Successfully loaded SDK from:', url);
          return this.sdk;
        }
      } catch (e) {
        console.warn(`[LiveKit] Could not load SDK from ${url}:`, e.message);
      }
    }
    return null;
  }

  /**
   * Request access token from backend service.
   */
  async fetchToken(username, room = 'valley', avatar = 'player_m') {
    const res = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, room, avatar }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to fetch LiveKit token');

    // Adapt LiveKit URL to current browser hostname if accessing from non-127.0.0.1 (e.g. LAN or localhost)
    let livekitUrl = data.url;
    if (livekitUrl.includes('127.0.0.1') && location.hostname && location.hostname !== '127.0.0.1') {
      livekitUrl = livekitUrl.replace('127.0.0.1', location.hostname);
    }
    data.url = livekitUrl;
    return data;
  }

  /**
   * Connect to LiveKit Room and bind event listeners.
   */
  async connect(url, token, opts = { audio: false, video: false }) {
    const sdk = await this.loadSDK();
    if (!sdk) {
      console.warn('[LiveKit] Operating in local browser media mode.');
      return null;
    }

    const { Room, RoomEvent } = sdk;
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    this.room
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.onParticipantConnected?.(participant);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.onParticipantDisconnected?.(participant);
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.onTrackSubscribed?.(track, publication, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        this.onTrackUnsubscribed?.(track, publication, participant);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.onActiveSpeakersChanged?.(speakers);
      });

    try {
      await this.room.connect(url, token);
      this.connected = true;
      console.log('[LiveKit] Connected to room:', this.room.name);
    } catch (e) {
      console.warn('[LiveKit] Connection to SFU server deferred/failed:', e.message);
      this.connected = false;
    }

    if (opts.audio) await this.setMicrophone(true);
    if (opts.video) await this.setCamera(true);

    return this.room;
  }

  /**
   * Activate or deactivate local microphone.
   * Acquires browser audio media track and registers Voice Activity Detection.
   */
  async setMicrophone(enabled, deviceId = null) {
    this.localTracks.audio = enabled;

    if (enabled) {
      let rawTrack = null;

      // 1. LiveKit Room publishing if connected
      if (this.room?.localParticipant) {
        try {
          const pub = await this.room.localParticipant.setMicrophoneEnabled(true, deviceId ? { deviceId } : undefined);
          rawTrack = pub?.track?.mediaStreamTrack;
        } catch (e) {
          console.warn('[LiveKit] setMicrophoneEnabled error:', e);
        }
      }

      // 2. Direct browser getUserMedia capture (fallback or direct audio stream)
      if (!rawTrack && navigator.mediaDevices?.getUserMedia) {
        try {
          const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          rawTrack = stream.getAudioTracks()[0];
        } catch (e) {
          console.warn('[LiveKit] Browser getUserMedia audio error:', e);
          this.localTracks.audio = false;
          throw e;
        }
      }

      if (rawTrack) {
        this.localAudioMediaTrack = rawTrack;
        this.startVAD(new MediaStream([rawTrack]));
        this.onLocalTrackChanged?.('audio', true, rawTrack);
      }
    } else {
      // Disable mic
      if (this.room?.localParticipant) {
        try {
          await this.room.localParticipant.setMicrophoneEnabled(false);
        } catch {}
      }
      if (this.localAudioMediaTrack) {
        this.localAudioMediaTrack.stop();
        this.localAudioMediaTrack = null;
      }
      this.stopVAD();
      this.onLocalTrackChanged?.('audio', false, null);
    }

    return this.localTracks.audio;
  }

  /**
   * Activate or deactivate local webcam.
   * Acquires browser video media track for local preview and remote publishing.
   */
  async setCamera(enabled, deviceId = null) {
    this.localTracks.video = enabled;

    if (enabled) {
      let rawTrack = null;

      // 1. LiveKit Room publishing if connected
      if (this.room?.localParticipant) {
        try {
          const pub = await this.room.localParticipant.setCameraEnabled(true, deviceId ? { deviceId } : undefined);
          rawTrack = pub?.track?.mediaStreamTrack;
        } catch (e) {
          console.warn('[LiveKit] setCameraEnabled error:', e);
        }
      }

      // 2. Direct browser getUserMedia capture
      if (!rawTrack && navigator.mediaDevices?.getUserMedia) {
        try {
          const constraints = {
            video: deviceId
              ? { deviceId: { exact: deviceId }, width: { ideal: 320 }, height: { ideal: 240 } }
              : { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 24 } },
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          rawTrack = stream.getVideoTracks()[0];
        } catch (e) {
          console.warn('[LiveKit] Browser getUserMedia video error:', e);
          this.localTracks.video = false;
          throw e;
        }
      }

      if (rawTrack) {
        this.localVideoMediaTrack = rawTrack;
        this.onLocalTrackChanged?.('video', true, rawTrack);
      }
    } else {
      // Disable camera
      if (this.room?.localParticipant) {
        try {
          await this.room.localParticipant.setCameraEnabled(false);
        } catch {}
      }
      if (this.localVideoMediaTrack) {
        this.localVideoMediaTrack.stop();
        this.localVideoMediaTrack = null;
      }
      this.onLocalTrackChanged?.('video', false, null);
    }

    return this.localTracks.video;
  }

  /**
   * Activate or deactivate screen sharing.
   */
  async setScreenShare(enabled) {
    this.localTracks.screen = enabled;

    if (enabled) {
      let rawTrack = null;
      if (this.room?.localParticipant) {
        try {
          const pub = await this.room.localParticipant.setScreenShareEnabled(true);
          rawTrack = pub?.track?.mediaStreamTrack;
        } catch (e) {
          console.warn('[LiveKit] setScreenShareEnabled error:', e);
        }
      }

      if (!rawTrack && navigator.mediaDevices?.getDisplayMedia) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          rawTrack = stream.getVideoTracks()[0];
          rawTrack.onended = () => this.setScreenShare(false);
        } catch (e) {
          this.localTracks.screen = false;
          throw e;
        }
      }

      if (rawTrack) {
        this.localScreenMediaTrack = rawTrack;
        this.onLocalTrackChanged?.('screen', true, rawTrack);
      }
    } else {
      if (this.room?.localParticipant) {
        try {
          await this.room.localParticipant.setScreenShareEnabled(false);
        } catch {}
      }
      if (this.localScreenMediaTrack) {
        this.localScreenMediaTrack.stop();
        this.localScreenMediaTrack = null;
      }
      this.onLocalTrackChanged?.('screen', false, null);
    }

    return this.localTracks.screen;
  }

  /**
   * Local Voice Activity Detection (VAD) loop.
   * Calculates energy level from microphone stream to highlight speaking border.
   */
  startVAD(stream) {
    this.stopVAD();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.vadCtx = new AC();
      const source = this.vadCtx.createMediaStreamSource(stream);
      this.vadAnalyser = this.vadCtx.createAnalyser();
      this.vadAnalyser.fftSize = 256;
      source.connect(this.vadAnalyser);

      const buffer = new Uint8Array(this.vadAnalyser.frequencyBinCount);
      this.vadInterval = setInterval(() => {
        if (!this.vadAnalyser) return;
        this.vadAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const speaking = avg > 14; // Sensitivity threshold for human voice

        if (speaking !== this.isSpeaking) {
          this.isSpeaking = speaking;
          this.onLocalSpeakingChanged?.(speaking);
        }
      }, 80);
    } catch (e) {
      console.warn('[LiveKit] VAD initialization skipped:', e);
    }
  }

  stopVAD() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.vadCtx) {
      try { this.vadCtx.close(); } catch {}
      this.vadCtx = null;
    }
    this.vadAnalyser = null;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.onLocalSpeakingChanged?.(false);
    }
  }

  disconnect() {
    this.setMicrophone(false);
    this.setCamera(false);
    this.setScreenShare(false);

    if (this.room) {
      try { this.room.disconnect(); } catch {}
      this.room = null;
    }
    this.connected = false;
  }
}
