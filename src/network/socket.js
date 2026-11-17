// WebSocket network client for real-time multiplayer coordination.

export class GameSocket {
  constructor({ getPlayerState, onInit, onJoin, onMove, onAvatar, onLeave }) {
    this.getPlayerState = getPlayerState;
    this.onInit = onInit;
    this.onJoin = onJoin;
    this.onMove = onMove;
    this.onAvatar = onAvatar;
    this.onLeave = onLeave;

    this.ws = null;
    this.connected = false;
    this.id = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.lastSendTime = 0;
    this.lastSentMoving = null;
    this.sendInterval = 1000 / 20; // 20 Hz
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      const initial = this.getPlayerState ? this.getPlayerState() : {};
      this.send({ type: 'join', ...initial });
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'init':
          this.id = msg.id;
          this.onInit?.(msg.players || {});
          break;
        case 'join':
          if (msg.player && msg.player.id !== this.id) {
            this.onJoin?.(msg.player);
          }
          break;
        case 'move':
          if (msg.id !== this.id) {
            this.onMove?.(msg);
          }
          break;
        case 'avatar':
          if (msg.id !== this.id) {
            this.onAvatar?.(msg.id, msg.avatar);
          }
          break;
        case 'leave':
          this.onLeave?.(msg.id);
          break;
        case 'pong':
          break;
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // Handled by onclose
    };
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.connected) this.send({ type: 'ping' });
    }, 10000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch {}
    }
  }

  syncMove(player) {
    if (!this.connected || !player) return;
    const now = performance.now();
    const movingChanged = player.moving !== this.lastSentMoving;

    // Send immediately when moving state changes, or throttle at 20 Hz when in motion
    if (movingChanged || (player.moving && now - this.lastSendTime >= this.sendInterval)) {
      this.lastSendTime = now;
      this.lastSentMoving = player.moving;
      this.send({
        type: 'move',
        x: Math.round(player.x),
        y: Math.round(player.y),
        dir: player.dir,
        moving: player.moving,
        speed: player.speed,
        animT: +player.animT.toFixed(3),
        avatar: player.spriteName,
      });
    }
  }

  syncAvatar(avatarId) {
    if (!this.connected) return;
    this.send({ type: 'avatar', avatar: avatarId });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}
