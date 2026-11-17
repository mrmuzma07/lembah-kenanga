# Log Hasil Implementasi Fase 1: Multiplayer WebSocket & Gerakan Avatar Terkoordinasi

Dokumen ini mencatat secara rinci hasil implementasi **Fase 1** dari roadmap transformasi Lembah Kenanga menjadi platform kantor virtual 2D interaktif (Gather.town / WorkAdventure).

---

## 1. Ringkasan Eksekutif

Pada Fase 1 ini, platform Lembah Kenanga yang sebelumnya beroperasi secara *single-player* lokal berhasil ditingkatkan menjadi lingkungan **multi-pemain (multiplayer) tersinkronisasi real-time**. 

Setiap pemain yang membuka game di peramban kini terhubung melalui koneksi dua arah (bi-directional) berlatensi rendah. Pemain dapat melihat avatar satu sama lain bergerak secara halus di peta *valley*, melihat pergantian arah hadap dan animasi langkah kaki secara serentak, serta melihat badge nama pemain di atas masing-masing karakter.

---

## 2. Berkas yang Dibuat & Dimodifikasi

| Berkas | Status | Peran & Deskripsi |
|---|---|---|
| **`tools/ws.py`** | *Baru* | Server WebSocket RFC 6455 murni pustaka standar Python (`struct`, `base64`, `hashlib`, `socket`, `threading`). Mengelola *frame parsing*, unmasking client payload, broadcasting koordinat, heartbeat, dan manajemen sesi. |
| **`tools/serve.py`** | *Modifikasi* | Menambahkan penanganan HTTP `Upgrade: websocket` di `do_GET` untuk mengalihkan koneksi ke `ws.handle()`. Tidak membutuhkan port terpisah (tetap di port `47311`). |
| **`src/entities/remote-player.js`** | *Baru* | Entitas representasi pemain daring yang mewarisi `Character`. Mengimplementasikan interpolasi posisi (*Linear Interpolation / Lerp*), sinkronisasi sprite avatar, dan badge nama bergaya Gather.town. |
| **`src/network/socket.js`** | *Baru* | Modul client WebSocket: koneksi otomatis (`ws://` atau `wss://`), rekoneksi otomatis dengan backoff, pengiriman paket throttled 20 Hz (50 ms), dan heartbeat. |
| **`src/main.js`** | *Modifikasi* | Integrasi `state.socket`, registrasi `state.remotePlayers`, pembaruan posisi remote players di game loop `update(dt)`, dan pendaftaran entitas ke pipeline render *depth-sorted*. |

---

## 3. Spesifikasi Protokol & Pesan Jaringan

Protokol berjalan di atas WebSocket berformat JSON string:

### Alur Pesan:
```
Client Baru                                Server WebSocket                              Client Lain
    │                                             │                                           │
    ├─── HTTP GET /ws (Upgrade: websocket) ──────►│                                           │
    │◄── HTTP 101 Switching Protocols ────────────┤                                           │
    │                                             │                                           │
    ├─── { type: "join", name, avatar, x, y } ───►│                                           │
    │                                             ├─── { type: "join", player: {...} } ──────►│
    │◄── { type: "init", id, players: {...} } ────┤                                           │
    │                                             │                                           │
    ├─── { type: "move", x, y, dir, moving, ... }►│                                           │
    │                                             ├─── { type: "move", id, x, y, dir, ... } ─►│
    │                                             │                                           │
    ├─── { type: "avatar", avatar: "npc_bayu" } ─►│                                           │
    │                                             ├─── { type: "avatar", id, avatar } ───────►│
    │                                             │                                           │
    │ (Koneksi ditutup / Tab ditutup)             │                                           │
    └─── [TCP Close / Opcode 0x8] ───────────────►│                                           │
                                                  ├─── { type: "leave", id } ────────────────►│
```

### Definisi Skema Pesan:

1. **`join`** (Client $\to$ Server):
   ```json
   {
     "type": "join",
     "name": "Budi",
     "avatar": "player_m",
     "x": 384,
     "y": 640,
     "dir": "down"
   }
   ```
2. **`init`** (Server $\to$ Client yang baru masuk):
   ```json
   {
     "type": "init",
     "id": "7a8b9c",
     "players": {
       "123abc": { "id": "123abc", "name": "Siti", "avatar": "player_f", "x": 412, "y": 650, "dir": "left" }
     }
   }
   ```
3. **`move`** (Client $\leftrightarrow$ Server Broadcast):
   ```json
   {
     "type": "move",
     "id": "7a8b9c",
     "x": 390,
     "y": 640,
     "dir": "right",
     "moving": true,
     "speed": 96,
     "animT": 1.25,
     "avatar": "player_m"
   }
   ```
   *Throttling*: Dibatasi maksimal 20 paket per detik (20 Hz) saat berjalan, dan seketika dikirim saat status `moving` berubah (mis. mulai jalan atau berhenti).
4. **`avatar`** (Client $\leftrightarrow$ Server Broadcast):
   ```json
   {
     "type": "avatar",
     "id": "7a8b9c",
     "avatar": "npc_bayu"
   }
   ```
5. **`leave`** (Server $\to$ Clients):
   ```json
   {
     "type": "leave",
     "id": "7a8b9c"
   }
   ```

---

## 4. Mekanisme Interpolasi Gerakan & Visual

### A. Smoothing & Dead Reckoning (`RemotePlayer.update`)
Jeda jaringan antar-paket (50 ms) biasanya menyebabkan avatar pemain lain terlihat melompat atau bergetar. Untuk itu diterapkan **Exponential Lerp**:
$$\Delta x = targetX - currentX$$
$$x_{next} = currentX + \Delta x \times \min(1, dt \times 12)$$
- Jika jarak $\Delta > 96\text{ px}$ (misal saat *respawn* atau *teleport*), posisi langsung di-*snap* tanpa animasi geser.
- Jika $\Delta \le 1\text{ px}$, posisi dikunci tepat pada target dan state animasi disinkronkan.

### B. Badge Nama Pemain (Gather.town Style)
Di atas sprite kepala pemain lain (offset $-fh - 14\text{ px}$), dirender kartu identitas visual:
- Latar belakang semi-transparan hitam (`rgba(26, 20, 16, 0.75)`).
- Border pixel art warna krem (`#d9c39a`).
- Tipografi tajam resolusi tinggi font `VT323` warna krem cerah (`#fff3d6`).

---

## 5. Hasil Pengujian & Verifikasi Kualitas (QA)

### A. Pengujian End-to-End WebSocket Multi-Klien
Simulasi otomatis dua koneksi klien (`Alice` dan `Bob`) dijalankan pada port pengujian terisolasi:
1. **Handshake HTTP 101**: Kunci `Sec-WebSocket-Key` berhasil diproses menjadi `Sec-WebSocket-Accept` dengan hash SHA-1 + GUID RFC 6455.
2. **Koneksi Klien 1**: Menerima paket `init` dengan Client ID unik.
3. **Koneksi Klien 2**:
   - Klien 2 menerima daftar pemain lama (`Alice`).
   - Klien 1 menerima notifikasi `join` dari `Bob`.
4. **Sinkronisasi Gerak**: Klien 2 mengirim pergerakan ke $x=310$, Klien 1 seketika menerima koordinat baru.
5. **Pergantian Avatar**: Klien 2 berganti avatar ke `npc_bayu`, Klien 1 seketika menerima pembaruan avatar.
6. **Penanganan Disconnect**: Saat socket Klien 2 ditutup, Klien 1 menerima paket `leave` untuk Klien 2 dan entitas dibersihkan.
*Hasil: Semua pengujian lolos 100% tanpa error.*

### B. Verifikasi Standar & Kompilasi Kode
- Kompilasi Python: `python3 -m py_compile tools/ws.py tools/serve.py` $\to$ **Valid, 0 error**.
- Sintaksis JavaScript: `node --check src/network/socket.js && node --check src/entities/remote-player.js && node --check src/main.js` $\to$ **Valid, 0 error**.
- Pemeriksaan Skala Sprite: `uv run --with pillow python tools/check_scale.py --strict` $\to$ **78 sprite diperiksa, 0 masalah**.
- Skrip Build Rilis: `python3 tools/publish.py` $\to$ **155 berkas, 3 MB, build bersih**.

---

## 6. Kepatuhan Kontrak Repositori (Architecture Compliance)

- [x] **Nol Dependensi Tambahan**: Tidak ada paket `pip` atau `npm` baru yang ditambahkan. WebSocket berjalan di atas modul bawaan Python (`socketserver`, `struct`, `base64`, `hashlib`).
- [x] **ES Modules Natif**: Frontend menggunakan modul ES2022 murni tanpa bundler (Vite/Webpack).
- [x] **Single Port Deployment**: Server dev dan produksi tetap berjalan hanya dengan `python tools/serve.py 47311`.

---

## 7. Kesiapan Menuju Fase 2

Fondasi jaringan sinkronisasi koordinat telah selesai dan siap dihubungkan dengan:
- **Fase 2**: Integrasi LiveKit Server SFU (Docker) & Coturn untuk aliran WebRTC video dan audio.
- Client ID WebSocket ini nantinya akan dipetakan langsung dengan **LiveKit Participant Identity** sehingga kalkulasi audio/video spasial pada Fase 3 dapat berjalan sinkron dengan posisi avatar di map.
