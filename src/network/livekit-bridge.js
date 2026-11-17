// LiveKit Client SDK Bridge for Lembah Kenanga Virtual Office.
// Native ES Module integration using browser CDN (zero bundler).

const LIVEKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.6.4/dist/livekit-client.esm.mjs';

export class LiveKitBridge {
  constructor({ onParticipantConnected, onParticipantDisconnected, onTrackSubscribed, onTrackUnsubscribed, onActiveSpeakersChanged }) {
    this.onParticipantConnected = onParticipantConnected;
    this.onParticipantDisconnected = onParticipantDisconnected;
    this.onTrackSubscribed = onTrackSubscribed;
    this.onTrackUnsubscribed = onTrackUnsubscribed;
    this.onActiveSpeakersChanged = onActiveSpeakersChanged;

    this.sdk = null;
    this.room = null;
    this.connected = false;
    this.localTracks = { audio: null, video: null, screen: null };
  }

  /** Dynamically import LiveKit SDK in the browser. */
  async loadSDK() {
    if (this.sdk) return this.sdk;
    try {
      this.sdk = await import(/* webpackIgnore: true */ LIVEKIT_CDN_URL);
      return this.sdk;
    } catch (e) {
      console.warn('LiveKit SDK could not be loaded from CDN:', e);
      return null;
    }
  }

  /**
   * Request access token from backend service.
   * @param {string} username
   * @param {string} room
   * @param {string} avatar
   */
  async fetchToken(username, room = 'valley', avatar = 'player_m') {
    const res = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, room, avatar }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to fetch LiveKit token');
    return data;
  }

  /**
   * Connect to LiveKit Room and bind event listeners.
   * @param {string} url - LiveKit server URL (e.g. ws://127.0.0.1:7880)
   * @param {string} token - Signed JWT access token
   * @param {object} opts - { audio: boolean, video: boolean }
   */
  async connect(url, token, opts = { audio: false, video: false }) {
    const sdk = await this.loadSDK();
    if (!sdk) throw new Error('LiveKit SDK not available');

    const { Room, RoomEvent, Track } = sdk;
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

    await this.room.connect(url, token);
    this.connected = true;

    if (opts.audio) {
      await this.setMicrophone(true);
    }
    if (opts.video) {
      await this.setCamera(true);
    }

    return this.room;
  }

  async setMicrophone(enabled) {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.localTracks.audio = enabled;
    } catch (e) {
      console.warn('Microphone permission or hardware error:', e);
    }
  }

  async setCamera(enabled) {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setCameraEnabled(enabled);
      this.localTracks.video = enabled;
    } catch (e) {
      console.warn('Camera permission or hardware error:', e);
    }
  }

  async setScreenShare(enabled) {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setScreenShareEnabled(enabled);
      this.localTracks.screen = enabled;
    } catch (e) {
      console.warn('Screen share cancelled or failed:', e);
    }
  }

  disconnect() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.connected = false;
  }
}
