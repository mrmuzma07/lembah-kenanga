---
name: server-api-ops
description: Maintain, test, and deploy the zero-dependency Python backend (chat, accounts, rate limiting, moderation) and build dist/ packages using tools/serve.py, tools/publish.py, tools/chat.py, and tools/guard.py. Use when modifying backend APIs, moderation rules, database schemas, or building the production distribution.
---

# Server & API Ops — Lembah Kenanga

Panduan untuk merawat, menguji, dan merilis server backend dan API Lembah Kenanga sesuai arsitektur di `docs/DESIGN.md` dan skrip di `tools/`.

---

## 1. Filosofi Backend: Tanpa Dependensi Luar (Zero External Dependencies)

Server Lembah Kenanga (`tools/serve.py`) dibangun murni menggunakan **pustaka bawaan Python 3.9+** (`http.server`, `socketserver`, `sqlite3`, `threading`, `hashlib`, `json`).
- Tidak boleh menambahkan dependensi pihak ketiga (tanpa `pip install`, tanpa Flask/FastAPI/uvicorn).
- Dapat dijalankan langsung di mesin dev maupun VPS tanpa instalasi lingkungan virtual.

---

## 2. Arsitektur Komunikasi: HTTP Long-Poll

Obrolan publik (`tools/chat.py`) menggunakan mekanisme **HTTP Long-Poll**, bukan WebSocket:
- Satu permintaan `GET /api/chat` ditahan hingga **20 detik** (`POLL_TIMEOUT = 20`) jika belum ada pesan baru.
- Saat ada pesan masuk (`POST /api/chat`), thread pengirim membangunkan thread-thread yang sedang menunggu lewat `threading.Condition()`.
- Klien langsung menerima pesan seketika tanpa perlu membanjiri server dengan polling cepat.
- Tembus di balik semua konfigurasi reverse proxy (Cloudflare, Nginx) tanpa perlu penanganan koneksi WebSocket khusus.

---

## 3. Keamanan, Pembatasan Laju & Moderasi

### Penjaga (`tools/guard.py`):
1. **Batas Ukuran Badan (`MAX_BODY = 512 KB`)**:
   - Ditolak **sebelum** dibaca melalui pemeriksaan header `Content-Length`. Ini mencegah serangan memori berlebih.
2. **Pembatasan Laju Per-IP (Sliding Window)**:
   - Dihitung per alamat IP klien (membaca header `X-Forwarded-For` jika di belakang reverse proxy).
   - Aturan bawaan:
     - `chat_poll`: maks 150 req/menit, 3000 req/jam.
     - `chat_post`: maks 25 pesan/menit, 400 pesan/jam.
     - `player_save`: maks 20 simpan/menit, 200 simpan/jam.
     - `player_create`: maks 8 akun/jam, 25 akun/hari.
3. **Penyaring JSON**:
   - Menolak keras payload yang bukan objek kamus (`dict`).

### Penyaring Kata Kasar (`tools/moderation.py`):
- Pesan yang mengandung kata kasar **disensor dengan tanda bintang**, bukan ditolak (menghindari percobaan berulang dengan ejaan baru).
- Normalisasi penyamaran huruf: Angka (`0→o`, `1→i`, `3→e`, `4→a`, `5→s`, `7→t`) dan tanda baca di tengah kata dinormalkan kembali ke huruf sebelum dicocokkan.
- Memakai regex dengan batas kata (word boundaries) untuk mencegah Scunthorpe problem.

---

## 4. Basis Data (SQLite WAL)

- Berkas database berada di `var/chat.db` (dapat diarahkan via variabel lingkungan `LK_CHAT_DB`).
- Menggunakan mode jurnal **WAL (Write-Ahead Logging)** dengan isolasi thread lokal (`threading.local`).
- Tabel utama:
  - `messages`: Riwayat chat publik (dipangkas berkala agar tidak melebihi 2000 entri).
  - `presence`: Status kehadiran pemain aktif (dihapus jika tidak terlihat dalam 30 detik).
  - `players`: Akun pemain (username case-insensitive, profil, dan simpanan game serialized JSON).

---

## 5. Prosedur Rilis & Deployment (`publish.py`)

Jangan pernah menyajikan folder root proyek apa adanya di server produksi (karena berisi `.git`, `assets/_raw`, berkas Python, dan database `var/chat.db`).

### Langkah Membuat Bundle Produksi:
Jalankan skrip penerbitan:
```bash
python3 tools/publish.py
# Atau sekalian buatkan file zip:
python3 tools/publish.py --zip
```

Skrip ini menyalin hanya berkas yang diizinkan peramban ke folder `dist/` ($\sim 3$ MB):
- Berkas HTML (`index.html`, `game.html`).
- Kode aplikasi (`src/`).
- Sprite yang hanya terdaftar di `assets/manifest.json`.
- Aset visual homepage (`assets/homepage`).

### Menjalankan Server Produksi:
```bash
python3 tools/serve.py 47311 --root dist --cache 3600 --host 127.0.0.1
```

### Konfigurasi Reverse Proxy (Nginx):
- Teruskan `/api/` ke port server Python (misal `47311`).
- Matikan buffering respon (`proxy_buffering off;`).
- Setel batas waktu baca lebih dari 20 detik (`proxy_read_timeout 60s;`).
- Teruskan alamat IP asli: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
