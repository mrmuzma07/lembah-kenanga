// Audio/Video Media Control Toolbar for Lembah Kenanga Virtual Office.
// Provides responsive buttons for Mic Mute/Unmute, Camera On/Off, Screen Sharing,
// Video Layout Toggle, and Input Device Settings.

export class AVControls {
  constructor({ livekitBridge, videoOverlay, onToast }) {
    this.bridge = livekitBridge;
    this.overlay = videoOverlay;
    this.onToast = onToast;

    this.micEnabled = false;
    this.camEnabled = false;
    this.screenEnabled = false;

    this.toolbar = null;
    this.settingsModal = null;

    this.initDOM();
  }

  initDOM() {
    // Media Control Toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'av-toolbar';
    Object.assign(this.toolbar.style, {
      position: 'fixed',
      bottom: '76px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '8px',
      background: 'rgba(26, 20, 16, 0.85)',
      padding: '6px 12px',
      borderRadius: '24px',
      border: '2px solid #8b5a2b',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.7)',
      zIndex: '25',
      userSelect: 'none',
      alignItems: 'center',
    });

    this.toolbar.innerHTML = `
      <button id="btn-mic" title="Mic (M)" style="${this.btnStyle('#8a2c1d')}">
        <span id="ic-mic">🔇</span> <span style="font-size: 13px;">Mic [M]</span>
      </button>
      <button id="btn-cam" title="Kamera (V)" style="${this.btnStyle('#8a2c1d')}">
        <span id="ic-cam">📷</span> <span style="font-size: 13px;">Kamera [V]</span>
      </button>
      <button id="btn-screen" title="Bagi Layar (P)" style="${this.btnStyle('#3f8fd6')}">
        <span id="ic-screen">🖥️</span> <span style="font-size: 13px;">Layar [P]</span>
      </button>
      <button id="btn-mode" title="Ubah Tampilan Video" style="${this.btnStyle('#5a4a30')}">
        <span id="ic-mode">🫧</span> <span style="font-size: 13px;">Bubble</span>
      </button>
      <button id="btn-settings" title="Pengaturan Piranti" style="${this.btnStyle('#5a4a30')}">
        ⚙️
      </button>
    `;

    document.body.appendChild(this.toolbar);

    // Event listeners
    this.btnMic = this.toolbar.querySelector('#btn-mic');
    this.btnCam = this.toolbar.querySelector('#btn-cam');
    this.btnScreen = this.toolbar.querySelector('#btn-screen');
    this.btnMode = this.toolbar.querySelector('#btn-mode');
    this.btnSettings = this.toolbar.querySelector('#btn-settings');

    this.btnMic.addEventListener('click', () => this.toggleMic());
    this.btnCam.addEventListener('click', () => this.toggleCam());
    this.btnScreen.addEventListener('click', () => this.toggleScreen());
    this.btnMode.addEventListener('click', () => this.toggleLayoutMode());
    this.btnSettings.addEventListener('click', () => this.openSettings());

    this.initSettingsModal();
  }

  btnStyle(bg) {
    return `
      background: ${bg};
      color: #f5e6c8;
      border: 1px solid #3a2a2a;
      border-radius: 16px;
      padding: 4px 10px;
      cursor: pointer;
      font-family: 'VT323', monospace;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s, transform 0.08s;
      outline: none;
    `;
  }

  async toggleMic() {
    this.micEnabled = !this.micEnabled;
    try {
      await this.bridge?.setMicrophone(this.micEnabled);
    } catch (e) {
      this.micEnabled = false;
      this.btnMic.style.background = '#8a2c1d';
      this.toolbar.querySelector('#ic-mic').textContent = '🔇';
      this.onToast?.('Izin mikrofon ditolak / tidak tersedia.');
      return;
    }
    this.btnMic.style.background = this.micEnabled ? '#4f9a29' : '#8a2c1d';
    this.toolbar.querySelector('#ic-mic').textContent = this.micEnabled ? '🎙️' : '🔇';
    this.onToast?.(this.micEnabled ? 'Mikrofon Aktif' : 'Mikrofon Dibisukan');
  }

  async toggleCam() {
    this.camEnabled = !this.camEnabled;
    try {
      await this.bridge?.setCamera(this.camEnabled);
    } catch (e) {
      this.camEnabled = false;
      this.btnCam.style.background = '#8a2c1d';
      this.toolbar.querySelector('#ic-cam').textContent = '📷';
      this.onToast?.('Izin kamera ditolak / tidak tersedia.');
      return;
    }
    this.btnCam.style.background = this.camEnabled ? '#4f9a29' : '#8a2c1d';
    this.toolbar.querySelector('#ic-cam').textContent = this.camEnabled ? '📹' : '📷';
    this.onToast?.(this.camEnabled ? 'Kamera Aktif' : 'Kamera Dimatikan');
  }

  async toggleScreen() {
    this.screenEnabled = !this.screenEnabled;
    try {
      await this.bridge?.setScreenShare(this.screenEnabled);
    } catch (e) {
      this.screenEnabled = false;
      this.btnScreen.style.background = '#3f8fd6';
      this.onToast?.('Berbagi layar dibatalkan.');
      return;
    }
    this.btnScreen.style.background = this.screenEnabled ? '#e08a1e' : '#3f8fd6';
    this.onToast?.(this.screenEnabled ? 'Berbagi Layar Dimulai' : 'Berbagi Layar Berhenti');
  }

  toggleLayoutMode() {
    const next = this.overlay?.toggleMode();
    const isBubble = next === 'bubble';
    this.toolbar.querySelector('#ic-mode').textContent = isBubble ? '🫧' : '🪟';
    this.toolbar.querySelector('#btn-mode span:last-child').textContent = isBubble ? 'Bubble' : 'Dock';
    this.onToast?.(`Mode Video: ${isBubble ? 'Floating Bubble' : 'Top Dock'}`);
  }

  initSettingsModal() {
    this.settingsModal = document.createElement('div');
    this.settingsModal.id = 'av-settings-modal';
    Object.assign(this.settingsModal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '110',
    });

    this.settingsModal.innerHTML = `
      <div style="background: #2a1f18; border: 3px solid #8b5a2b; border-radius: 8px; width: 380px; padding: 20px; color: #f5e6c8; font-family: 'VT323', monospace; box-shadow: 0 8px 24px rgba(0,0,0,0.9);">
        <div style="font-family: 'Press Start 2P', monospace; font-size: 11px; color: #f5e6c8; margin-bottom: 16px; text-align: center;">PENGATURAN PIRANTI</div>
        
        <label style="display: block; margin-bottom: 6px; font-size: 18px;">Input Mikrofon:</label>
        <select id="av-audio-in" style="width: 100%; padding: 6px; background: #fff8e8; border: 2px solid #3a2a2a; font-family: inherit; font-size: 16px; margin-bottom: 14px; color: #3a2a2a;">
          <option value="">Bawaan Sistem</option>
        </select>

        <label style="display: block; margin-bottom: 6px; font-size: 18px;">Kamera Webcam:</label>
        <select id="av-video-in" style="width: 100%; padding: 6px; background: #fff8e8; border: 2px solid #3a2a2a; font-family: inherit; font-size: 16px; margin-bottom: 20px; color: #3a2a2a;">
          <option value="">Bawaan Sistem</option>
        </select>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="av-settings-close" style="background: #4f9a29; color: #fff; border: 2px solid #3a2a2a; border-radius: 4px; padding: 4px 16px; cursor: pointer; font-family: inherit; font-size: 18px;">Simpan & Tutup</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.settingsModal);

    this.settingsModal.querySelector('#av-settings-close').addEventListener('click', () => {
      this.settingsModal.style.display = 'none';
    });
  }

  async openSettings() {
    this.settingsModal.style.display = 'flex';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioSelect = this.settingsModal.querySelector('#av-audio-in');
      const videoSelect = this.settingsModal.querySelector('#av-video-in');

      audioSelect.innerHTML = '<option value="">Bawaan Sistem</option>';
      videoSelect.innerHTML = '<option value="">Bawaan Sistem</option>';

      for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `${d.kind} (${d.deviceId.slice(0, 5)})`;
        if (d.kind === 'audioinput') audioSelect.appendChild(opt);
        if (d.kind === 'videoinput') videoSelect.appendChild(opt);
      }

      audioSelect.onchange = async () => {
        if (this.micEnabled) {
          await this.bridge?.setMicrophone(true, audioSelect.value || null);
          this.onToast?.('Mikrofon diganti.');
        }
      };

      videoSelect.onchange = async () => {
        if (this.camEnabled) {
          await this.bridge?.setCamera(true, videoSelect.value || null);
          this.onToast?.('Kamera diganti.');
        }
      };
    } catch (e) {
      console.warn('Could not list media devices:', e);
    }
  }
}
