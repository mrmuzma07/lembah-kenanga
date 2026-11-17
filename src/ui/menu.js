// Pause menu: Lanjut / Ganti Karakter / Petunjuk / Pengaturan / Keluar.
//
// Submenus share one panel. Arrow keys move, E confirms, Esc goes back one
// level (and closes from the root), so a player never gets stuck in a submenu.
import { view } from '../render/renderer.js';
import { panel, text, UI } from './draw.js';
import { AVATARS } from '../core/save.js';
import { assets } from '../render/assets.js';

const ROOT = [
  { id: 'resume', label: 'Lanjut', hint: 'Tutup menu dan lanjutkan permainan' },
  { id: 'character', label: 'Ganti Karakter', hint: 'Pilih karakter pemain yang kamu inginkan' },
  { id: 'help', label: 'Petunjuk', hint: 'Kontrol dan cara bermain' },
  { id: 'settings', label: 'Pengaturan', hint: 'Volume musik dan zoom tampilan' },
  { id: 'quit', label: 'Keluar', hint: 'Kembali ke menu utama' },
];

const HELP = [
  ['WASD / panah', 'Berjalan'],
  ['Shift (tahan)', 'Berlari'],
  ['E di tepi air', 'Memancing (pegang pancing)'],
  ['E / Spasi', 'Pakai barang, makan, bicara, panen, tidur'],
  ['1 – 9', 'Pilih alat di hotbar'],
  ['X / Z / roda', 'Alat berikutnya / sebelumnya'],
  ['F', 'Ubah zoom / luas tampilan'],
  ['I atau Tab', 'Buka inventori'],
  ['Backspace', 'Buang barang (di inventori)'],
  ['G', 'Beri hadiah ke warga'],
  ['Esc', 'Buka menu ini'],
];

// Lines stay short: the panel must fit a 640x360 viewport without clipping.
// Tetap empat baris: panelnya tumbuh mengikuti daftar ini, dan di jendela kecil
// ia sudah mepet. Jam buka sengaja tidak ditulis di sini — daftar seperti itu
// pernah ditulis dan langsung basi begitu warung dan klinik dibuka. Papan
// pengumuman di plaza membacanya langsung dari data, jadi ia yang ditunjuk.
const HELP_TEXT = [
  'Cangkul, tanam, siram, panen — di petak kebun.',
  'Isi penyiram di sumur; jual lewat kotak jual.',
  'Tekan E di depan pintu: tidur, belanja, berobat.',
  'Jam buka & titipan warga: baca papan di plaza.',
];

export class Menu {
  constructor({ audio, renderer, onQuit, onSelectCharacter, getCharacter }) {
    this.audio = audio;
    this.renderer = renderer;
    this.onQuit = onQuit;
    this.onSelectCharacter = onSelectCharacter;
    this.getCharacter = getCharacter;
    this.open = false;
    this.page = 'root';
    this.cursor = 0;
    this.charCursor = 0;
  }

  toggle() {
    this.open = !this.open;
    this.page = 'root';
    this.cursor = 0;
  }

  close() { this.open = false; this.page = 'root'; this.cursor = 0; }

  /** Settings rows are built fresh so they always show current values. */
  settingsRows() {
    const z = this.renderer.zoomOverride;
    let zoomText = `Otomatis (×${view.zoom})`;
    if (z === 1) zoomText = '×1 (Maksimal Luas & Detail)';
    else if (z === 2) zoomText = '×2 (Luas & Seimbang)';
    else if (z === 3) zoomText = '×3 (Sedang)';
    else if (z === 4) zoomText = '×4 (Dekat)';
    return [
      { id: 'volume', label: 'Volume musik', value: `${Math.round(this.audio.settings.musicVolume * 100)}%`, bar: this.audio.settings.musicVolume },
      { id: 'sfx', label: 'Volume efek', value: `${Math.round(this.audio.settings.sfxVolume * 100)}%`, bar: this.audio.settings.sfxVolume },
      { id: 'mute', label: 'Bisukan semua', value: this.audio.settings.muted ? 'Ya' : 'Tidak' },
      { id: 'zoom', label: 'Zoom tampilan', value: zoomText },
      { id: 'back', label: 'Kembali', value: '' },
    ];
  }

  rowCount() {
    if (this.page === 'root') return ROOT.length;
    if (this.page === 'character') return AVATARS.length;
    if (this.page === 'settings') return this.settingsRows().length;
    return 1;                                   // help page: only "Kembali"
  }

  key(action) {
    if (this.page === 'character') {
      const len = AVATARS.length;
      if (action === 'up') {
        this.charCursor = (this.charCursor - 2 + len) % len;
        this.audio?.ui();
        return;
      }
      if (action === 'down') {
        this.charCursor = (this.charCursor + 2) % len;
        this.audio?.ui();
        return;
      }
      if (action === 'left') {
        if (this.charCursor % 2 === 1) {
          this.charCursor--;
          this.audio?.ui();
        }
        return;
      }
      if (action === 'right') {
        if (this.charCursor % 2 === 0 && this.charCursor + 1 < len) {
          this.charCursor++;
          this.audio?.ui();
        }
        return;
      }
      if (action === 'interact') {
        const selected = AVATARS[this.charCursor];
        if (selected) {
          this.onSelectCharacter?.(selected);
          this.audio?.ui();
        }
        return;
      }
      return;
    }

    const n = this.rowCount();
    if (action === 'up') { this.cursor = (this.cursor + n - 1) % n; this.audio.ui(); return; }
    if (action === 'down') { this.cursor = (this.cursor + 1) % n; this.audio.ui(); return; }

    if (this.page === 'settings') {
      const row = this.settingsRows()[this.cursor];
      if (action === 'left' || action === 'right') {
        const dir = action === 'right' ? 1 : -1;
        if (row.id === 'volume') this.audio.setVolume(this.audio.settings.musicVolume + dir * 0.05);
        if (row.id === 'sfx') this.audio.setSfxVolume(this.audio.settings.sfxVolume + dir * 0.05);
        if (row.id === 'mute') this.audio.toggleMute();
        if (row.id === 'zoom') this.renderer.stepZoom(dir);
        return;
      }
      if (action === 'interact') {
        if (row.id === 'back') { this.page = 'root'; this.cursor = 3; }
        if (row.id === 'mute') this.audio.toggleMute();
        else this.audio.ui();
      }
      return;
    }

    if (this.page === 'help') {
      if (action === 'interact') { this.page = 'root'; this.cursor = 2; }
      return;
    }

    if (action !== 'interact') return;
    const item = ROOT[this.cursor];
    if (item.id === 'resume') this.close();
    if (item.id === 'character') {
      this.page = 'character';
      const cur = this.getCharacter?.();
      const idx = AVATARS.findIndex((a) => a.id === cur);
      this.charCursor = idx >= 0 ? idx : 0;
    }
    if (item.id === 'help') { this.page = 'help'; this.cursor = 0; }
    if (item.id === 'settings') { this.page = 'settings'; this.cursor = 0; }
    if (item.id === 'quit') this.onQuit();
  }

  /** Esc: back one level, or close from the root. */
  back() {
    if (this.page === 'root') this.close();
    else {
      if (this.page === 'character') this.cursor = 1;
      else if (this.page === 'help') this.cursor = 2;
      else if (this.page === 'settings') this.cursor = 3;
      this.page = 'root';
    }
  }

  click(mx, my) {
    if (!this.open) return;
    if (this.page === 'root') {
      const w = Math.min(320, view.w - 32), h = 76 + ROOT.length * 40 + 34;
      const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
      ROOT.forEach((item, i) => {
        const ry = y + 58 + i * 40;
        if (mx >= x + 16 && mx <= x + w - 16 && my >= ry - 4 && my <= ry + 34) {
          this.cursor = i;
          this.key('interact');
        }
      });
      return;
    }
    if (this.page === 'character') {
      const w = Math.min(540, view.w - 32), h = Math.min(310, view.h - 16);
      const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
      const startY = y + 44;
      for (let i = 0; i < AVATARS.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const itemX = x + 18 + col * 152;
        const itemY = startY + row * 34;
        const itemW = 144, itemH = 30;
        if (mx >= itemX && mx <= itemX + itemW && my >= itemY && my <= itemY + itemH) {
          this.charCursor = i;
          this.key('interact');
          return;
        }
      }
      if (my >= y + h - 35) {
        this.back();
      }
      return;
    }
  }

  draw(ctx) {
    if (!this.open) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    if (this.page === 'root') this.drawRoot(ctx);
    else if (this.page === 'character') this.drawCharacter(ctx);
    else if (this.page === 'settings') this.drawSettings(ctx);
    else this.drawHelp(ctx);
  }

  drawRoot(ctx) {
    const w = Math.min(320, view.w - 32), h = 76 + ROOT.length * 40 + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'JEDA', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    ROOT.forEach((item, i) => {
      const ry = y + 58 + i * 40;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, w - 32, 34); }
      text(ctx, `${on ? '▶' : ' '} ${item.label}`, x + 34, ry, { font: UI.fontBig, color: UI.outline });
    });

    text(ctx, ROOT[this.cursor].hint, x + w / 2, y + h - 30, { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawSettings(ctx) {
    const rows = this.settingsRows();
    const w = Math.min(420, view.w - 32), h = 76 + rows.length * 40 + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'PENGATURAN', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    rows.forEach((row, i) => {
      const ry = y + 58 + i * 40;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, w - 32, 34); }
      text(ctx, `${on ? '▶' : ' '} ${row.label}`, x + 30, ry, { font: UI.fontBig });
      if (row.bar !== undefined) {
        const bx = x + w - 190, bw = 120, bh = 12, by = ry + 6;
        ctx.fillStyle = UI.outline;
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#6b5a3a';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#6abe30';
        ctx.fillRect(bx, by, Math.round(bw * row.bar), bh);
      }
      if (row.value) text(ctx, row.value, x + w - 30, ry, { font: UI.fontBig, align: 'right' });
    });

    text(ctx, '←/→ ubah  ·  E pilih  ·  Esc kembali', x + w / 2, y + h - 30,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawCharacter(ctx) {
    const currentId = this.getCharacter?.();
    const w = Math.min(540, view.w - 32);
    const h = Math.min(310, view.h - 16);
    const x = Math.round((view.w - w) / 2);
    const y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'GANTI KARAKTER', x + w / 2, y + 16, { font: UI.fontTitle, align: 'center', color: UI.red });

    const startY = y + 44;
    for (let i = 0; i < AVATARS.length; i++) {
      const char = AVATARS[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const itemX = x + 18 + col * 152;
      const itemY = startY + row * 34;
      const itemW = 144;
      const itemH = 30;

      const isHovered = i === this.charCursor;
      const isCurrent = char.id === currentId;

      ctx.fillStyle = isHovered ? '#fff3d6' : isCurrent ? '#f4eedb' : '#ebdcc0';
      ctx.fillRect(itemX, itemY, itemW, itemH);
      ctx.strokeStyle = isHovered ? UI.red : isCurrent ? '#4f9a29' : '#b39f7a';
      ctx.lineWidth = isHovered || isCurrent ? 2 : 1;
      ctx.strokeRect(itemX, itemY, itemW, itemH);

      const pImg = assets.images.get('portrait_' + char.id);
      if (pImg) {
        ctx.fillStyle = '#d9c39a';
        ctx.fillRect(itemX + 3, itemY + 3, 24, 24);
        ctx.drawImage(pImg, itemX + 3, itemY + 3, 24, 24);
        ctx.strokeStyle = UI.outline;
        ctx.lineWidth = 1;
        ctx.strokeRect(itemX + 3, itemY + 3, 24, 24);
      }

      text(ctx, char.label, itemX + 32, itemY + 5, {
        font: UI.font,
        color: isHovered ? UI.red : UI.outline,
      });

      if (isCurrent) {
        text(ctx, '★', itemX + itemW - 16, itemY + 5, { font: UI.font, color: '#4f9a29' });
      }
    }

    // Right side: preview card
    const previewX = x + 328;
    const previewY = y + 44;
    const previewW = w - 346;
    const previewH = 200;

    ctx.fillStyle = '#fff8e8';
    ctx.fillRect(previewX, previewY, previewW, previewH);
    ctx.strokeStyle = UI.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(previewX, previewY, previewW, previewH);

    const activeChar = AVATARS[this.charCursor] ?? AVATARS[0];
    const bigPort = assets.images.get('portrait_' + activeChar.id);
    const pSize = 72;
    const px = previewX + Math.round((previewW - pSize) / 2);
    const py = previewY + 12;

    ctx.fillStyle = '#eed7a1';
    ctx.fillRect(px - 2, py - 2, pSize + 4, pSize + 4);
    ctx.strokeStyle = UI.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 2, py - 2, pSize + 4, pSize + 4);
    if (bigPort) {
      ctx.drawImage(bigPort, px, py, pSize, pSize);
    }

    text(ctx, activeChar.label, previewX + previewW / 2, previewY + 96, {
      font: UI.fontBig,
      align: 'center',
      color: UI.outline,
    });

    text(ctx, activeChar.role, previewX + previewW / 2, previewY + 120, {
      font: UI.font,
      align: 'center',
      color: '#8a2c1d',
    });

    const isCurrentActive = activeChar.id === currentId;
    if (isCurrentActive) {
      text(ctx, '● SEDANG DIPAKAI', previewX + previewW / 2, previewY + 154, {
        font: UI.font,
        align: 'center',
        color: '#4f9a29',
      });
    } else {
      text(ctx, '[ Tekan E untuk Pakai ]', previewX + previewW / 2, previewY + 154, {
        font: UI.font,
        align: 'center',
        color: '#7a6647',
      });
    }

    text(ctx, 'WASD/Panah: Cari  ·  E: Pakai  ·  Esc: Kembali', x + w / 2, y + h - 22, {
      font: UI.font,
      align: 'center',
      color: '#7a6647',
    });
  }

  drawHelp(ctx) {
    const w = Math.min(540, view.w - 32);
    const h = Math.min(96 + HELP.length * 22 + HELP_TEXT.length * 20 + 44, view.h - 16);
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'PETUNJUK', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    let ly = y + 44;
    text(ctx, 'KONTROL', x + 26, ly, { font: UI.font, color: '#8a2c1d' });
    ly += 20;
    for (const [keys, what] of HELP) {
      text(ctx, keys, x + 30, ly, { font: UI.fontBig, color: '#5a4a30' });
      text(ctx, what, x + 172, ly, { font: UI.fontBig });
      ly += 22;
    }

    ly += 8;
    text(ctx, 'CARA MAIN', x + 26, ly, { font: UI.font, color: '#8a2c1d' });
    ly += 20;
    for (const line of HELP_TEXT) {
      text(ctx, line, x + 30, ly, { font: UI.fontBig });
      ly += 20;
    }

    text(ctx, 'E atau Esc  ·  kembali', x + w / 2, y + h - 30,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }
}
