// RemotePlayer: avatar of another online player in the multiplayer virtual space.
import { Character } from './character.js';
import { sprite } from '../render/assets.js';
import { drawFrame } from '../render/renderer.js';
import { text, UI } from '../ui/draw.js';

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const WALK_SEQ = [1, 2, 3, 2];

export class RemotePlayer extends Character {
  constructor(data) {
    super(data.avatar || 'player_m', data.x || 0, data.y || 0);
    this.id = data.id;
    this.name = data.name || 'Pemain';
    this.livekitId = data.livekitId || data.id || data.name;
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetDir = data.dir || 'down';
    this.targetMoving = !!data.moving;
    this.speed = data.speed || 96;
    this.targetAnimT = data.animT || 0;
  }

  applySync(data) {
    if (data.avatar && data.avatar !== this.spriteName) {
      this.spriteName = data.avatar;
    }
    if (data.name) this.name = data.name;
    if (data.livekitId) this.livekitId = data.livekitId;
    this.targetX = data.x;
    this.targetY = data.y;
    this.targetDir = data.dir || this.targetDir;
    this.targetMoving = !!data.moving;
    this.speed = data.speed || 96;
    if (data.animT !== undefined) this.targetAnimT = data.animT;

    // If difference is too large (e.g. teleport or initial join), snap immediately
    const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);
    if (dist > 96) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  update(dt) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 1) {
      // Smooth lerp proportional to distance and time
      const factor = Math.min(1, dt * 12);
      this.x += dx * factor;
      this.y += dy * factor;
      this.moving = true;
      this.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.animT += dt * (this.speed / this.baseSpeed);
    } else {
      this.x = this.targetX;
      this.y = this.targetY;
      this.moving = this.targetMoving;
      this.dir = this.targetDir;
      if (!this.moving) this.animT = 0;
      else this.animT += dt * (this.speed / this.baseSpeed);
    }
  }

  frame() {
    if (!this.moving) return 0;
    return WALK_SEQ[Math.floor(this.animT * 8) % WALK_SEQ.length];
  }

  draw(ctx, camX, camY) {
    const { def, img } = sprite(this.spriteName);
    const sx = Math.round(this.x - camX);
    const sy = Math.round(this.y - camY);

    // Contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite frame
    drawFrame(ctx, img, def.frame[0], def.frame[1], this.frame(), DIR_ROW[this.dir], this.x - camX, this.y - camY);

    // Name tag above avatar's head (Gather.town / WorkAdventure style)
    const fh = def.frame[1];
    const nameY = sy - fh - 14;
    ctx.font = '12px "VT323", monospace';
    const tagW = ctx.measureText(this.name).width + 8;
    const tagH = 15;
    const tagX = sx - tagW / 2;

    ctx.fillStyle = 'rgba(26, 20, 16, 0.75)';
    ctx.fillRect(Math.round(tagX), Math.round(nameY), tagW, tagH);
    ctx.strokeStyle = '#d9c39a';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(tagX), Math.round(nameY), tagW, tagH);

    text(ctx, this.name, sx, nameY + 2, {
      font: '12px "VT323", monospace',
      align: 'center',
      color: '#fff3d6',
    });
  }
}
