// Spatial Audio & Video Proximity Engine for Lembah Kenanga Virtual Space.
// Implements Gather.town / WorkAdventure style spatial volume attenuation,
// stereo panning via Web Audio API, dynamic Selective Track Subscriptions,
// and Private Meeting Room isolation.

import { getZoneAt, ZONE_TYPES } from '../world/zones.js';

export const TILE_SIZE = 32;
export const R_MIN = 3 * TILE_SIZE; // 96px (~3 tiles): full volume & HD video
export const R_MAX = 7 * TILE_SIZE; // 224px (~7 tiles): zero volume & video cutoff

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class SpatialAVSystem {
  constructor({ livekitBridge, getAudioContext, onZoneChange }) {
    this.bridge = livekitBridge;
    this.getAudioContext = getAudioContext;
    this.onZoneChange = onZoneChange;
    this.audioCtx = null;
    this.participants = new Map(); // identity -> { sourceNode, pannerNode, gainNode, audioElement, dist, volume, pan }
    this.subThrottle = 0;
    this.currentZone = null;
    this.lastZoneId = null;
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      if (this.getAudioContext) this.audioCtx = this.getAudioContext();
      if (!this.audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.audioCtx = new AC();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Register a remote audio track into the spatial Web Audio pipeline.
   * @param {MediaStreamTrack} track - LiveKit RemoteAudioTrack
   * @param {string} identity - Remote participant identity / username
   */
  attachAudioTrack(track, identity) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    this.detachAudioTrack(identity);

    try {
      const stream = new MediaStream([track.mediaStreamTrack || track]);
      const sourceNode = ctx.createMediaStreamSource(stream);
      let pannerNode = null;
      if (ctx.createStereoPanner) {
        pannerNode = ctx.createStereoPanner();
      }
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0; // Starts silent until spatial positioning resolves

      if (pannerNode) {
        sourceNode.connect(pannerNode);
        pannerNode.connect(gainNode);
      } else {
        sourceNode.connect(gainNode);
      }
      gainNode.connect(ctx.destination);

      // Audio element keeps WebRTC audio decoding active in the browser
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.srcObject = stream;
      // Do not use audioEl.muted = true because Chromium mutes MediaStreamSourceNode!
      // Set volume = 0 to prevent raw duplicate output while Web Audio handles spatialized sound.
      audioEl.volume = 0;
      audioEl.play().catch(() => {});

      this.participants.set(identity, {
        sourceNode,
        pannerNode,
        gainNode,
        audioElement: audioEl,
        dist: Infinity,
        volume: 0,
        pan: 0,
      });
    } catch (e) {
      console.warn(`[SpatialAV] Error attaching audio track for ${identity}:`, e);
    }
  }

  /** Clean up audio nodes when participant leaves or unmutes. */
  detachAudioTrack(identity) {
    const p = this.participants.get(identity);
    if (!p) return;
    try {
      if (p.sourceNode) p.sourceNode.disconnect();
      if (p.pannerNode) p.pannerNode.disconnect();
      if (p.gainNode) p.gainNode.disconnect();
      if (p.audioElement) {
        p.audioElement.pause();
        p.audioElement.srcObject = null;
        p.audioElement.remove();
      }
    } catch {}
    this.participants.delete(identity);
  }

  /**
   * Main per-frame update loop called from game engine update(dt).
   * @param {Character} player - Local player instance
   * @param {Map<string, RemotePlayer>} remotePlayers - Map of online remote players
   * @param {number} dt - Delta time in seconds
   */
  update(player, remotePlayers, dt) {
    if (!player) return;

    // Detect zone of the local player
    const playerCol = Math.floor(player.x / TILE_SIZE);
    const playerRow = Math.floor(player.y / TILE_SIZE);
    const myZone = getZoneAt(playerCol, playerRow);
    this.currentZone = myZone;

    if (this.lastZoneId !== myZone.id) {
      const prev = this.lastZoneId;
      this.lastZoneId = myZone.id;
      this.onZoneChange?.(myZone, prev);
    }

    const room = this.bridge?.room;
    if (!room) return;

    this.subThrottle = (this.subThrottle || 0) + dt;
    const checkSub = this.subThrottle >= 0.2; // Check selective subscriptions every 200ms
    if (checkSub) this.subThrottle = 0;

    const ctx = this.audioCtx;
    const now = ctx ? ctx.currentTime : 0;

    // Evaluate each remote participant in the LiveKit room
    for (const [sid, participant] of room.remoteParticipants) {
      const identity = participant.identity;

      // Find matching remote avatar in the 2D game world
      let remote = null;
      for (const rp of remotePlayers.values()) {
        if (
          rp.livekitId === identity ||
          rp.name === identity ||
          rp.id === identity ||
          identity.startsWith(rp.name) ||
          identity.includes(rp.id) ||
          (rp.livekitId && identity.includes(rp.livekitId))
        ) {
          remote = rp;
          break;
        }
      }

      if (!remote) {
        // Participant is not on the same map or not spawned
        this.muteParticipant(identity, now);
        if (checkSub) this.setParticipantSubscribed(participant, false);
        continue;
      }

      // Detect zone of the remote avatar
      const remoteCol = Math.floor(remote.x / TILE_SIZE);
      const remoteRow = Math.floor(remote.y / TILE_SIZE);
      const theirZone = getZoneAt(remoteCol, remoteRow);

      // Distance calculation
      const dist = Math.hypot(player.x - remote.x, player.y - remote.y);
      let volume = 0;
      let inRange = false;
      let pan = 0;

      // --- Room Isolation & Proximity Logic ---
      if (myZone.type === ZONE_TYPES.PRIVATE && myZone.id === theirZone.id) {
        // KASUS 1: Di dalam private meeting space yang sama -> 100% volume jernih
        volume = 1.0;
        inRange = true;
        // Mild stereo panning within room
        pan = clamp((remote.x - player.x) / R_MAX, -0.5, 0.5);
      } else if (myZone.type === ZONE_TYPES.PRIVATE || theirZone.type === ZONE_TYPES.PRIVATE) {
        // KASUS 2: Salah satu di private room berbeda -> isolasi total (bisu & mati)
        volume = 0.0;
        inRange = false;
        pan = 0;
      } else if (myZone.type === ZONE_TYPES.QUIET && myZone.id !== theirZone.id) {
        // KASUS 2b: Di dalam quiet zone terpisah -> terisolasi dari luar
        volume = 0.0;
        inRange = false;
        pan = 0;
      } else {
        // KASUS 3: Keduanya di area terbuka (Open Space) -> Proksimitas jarak standar
        inRange = dist <= R_MAX;
        if (dist <= R_MIN) {
          volume = 1.0;
        } else if (dist <= R_MAX) {
          volume = clamp(1.0 - (dist - R_MIN) / (R_MAX - R_MIN), 0.0, 1.0);
        } else {
          volume = 0.0;
        }
        pan = clamp((remote.x - player.x) / R_MAX, -1.0, 1.0);
      }

      // Apply to Web Audio nodes with direct HTMLAudioElement fallback
      const audioEntry = (
        this.participants.get(identity) ||
        (remote && (this.participants.get(remote.livekitId) || this.participants.get(remote.name) || this.participants.get(remote.id)))
      );
      if (audioEntry) {
        audioEntry.dist = dist;
        audioEntry.volume = volume;
        audioEntry.pan = pan;

        if (ctx && audioEntry.gainNode) {
          audioEntry.gainNode.gain.cancelScheduledValues(now);
          audioEntry.gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);

          if (audioEntry.pannerNode) {
            audioEntry.pannerNode.pan.cancelScheduledValues(now);
            audioEntry.pannerNode.pan.linearRampToValueAtTime(pan, now + 0.05);
          }
        } else if (audioEntry.audioElement) {
          audioEntry.audioElement.volume = volume;
        }
      }

      // Dynamic Selective Track Subscription (LiveKit SFU)
      if (checkSub) {
        this.setParticipantSubscribed(participant, inRange, dist);
      }
    }
  }

  /**
   * Set subscription status and adaptive video quality for a remote participant.
   */
  setParticipantSubscribed(participant, subscribed, dist = Infinity) {
    if (!participant.trackPublications) return;

    for (const [trackSid, pub] of participant.trackPublications) {
      if (pub.isSubscribed !== subscribed) {
        pub.setSubscribed(subscribed);
      }

      // If video track is active, adjust quality based on distance
      if (subscribed && pub.kind === 'video') {
        const quality = dist <= R_MIN ? 2 : 1; // 2 = HIGH, 1 = MEDIUM/LOW
        if (pub.setVideoQuality) {
          pub.setVideoQuality(quality);
        }
      }
    }
  }

  muteParticipant(identity, now) {
    const entry = this.participants.get(identity);
    if (entry && this.audioCtx) {
      entry.volume = 0;
      entry.gainNode.gain.cancelScheduledValues(now);
      entry.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
    }
  }

  destroy() {
    for (const id of Array.from(this.participants.keys())) {
      this.detachAudioTrack(id);
    }
    this.participants.clear();
  }
}
