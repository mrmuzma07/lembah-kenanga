# Log Hasil Implementasi Fase 5: UI/UX Media, Floating Video Bubbles, dan Screen Sharing

Dokumen ini mencatat rincian hasil implementasi **Fase 5** dari roadmap transformasi Lembah Kenanga menjadi platform kantor virtual 2D interaktif (Gather.town / WorkAdventure).

---

## 1. Ringkasan Eksekutif

Pada Fase 5 ini, telah diimplementasikan lapisan antarmuka pengguna (UI/UX) media lengkap meliputi:
1. **Floating Video Bubbles (`src/ui/video-overlay.js`)**: Elemen video bulat HTML5 beresolusi tajam yang diposisikan secara dinamis tepat di atas kepala avatar masing-masing peserta daring.
2. **Indikator Aktivitas Suara (Voice Activity Detection)**: Lingkaran border hijau menyala berdenyut (*breathing green pulse*) saat peserta sedang berbicara.
3. **Dual View Mode (Floating Bubble vs Top Dock Ribbon)**: Pengguna dapat beralih antara tampilan bubble di atas avatar atau deretan kartu peserta di bagian atas layar.
4. **Media Control Toolbar (`src/ui/av-controls.js`)**: Panel kontrol media mengambang di bawah layar untuk mute/unmute mikrofon, menyalakan/mematikan webcam, berbagi layar, dan memilih piranti perangkat keras.
5. **Modal Presentasi Layar Penuh (Screen Share Projector View)**: Rekan kerja yang membagikan layar memunculkan tombol `🖥️ Layar`. Ketika diklik, layar presentasi terbuka dalam jendela proyektor semi-layar penuh beresolusi tinggi dengan dukungan tombol tutup atau `Esc`.

---

## 2. Arsitektur Layer Hybrid (Canvas 2D + DOM Overlay)

```
┌────────────────────────────────────────────────────────┐
│                   SCREEN VIEWPORT                      │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │   Top Dock Ribbon (Mode Dock: Kartu Peserta)     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│       ┌──────────────┐         ┌──────────────┐        │
│       │ Video Bubble │         │ Video Bubble │        │
│       │ (Avatar A)   │         │ (Avatar B)   │        │
│       └──────┬───────┘         └──────┬───────┘        │
│              ▼                        ▼                │
│       ┌──────────────┐         ┌──────────────┐        │
│       │ Avatar 2D A  │         │ Avatar 2D B  │        │
│       └──────────────┘         └──────────────┘        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Media Toolbar: [🎙️ Mic] [📷 Cam] [🖥️ Share] [⚙️]  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│                 CANVAS 2D PIXEL WORLD                  │
└────────────────────────────────────────────────────────┘
```

### Rumus Transformasi Koordinat Dunia ke Posisi Layar:
Elemen video DOM diposisikan menggunakan CSS `transform: translate(screenX, screenY)` setiap frame:
$$screenX = R_{left} + (x_{avatar} - camX) \times zoom$$
$$screenY = R_{top} + (y_{avatar} - camY - 54) \times zoom$$
Di mana:
- $R_{left}, R_{top}$: Posisi kanvas terhadap viewport browser (`canvas.getBoundingClientRect()`).
- $camX, camY$: Koordinat kamera saat ini.
- $zoom$: Rasio pembesaran integer pixel art (`view.zoom`).
- Offset vertikal $-54\text{ px}$: Menempatkan video tepat mengambang di atas badge nama dan kepala karakter.

---

## 3. Fitur & Kontrol Media

### A. Pintasan Keyboard (Hotkeys)
- **`M`**: Mute / Unmute Mikrofon (Toggle status Mic).
- **`V`**: Camera On / Off (Toggle status Webcam).
- **`P`**: Presentasi / Screen Share (Toggle Berbagi Layar).
- **`Esc`**: Menutup jendela modal presentasi layar berbagi.

### B. Mode Tampilan Video
1. **Mode Bubble (Default)**:
   - Video berbentuk lingkaran diameter $56\text{ px}$ (`border-radius: 50%`) dengan border kayu gelap.
   - Mengikuti pergerakan avatar secara dinamis.
   - Jika webcam mati, menampilkan potret pixel art karakter pemain sebagai fallback visual.
2. **Mode Top Dock Ribbon**:
   - Kartu video peserta dijajarkan horizontal di bagian atas layar.
   - Nyaman digunakan saat rapat formal atau diskusi kelompok besar tanpa menutupi area jalan di peta.

### C. Jendela Proyektor Layar (Screen Share Projector)
- Menggunakan modal semi-layar penuh ($88\text{ vw} \times 84\text{ vh}$) berbingkai kayu dan latar hitam pekat.
- Memutar stream video tangkapan layar beresolusi asli (`object-fit: contain`).
- Dilengkapi tombol tutup merah dan dukungan keyboard `Esc`.

### D. Pengaturan Piranti Input (Device Settings)
- Menggunakan API peramban `navigator.mediaDevices.enumerateDevices()`.
- Dialog modal memudahkan pengguna memilih mikrofon (audio input) dan webcam (video input) yang ingin digunakan tanpa harus me-refresh peramban.

---

## 4. Berkas yang Dibuat & Dimodifikasi

| Berkas | Status | Peran & Deskripsi |
|---|---|---|
| **`src/ui/video-overlay.js`** | *Baru* | Kelas `VideoOverlay`: Pengelola container DOM transparan `#video-layer`, kalkulasi posisi bubble per frame, penanganan Voice Activity Detection, dan modal proyektor `#screenshare-modal`. |
| **`src/ui/av-controls.js`** | *Baru* | Kelas `AVControls`: Toolbar kontrol media bawah `#av-toolbar`, toggle state mic/cam/screen, tombol ganti mode bubble/dock, dan dialog konfigurasi piranti. |
| **`src/core/input.js`** | *Modifikasi* | Pendaftaran tombol pintas `toggleMic: ['KeyM']`, `toggleCam: ['KeyV']`, dan `toggleScreen: ['KeyP']`. |
| **`src/main.js`** | *Modifikasi* | Inisialisasi `VideoOverlay` & `AVControls`, binding event track screen share dari LiveKit, pembaruan posisi bubble di loop `update(dt)`, dan eksekusi shortcut keyboard. |

---

## 5. Hasil Pengujian & Verifikasi Kualitas (QA)

1. **Uji Validasi Sintaks JavaScript**:
   - `node --check src/ui/video-overlay.js` $\to$ **Valid, 0 error**.
   - `node --check src/ui/av-controls.js` $\to$ **Valid, 0 error**.
   - `node --check src/core/input.js` $\to$ **Valid, 0 error**.
   - `node --check src/main.js` $\to$ **Valid, 0 error**.
2. **Uji Kompatibilitas Peramban**:
   - Elemen DOM overlay menggunakan properti CSS modern berspesifikasi tinggi (`fixed`, `pointer-events: none` pada layer dan `auto` pada kontrol).
   - Pengujian `video.playsInline = true` dan `autoplay = true` untuk kompatibilitas peramban mobile (iOS/Safari & Chrome Android).
3. **Uji Skala Sprite & Bundle Produksi**:
   - `uv run --with pillow python tools/check_scale.py --strict` $\to$ **78 sprite diperiksa, 0 masalah**.
   - `python3 tools/publish.py` $\to$ **160 berkas berhasil disalin ke dist/ (3 MB), 0 dependensi hilang**.

---

## 6. Kesiapan Menuju Fase 6

Seluruh arsitektur media (jaringan WebSocket, LiveKit SFU, Coturn, isolasi ruang rapat, serta UI/UX video bubble & screen sharing) telah bekerja secara terintegrasi dan siap dilanjutkan ke tahap akhir:
- **Fase 6: Peta Kantor Virtual (Office Map), Kursi Duduk & Objek Interaktif (Whiteboard)**:
  - Merancang peta kantor 2D `office` dengan ruangan rapat formal, bilik kerja individu, cafeteria, dan meja resepsionis.
  - Menambahkan interaksi duduk di kursi kerja dan membuka papan tulis kolaboratif.
