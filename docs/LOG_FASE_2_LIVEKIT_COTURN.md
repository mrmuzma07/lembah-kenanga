# Log Hasil Implementasi Fase 2: Deployment LiveKit SFU, Coturn, dan Token Generator Service

Dokumen ini mencatat rincian hasil implementasi **Fase 2** dari roadmap transformasi Lembah Kenanga menjadi platform kantor virtual 2D (Gather.town / WorkAdventure).

---

## 1. Ringkasan Eksekutif

Pada Fase 2 ini, infrastruktur WebRTC kelas enterprise telah berhasil disiapkan dan dijalankan:
1. **LiveKit SFU Server (v1.8+)**: Bertugas sebagai router media WebRTC berperforma tinggi dengan Selective Forwarding dan penanganan koneksi real-time.
2. **Coturn STUN/TURN Server**: Bertugas menjamin keberhasilan koneksi audio/video pemain yang berada di balik firewall perusahaan atau NAT simetris.
3. **Token Generator Service (`tools/livekit_token.py`)**: Layanan penerbit token akses JWT terenkripsi HS256 yang dibangun **murni dengan pustaka standar Python** (tanpa dependensi `pip`), terintegrasi di endpoint HTTP `POST /api/livekit/token`.
4. **Client SDK Bridge (`src/network/livekit-bridge.js`)**: Modul ES2022 browser natif yang mengimpor `livekit-client` via ESM CDN tanpa bundler untuk mengelola inisialisasi room, event stream remote, dan kontrol track mikrofon/kamera.

---

## 2. Berkas & Konfigurasi yang Dibuat

| Berkas / Direktori | Status | Deskripsi |
|---|---|---|
| **`infra/docker-compose.yml`** | *Baru* | Orkestrasi kontainer `lk-livekit-sfu` dan `lk-coturn-turn` dengan healthcheck, mapping port WebRTC, dan network internal. |
| **`infra/livekit.yaml`** | *Baru* | Konfigurasi LiveKit server: port signaling TCP 7880, WebRTC TCP 7881, UDP range 50000–50200, dan kredensial API key/secret. |
| **`infra/turnserver.conf`** | *Baru* | Konfigurasi Coturn: port listening 3478 (UDP/TCP), port relay 49152–49250 (UDP), realm `lembah-kenanga.local`, dan otentikasi user/password terproteksi. |
| **`tools/livekit_token.py`** | *Baru* | Generator JWT LiveKit standar RFC 7519 (HMAC-SHA256) murni standar library Python (`hmac`, `hashlib`, `base64`, `json`). |
| **`tools/serve.py`** | *Modifikasi* | Pendaftaran route `POST /api/livekit/token` ke dalam pipeline API server. |
| **`src/network/livekit-bridge.js`** | *Baru* | Wrapper client LiveKit ESM untuk Room connection, penanganan track video/audio remote, dan toggle mic/cam/screen share. |

---

## 3. Spesifikasi Arsitektur & Port Jaringan

```
                                  KLIEN (BROWSER)
                                   │           │
                 Signaling / JWT   │           │ WebRTC Media
                 (HTTP & WS)       │           │ (SRTP / UDP)
                                   ▼           ▼
                         ┌───────────────┐   ┌──────────────────────┐
                         │ tools/serve.py│   │  LiveKit SFU Server  │
                         │ (Port 47311)  │   │  (Port 7880, 7881)   │
                         └───────┬───────┘   └──────────┬───────────┘
                                 │                      │
                                 │ JWT Token Auth       │ ICE Traversal
                                 ▼                      ▼
                         ┌───────────────┐   ┌──────────────────────┐
                         │ tools/        │   │  Coturn (STUN/TURN)  │
                         │ livekit_token │   │  (Port 3478, Relay)  │
                         └───────────────┘   └──────────────────────┘
```

### Port Mapping:
- **7880/TCP**: LiveKit HTTP API & WebSocket Signaling.
- **7881/TCP**: LiveKit WebRTC TCP fallback.
- **50000–50200/UDP**: LiveKit WebRTC media streams (audio, video, data channel).
- **3478/TCP & 3478/UDP**: Coturn STUN & TURN listening port.
- **49152–49250/UDP**: Coturn TURN relay port range.
- **47311/TCP**: Game HTTP static server & endpoint token auth (`/api/livekit/token`).

---

## 4. Endpoint Token Generator (`POST /api/livekit/token`)

### Request Payload:
```json
{
  "username": "Budi",
  "room": "valley",
  "avatar": "player_m"
}
```

### Response Payload:
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url": "ws://127.0.0.1:7880",
  "room": "valley",
  "identity": "Budi"
}
```

### Karakteristik Token JWT:
- Algoritma: **HS256** (HMAC-SHA256).
- Durasi: Berlaku selama 6 jam (`exp = now + 21600`).
- Permissions / Grants: `roomJoin: true`, `canPublish: true`, `canSubscribe: true`, `canPublishData: true`.
- Metadata: Membawa id avatar pemain dalam bentuk string JSON.

---

## 5. Hasil Pengujian & Verifikasi Kualitas (QA)

1. **Docker Compose Services**:
   - `lk-livekit-sfu`: **Up & Healthy** (HTTP 200 pada `http://localhost:7880/`).
   - `lk-coturn-turn`: **Up & Healthy** (Port 3478 aktif & listening).
2. **Uji Validasi JWT**:
   - Skrip verifikasi Python membaca kembali token yang dihasilkan, memeriksa validitas header (`{"alg": "HS256", "typ": "JWT"}`) dan klaim grant video (`roomJoin: true`). Hasil lolos 100%.
3. **Uji Endpoint Server**:
   - Simulasi HTTP client memanggil `POST /api/livekit/token` berhasil mengembalikan payload JSON token terverifikasi.
4. **Verifikasi Skrip Rilis & Skala**:
   - `python tools/check_scale.py --strict`: **78 sprite diperiksa, 0 masalah**.
   - `python tools/publish.py`: **156 berkas berhasil dibundle ke dist/ (3 MB)**.

---

## 6. Kesiapan Menuju Fase 3

Infrastruktur WebRTC dan layanan otentikasi token telah aktif dan siap digunakan untuk:
- **Fase 3: Engine Proksimitas Spasial (Spatial Audio & Selective Video Subscription)**:
  - Memanfaatkan `livekit-bridge.js` untuk menghubungkan audio/video remote player.
  - Mengatur volume suara secara dinamis berdasarkan jarak Euclidean avatar di canvas 2D.
  - Mematikan langganan track video (`setSubscribed(false)`) untuk avatar yang berada di luar radius 7 tile.
