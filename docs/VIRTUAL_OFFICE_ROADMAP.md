# Transformasi Lembah Kenanga Menjadi Virtual Office 2D (Gather.town / WorkAdventure)
### Dokumen Analisis Gap, Arsitektur Sistem, Roadmap Implementasi, dan Prompt AI

---

## 1. Ringkasan Eksekutif & Visi Sistem

Dokumen ini memetakan rencana strategis dan teknis untuk mentransformasikan basis kode **Lembah Kenanga** (game simulasi 2D pixel art berbasis Canvas & JavaScript natif) menjadi platform **Virtual Office / Virtual Space** seperti **Gather.town** dan **WorkAdventure**.

### Visi Platform:
Sebuah ruang virtual 2D interaktif tempat tim dapat berkumpul, bekerja, dan berkolaborasi. Pengguna menggerakkan avatar di peta kantor virtual, dan saat mendekati avatar lain (proksimitas spasial), audio dan video mereka terhubung secara otomatis. Platform juga mendukung ruang rapat privat (private meeting rooms), berbagi layar (screen sharing), serta integrasi media WebRTC latensi rendah berskala besar menggunakan **LiveKit SFU** dan **Coturn (STUN/TURN)**.

---

## 2. Analisis GAP Komprehensif (Current State vs Target State)

| Dimensi | Kondisi Lembah Kenanga Saat Ini | Kebutuhan Target (Gather.town / WorkAdventure) | Gap / Hal yang Harus Dibuat |
|---|---|---|---|
| **Multiplayer & Gerakan** | Single-player lokal; posisi pemain hanya disimpan di `localStorage` & server saat tidur/simpan. | Sinkronisasi posisi avatar real-time multi-pemain (10–20 Hz) dengan interpolasi gerakan halus. | Server WebSocket/Signaling state, sinkronisasi posisi avatar, interpolasi posisi entitas online (remote players). |
| **Komunikasi Suara & Video** | Tidak ada audio/video real-time. Audio murni sintesis prosedural Web Audio lokal. | Proximity Video/Audio Call real-time. Volume suara mengecil sesuai jarak; video mati di luar radius. | Integrasi **LiveKit Client SDK**, perhitungan jarak spasial (Euclidean distance), stereo panning audio, manajemen langganan trek (track subscription). |
| **Infrastruktur Media** | Server Python statis + long-poll chat HTTP tanpa kemampuan streaming media. | Media server WebRTC (SFU) untuk routing video/audio banyak orang + STUN/TURN server untuk tembus firewall/NAT. | Instalasi & konfigurasi **LiveKit Server** + **Coturn**, backend token auth LiveKit JWT. |
| **Zonasi & Ruang Rapat** | Satu peta terbuka 48×48 (`valley`) tanpa konsep isolasi ruangan audio/video. | Partisi area: **Private Spaces** (ruang rapat/meja kerja terisolasi), **Lobby**, dan **Quiet Zones**. | Sistem metadata tilemap `zoneId`, deteksi overlap poligon/bounding box, isolasi komunikasi per-zona (room isolation). |
| **Interaksi Kolaborasi** | Interaksi bertani/toko (`E` ke petak/pintu/NPC). | Berbagi layar (Screen Sharing), papan tulis virtual (Whiteboard), tautan rapat (Jitsi/Meet embed). | UI screen share projector, objek interaktif kantor (meja, kursi duduk, monitor presentasi). |
| **Antarmuka (UI/UX)** | HUD game bertani (energi, uang, tanggal, hotbar benih). | Floating video bubble di atas kepala avatar, top ribbon video participant, kontrol Mic/Cam/Screen on/off. | Komponen Canvas/DOM hybrid untuk video streaming, overlay indikator bicara, panel pengaturan mikrofon/kamera. |

---

## 3. Arsitektur Sistem Target

```
                       ┌────────────────────────────────────────────────────────┐
                       │                     CLIENT BROWSER                     │
                       │                                                        │
                       │  ┌────────────────────────┐  ┌──────────────────────┐  │
                       │  │   Canvas 2D Engine     │  │  LiveKit Client SDK  │  │
                       │  │  - Tilemap & Avatars   │  │  - WebRTC Audio/Cam  │  │
                       │  │  - Remote Interpolation│  │  - Screen Sharing     │  │
                       │  │  - Spatial Calculation │  │  - Volume & Pan node │  │
                       │  └───────────┬────────────┘  └──────────┬───────────┘  │
                       │              │                          │              │
                       └──────────────┼──────────────────────────┼──────────────┘
                                      │ WebSocket                │ WebRTC (SRTP/ICE)
                                      │                          │
        ┌─────────────────────────────┼──────────────────────────┼─────────────────────────────┐
        │                             ▼                          ▼                             │
        │                 ┌───────────────────────┐  ┌───────────────────────┐                 │
        │                 │  Signaling & State    │  │   LiveKit SFU Server  │                 │
        │                 │  - Posisi Avatar      │  │  - Video/Audio router │                 │
        │                 │  - Token JWT LiveKit  │  │  - Selective sub      │                 │
        │                 │  - Presence & Room    │  └───────────┬───────────┘                 │
        │                 └───────────┬───────────┘              │ ICE Candidates              │
        │                             │                          ▼                             │
        │                             │              ┌───────────────────────┐                 │
        │                             │              │   Coturn (STUN/TURN)  │                 │
        │                             │              │  - UDP/TCP/TLS Relay  │                 │
        │                             │              │  - NAT Traversal      │                 │
        │                             │              └───────────────────────┘                 │
        │                             ▼                                                        │
        │                 ┌───────────────────────┐                                            │
        │                 │ Database (Redis/WAL)  │                                            │
        │                 └───────────────────────┘                                            │
        │                                                                                      │
        │                                  BACKEND CLUSTER                                     │
        └──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Komponen Infrastruktur:
- **LiveKit Server (SFU)**: Mengelola distribusi video/audio. Bekerja secara *Selective Forwarding* (hanya mengirimkan video orang terdekat, bukan semua orang di kantor).
- **Coturn**: Server STUN/TURN untuk menangani koneksi pemain yang berada di balik NAT kantor ketat, VPN, atau firewall simetris.
- **Signaling & World State Server**: Mengirimkan paket koordinat posisi pemain ($x, y$, arah, animasi, zone) dengan latensi rendah (<50ms).
- **Frontend App**: Engine game Lembah Kenanga yang dimodifikasi untuk merender avatar pemain lain, floating video feed, dan mengatur volume audio spasial.

---

## 4. Matriks Komponen yang Butuh Dibuat

### A. Frontend (`src/`)
1. **`src/network/socket.js`**: Manajemen koneksi WebSocket ke signaling server, rekoneksi otomatis, dan pertukaran state gerak.
2. **`src/network/livekit-bridge.js`**: Integrasi LiveKit SDK (`livekit-client`), pengelola track mikrofon, kamera, dan screen share.
3. **`src/systems/spatial-av.js`**:
   - Menghitung jarak Euclidean antar avatar pemain: $d = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}$.
   - Linear attenuation:
     $$Volume(d) = \begin{cases} 1.0, & d \le R_{min} \\ 1.0 - \frac{d - R_{min}}{R_{max} - R_{min}}, & R_{min} < d \le R_{max} \\ 0.0, & d > R_{max} \end{cases}$$
   - Pengaturan Stereo Panner Node Web Audio berdasarkan selisih posisi horizontal ($\Delta x$).
4. **`src/world/zones.js`**: Pengelola zona (Private Room, Meeting Space, Silent Desk). Logika isolasi media: jika pemain berada di dalam `zoneId` yang sama, abaikan jarak dan hubungkan audio/video langsung; jika berbeda zona, putus aliran media.
5. **`src/entities/remote-player.js`**: Representasi avatar pemain lain di dunia 2D dengan interpolasi pergerakan (linear interpolation / lerp) agar tidak patah-patah.
6. **`src/ui/av-controls.js`**: Kontrol mengaktifkan/mematikan mikrofon, kamera, tombol ganti piranti (device selector), dan tombol berbagi layar.
7. **`src/ui/video-overlay.js`**: Menampilkan stream video HTML5 (elemen `<video>`) tepat di atas avatar (bubble view) atau di baris atas layar (ribbon view).

### B. Backend (`server/` & `tools/`)
1. **LiveKit Token Service**: Endpoint HTTP (`GET /api/livekit/token`) yang menghasilkan access token JWT terenkripsi dengan izin publish audio/video.
2. **Multiplayer State Server**: Server WebSocket untuk sinkronisasi posisi pemain, broadcast perubahan zona, dan status mic/cam.
3. **Docker Compose & Deployment Scripts**: File orchestrator untuk menjalankan LiveKit, Coturn, dan Web Application dalam satu jaringan terisolasi.

---

## 5. Urutan Pengerjaan Bertahap (Roadmap)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Fondasi Multiplayer & Sinkronisasi Gerakan Avatar                      │
│ - Setup WebSocket Server                                                       │
│ - Sinkronisasi pergerakan avatar online & interpolasi posisi                   │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 2: Infrastruktur LiveKit SFU & Coturn (STUN/TURN)                         │
│ - Dockerisasi LiveKit Server + Coturn                                          │
│ - Endpoint Token Auth JWT (FastAPI / Node.js)                                  │
│ - Pemuatan LiveKit Client SDK di browser                                       │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 3: Engine Proksimitas Spasial (Spatial Audio & Video)                     │
│ - Perhitungan jarak Euclidean antar avatar                                     │
│ - Selective Track Subscription LiveKit (hanya subscribe audio/video terdekat)  │
│ - Atenuasi volume & Web Audio StereoPanner                                     │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 4: Private Meeting Spaces & Dynamic Zones                                 │
│ - Definisi layer zona pada peta kantor (Meeting Room A, B, Open Desk)          │
│ - Logika isolasi ruangan (Room Partitioning)                                   │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 5: UI/UX Media, Floating Video Bubble & Screen Sharing                    │
│ - Overlay video tag di atas kepala avatar / Dock bar atas                      │
│ - Bar kontrol: Mute Mic, Toggle Cam, Screen Share, Audio Indicator             │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FASE 6: Layout Kantor Virtual 2D & Objek Kolaboratif                           │
│ - Peta kantor 2D: Meja, Kursi, Papan Tulis, Ruang Konferensi                  │
│ - Interaksi duduk di kursi & presentasi layar penuh                            │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Katalog Prompt AI Siap Pakai per Fase

Berikut adalah prompt komprehensif yang siap disalin dan diberikan ke AI coding agent untuk setiap tahap implementasi:

---

### Prompt Fase 1: Multiplayer WebSocket & Gerakan Avatar Terkoordinasi

```markdown
ROLE:
Senior Fullstack Multiplayer Game Engineer.

GOAL:
Buat sistem multiplayer real-time untuk game 2D Lembah Kenanga menggunakan WebSocket agar posisi dan animasi avatar pemain dapat tersinkronisasi antar pengguna.

CONTEXT:
Game ini berbasis Canvas 2D murni tanpa bundler (ES Modules natif). Karakter lokal digerakkan dengan keyboard (WASD/panah) pada kecepatan 96 px/s (jalan) dan 168 px/s (lari). Kita membutuhkan backend WebSocket server ringan dan komponen client untuk merender avatar pemain lain (RemotePlayer).

REQUIREMENTS:
1. Backend (Python/Node):
   - Buat server WebSocket yang menerima koneksi dengan autentikasi username & avatar.
   - Terima paket gerak dari client berupa: { id, x, y, dir, moving, speed, animT, avatar }.
   - Siarkan (broadcast) state pemain lain pada rate 15-20 Hz ke seluruh pemain di map yang sama.
   - Tangani disconnect (cleanup entitas pemain saat tab ditutup).

2. Frontend:
   - Buat modul `src/network/socket.js` yang mengatur koneksi WebSocket, buffering paket, dan heartbeat/ping-pong.
   - Buat class `RemotePlayer` di `src/entities/remote-player.js` yang mewarisi perilaku visual `Character`:
     - Terapkan interpolasi posisi (Lerp: Linear Interpolation) untuk x dan y agar gerakan pemain lain terasa mulus dan tidak teleportasi/patah-patah akibat jeda paket jaringan.
     - Gambar kontak shadow, frame animasi kaki, dan arah hadap sesuai data yang diterima.
   - Di `src/main.js`, integrasikan `state.remotePlayers = new Map()` ke dalam pipeline render entitas (depth-sorting berdasar koordinat y).

ACCEPTANCE CRITERIA:
- Membuka 2 tab browser berbeda menampilkan kedua avatar berjalan di satu layar secara real-time.
- Gerakan avatar lain terlihat halus (lerp interpolation berjalan baik).
- Tidak ada error pada console browser saat salah satu tab ditutup atau di-refresh.
```

---

### Prompt Fase 2: Deployment LiveKit SFU, Coturn, dan Token Generator Service

```markdown
ROLE:
DevOps & WebRTC Infrastructure Specialist.

GOAL:
Siapkan infrastruktur WebRTC lengkap menggunakan LiveKit SFU dan Coturn (STUN/TURN), serta endpoint REST API untuk menerbitkan JWT token LiveKit ke client.

CONTEXT:
Platform virtual office membutuhkan streaming audio/video multi-pemain berkualitas tinggi dan mampu menembus firewall perusahaan. Kita akan men-deploy LiveKit Server dan Coturn menggunakan Docker Compose, serta menyediakan layanan otentikasi token untuk frontend.

REQUIREMENTS:
1. Docker Compose (`infra/docker-compose.yml`):
   - Service `livekit`: Image `livekit/livekit-server:latest`, ekspos port WebRTC UDP/TCP (7880, 7881, 50000-50200/udp).
   - Service `coturn`: Image `coturn/coturn:latest`, konfigurasi STUN/TURN dengan user:password terproteksi, port 3478 UDP/TCP dan port relay 49152-65535/udp.
   - Buat file konfigurasi `infra/livekit.yaml` yang menghubungkan LiveKit ke server Coturn sebagai ICE TURN server.

2. Token Generator Backend:
   - Buat endpoint HTTP `POST /api/livekit/token` (bisa diintegrasikan ke `tools/serve.py` atau service Python terpisah).
   - Menerima payload: `{ username, room, avatar }`.
   - Menghasilkan LiveKit JWT token valid dengan permission: `canPublish: true`, `canSubscribe: true`, `roomJoin: true`.
   - Gunakan `API_KEY` dan `API_SECRET` yang sinkron dengan konfigurasi `livekit.yaml`.

3. Client SDK Wrapper (`src/network/livekit-bridge.js`):
   - Import `livekit-client` via ESM CDN (misal `https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs`) tanpa memerlukan npm/bundler.
   - Buat fungsi `connectLiveKit(url, token)` yang menginisialisasi `Room`, mempublikasikan track mikrofon dan kamera lokal.

ACCEPTANCE CRITERIA:
- Menjalankan `docker compose up -d` membuat service LiveKit dan Coturn berstatus healthy.
- Endpoint `/api/livekit/token` berhasil mengembalikan JWT token yang valid.
- Script frontend dapat terkoneksi ke Room LiveKit dan berhasil mempublikasikan dummy audio/video track.
```

---

### Prompt Fase 3: Proximity-Based Spatial Audio/Video Engine

```markdown
ROLE:
WebRTC & Game Math Specialist.

GOAL:
Implementasikan logika proksimitas spasial (spatial proximity) gaya Gather.town di frontend Lembah Kenanga menggunakan LiveKit Client SDK dan Web Audio API.

CONTEXT:
Di Gather.town, pengguna hanya mendengar dan melihat orang yang berada dekat dengan avatarnya di peta 2D. Semakin dekat, suara semakin keras. Semakin jauh, suara meredup hingga mati total, dan video stream di-unsubscribe untuk menghemat bandwidth.

REQUIREMENTS:
Buat modul `src/systems/spatial-av.js`:
1. Parameter Jarak:
   - `R_MIN = 3 * 32` (96px, ~3 tile): Jarak kontak penuh (Volume 100%, Video HD).
   - `R_MAX = 7 * 32` (224px, ~7 tile): Jarak batas pendengaran (Volume 0%, Video off).
2. Perhitungan Jarak Real-Time:
   - Setiap frame (di loop game `update(dt)`), hitung jarak Euclidean antara `state.player` dan setiap `remotePlayer`:
     `dist = Math.hypot(player.x - remote.x, player.y - remote.y)`
3. Dynamic Track Subscription (LiveKit SFU):
   - Jika `dist <= R_MAX`:
     - Setel subscription track video & audio pemain tersebut ke `active / subscribed: true`.
   - Jika `dist > R_MAX`:
     - Setel subscription track video & audio ke `subscribed: false`. Ini sangat penting agar bandwidth tidak melonjak saat ada puluhan pemain di kantor!
4. Spatial Audio Panning & Volume Attenuation:
   - Pasang Web Audio `GainNode` dan `StereoPannerNode` pada audio element/track remote player.
   - Hitung gain: `volume = clamp(1 - (dist - R_MIN) / (R_MAX - R_MIN), 0, 1)`.
   - Hitung pan horizontal: `pan = clamp((remote.x - player.x) / R_MAX, -1, 1)`.
   - Terapkan gain dan pan ke audio stream secara mulus (`linearRampToValueAtTime`).

ACCEPTANCE CRITERIA:
- Saat dua avatar saling mendekat (< 7 tile), audio dan video aktif dan terdengar semakin jelas.
- Saat avatar bergerak ke kiri/kanan teman bicaranya, efek stereo panning terdengar jelas di headphone.
- Saat avatar menjauh (> 7 tile), audio hening dan streaming video berhenti otomatis.
```

---

### Prompt Fase 4: Private Meeting Spaces & Room Isolation

```markdown
ROLE:
Game Systems & Spatial Partitioning Architect.

GOAL:
Buat sistem Private Space / Meeting Room seperti di Gather.town dan WorkAdventure, di mana orang di dalam ruangan tertutup hanya bisa mendengar dan melihat rekan di ruangan yang sama.

CONTEXT:
Di kantor virtual, ada ruang rapat berpartisi, meja kerja individu (focus desk), dan area santai. Orang yang berada di dalam Ruang Rapat A tidak boleh mendengar percakapan di luar atau di Ruang Rapat B, meskipun jarak tile-nya dekat.

REQUIREMENTS:
1. Definisi Zona (`src/world/zones.js`):
   - Buat format deklarasi zona di map:
     ```javascript
     {
       id: "meeting_room_alpha",
       name: "Ruang Rapat Alpha",
       type: "private", // "private" | "open" | "quiet"
       bounds: { c0: 10, r0: 15, c1: 18, r1: 22 } // rect tile
     }
     ```
   - Fungsi `getZoneAt(c, r)` yang mengembalikan objek zona berdasarkan koordinat tile avatar.

2. Integrasi Logika Spatial AV:
   - Modifikasi `src/systems/spatial-av.js`:
     - Ambil `myZone = getZoneAt(player.tile)` dan `theirZone = getZoneAt(remotePlayer.tile)`.
     - **Kasus 1**: Jika `myZone.type === "private"` dan `myZone.id === theirZone.id`:
       - Hubungkan audio & video 100% (volume penuh tanpa penurunan jarak).
     - **Kasus 2**: Jika salah satu berada di `private` zone tetapi `myZone.id !== theirZone.id`:
       - Blokir koneksi total: Volume = 0, Video = unsubscribed.
     - **Kasus 3**: Jika keduanya berada di area terbuka (`open` zone):
       - Gunakan aturan proksimitas jarak standar (Fase 3).

3. Visual Feedback:
   - Saat avatar melangkah masuk ke private space, tampilkan indikator visual halus di layar:
     - Overlay border lantai ruangan menyala tipis.
     - Toast / HUD notifikasi kecil di tengah bawah: *"Masuk ke: Ruang Rapat Alpha"*.

ACCEPTANCE CRITERIA:
- Masuk ke ruang rapat membuat semua avatar di luar ruangan langsung bisu dan videonya menghilang.
- Semua orang yang berada di dalam ruang rapat yang sama saling terhubung audio & videonya dengan jernih.
- Keluar dari pintu ruang rapat mengembalikan mode proksimitas reguler.
```

---

### Prompt Fase 5: UI/UX Media, Floating Video Bubbles, dan Screen Sharing

```markdown
ROLE:
Frontend UI/UX & WebRTC Media Engineer.

GOAL:
Kembangkan antarmuka video chat 2D interaktif meliputi floating video bubbles di atas avatar, video dock bar, kontrol media (Mic/Cam/Share), dan modal presentasi layar penuh.

CONTEXT:
Game saat ini me-render semua grafis pada Canvas 2D. Elemen `<video>` WebRTC paling efisien dirender sebagai layer DOM HTML5 transparan yang diposisikan di atas Canvas mengikuti posisi kamera dan avatar pemain.

REQUIREMENTS:
1. Video Overlay DOM (`src/ui/video-overlay.js`):
   - Buat container DOM transparan di atas canvas: `<div id="video-layer"></div>`.
   - Untuk setiap `remotePlayer` yang sedang dalam jarak komunikasi aktif:
     - Tampilkan elemen video sirkular (bubble ukuran 64×64 atau 80×80 px) dengan border rounded-full.
     - Hitung koordinat layar: `screenX = Math.round((player.x - camera.x) * zoom)`, `screenY = Math.round((player.y - camera.y - 48) * zoom)`.
     - Tambahkan indikator mikrofon aktif (lingkaran border hijau menyala berdenyut saat pemain sedang berbicara).
   - Sediakan toggle untuk beralih antara "Floating Bubble Mode" dan "Top Dock Ribbon Mode" (deretan kartu video di bagian atas layar).

2. Media Control Toolbar (`src/ui/av-controls.js`):
   - Tambahkan panel kontrol di bagian bawah layar:
     - Tombol **Mic Toggle** (Mute/Unmute) dengan status shortcut keyboard (misal tombol `M`).
     - Tombol **Camera Toggle** (On/Off) (shortcut `V`).
     - Tombol **Screen Share** (Share Screen) (shortcut `S`).
     - Tombol **Settings** (Pilih input mikrofon dan webcam yang aktif).

3. Screen Share Presentation Window:
   - Saat seorang pemain mengaktifkan Screen Share di LiveKit:
     - Avatar mereka memunculkan ikon monitor bercahaya.
     - Client rekan satu ruangan/proksimitas memunculkan tombol *"Lihat Layar [Nama]"*.
     - Jika diklik, buka jendela modal semi-layar penuh (projector view) dengan resolusi tajam dan kontrol zoom.

ACCEPTANCE CRITERIA:
- Video bubble menempel tepat di atas avatar dan bergerak mulus mengikuti pergerakan kamera tanpa lagging posisi.
- Border hijau menyala saat ada suara masuk (Voice Activity Detection).
- Tombol Mute Mic, Toggle Camera, dan Screen Share berfungsi responsif.
```

---

### Prompt Fase 6: Peta Kantor Virtual (Office Map), Kursi Duduk & Objek Interaktif

```markdown
ROLE:
2D Level Designer & Gameplay Content Developer.

GOAL:
Buat map kantor virtual 2D yang lengkap dan estetis di Lembah Kenanga menggantikan/melengkapi peta desa lama, lengkap dengan perabot kantor interaktif (meja kerja, kursi yang bisa diduduki, dan papan tulis).

CONTEXT:
Lembah Kenanga memiliki arsitektur map berbasis tile 32×32 (`src/world/map.js` dan `src/world/layout.js`). Kita akan membuat map kantor baru bernama `office` yang lolos audit area dan memiliki fasilitas ruang kerja modern bergaya pixel art.

REQUIREMENTS:
1. Map Kantor Virtual (`src/world/office.js`):
   - Ukuran: 48×48 tile (sesuai batasan arsitektur `maxSpan`).
   - Zona-zona utama:
     - **Main Lobby & Reception**: Area penyambutan saat spawn pertama kali.
     - **Open Workspace**: 4 kelompok meja kerja (pods) masing-masing berisi 4–6 meja komputer.
     - **Meeting Rooms**: 3 ruang rapat tertutup dengan meja oval panjang (Alpha, Beta, All-Hands Room).
     - **Lounge & Cafeteria**: Area santai dengan sofa, mesin kopi, dan dispenser air.
     - **Quiet Focus Pods**: Bilik kerja sunyi individual.
2. Mekanisme Duduk di Kursi:
   - Dekati kursi kantor dan tekan `E` untuk duduk:
     - Avatar terkunci posisinya di petak kursi, frame karakter beralih ke pose menghadap meja.
     - Tekan tombol gerak (WASD) untuk berdiri kembali.
3. Objek Interaktif Papan Tulis (Whiteboard):
   - Tempatkan objek papan tulis di ruang rapat.
   - Menekan `E` di depan papan tulis membuka iframe modal kolaborasi (seperti Excalidraw atau tldraw tersemat).

ACCEPTANCE CRITERIA:
- Map baru dapat dimuat tanpa error dan lolos audit layout (`auditArea(map)` menghasilkan `ok: true`).
- Avatar dapat duduk di kursi kantor dan bangkit dengan wajar.
- Objek interaktif di ruang rapat dapat diakses menggunakan tombol `E`.
```

---

## 7. Rekomendasi Stack & Estimasi Infrastruktur

| Kebutuhan | Rekomendasi Solusi | Alasan |
|---|---|---|
| **Media SFU** | **LiveKit Server (Go)** | Performa sangat tinggi, arsitektur cloud-native, mendukung Selective Subscriptions bawaan, dan SDK browser matang. |
| **STUN/TURN** | **Coturn** | Standar industri open-source, ringan, teruji di lingkungan enterprise & NAT ganda. |
| **Signaling Server** | **Node.js (ws) atau Python (FastAPI/WebSockets)** | Cepat, mudah menangani ribuan koneksi konkuren dengan memori rendah. |
| **Hosting VPS** | Minimum 4 vCPU, 8 GB RAM, Bandwidth 1 Gbps | Cukup untuk melayani 50–100 pengguna aktif simultan dengan video proksimitas terkompresi. |

---

*Dokumen ini dapat langsung digunakan sebagai panduan kerja arsitektural maupun prompt eksekusi untuk LLM agent dalam mengonversi repositori Lembah Kenanga ke platform Virtual Office.*
