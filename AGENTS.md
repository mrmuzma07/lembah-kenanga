# AGENTS.md — Panduan & Petunjuk Kerja Agen AI (Lembah Kenanga)

Dokumen ini adalah instruksi otoritatif bagi agen AI (opencode, Claude Code, dan sistem otomasi lainnya) yang bekerja di repositori **Lembah Kenanga**. Seluruh aturan, filosofi arsitektur, dan batasan teknis di sini adalah **kontrak** yang wajib ditaati secara ketat.

---

## 1. Ikhtisar & Filosofi Repositori

**Lembah Kenanga** adalah game simulasi kehidupan pedesaan Indonesia bergaya *pixel art* (terinspirasi Harvest Moon dan Stardew Valley). Fitur utama mencakup bertani, memancing, beternak, interaksi warga (delapan NPC), titipan harian balai desa, ekonomi toko, siklus waktu & musim, obrolan publik multi-pemain, serta akun pemain berbasis browser.

### Prinsip Utama (Non-Negotiable):
1. **Nol Dependensi & Tanpa Bundler**:
   - Tidak ada `package.json`, tidak ada `npm install`, tidak ada Webpack/Vite/Rollup.
   - Kode frontend berjalan murni sebagai **ES Modules natif** di peramban (`<script type="module" src="src/main.js"></script>`).
   - Perubahan kode langsung terlihat saat me-refresh peramban.
2. **Backend Murni Pustaka Standar**:
   - Server (`tools/serve.py`) hanya menggunakan pustaka bawaan **Python 3.9+** (`http.server`, `socketserver`, `sqlite3`, `threading`, dsb.).
   - Dilarang menambahkan dependensi pihak ketiga seperti Flask, FastAPI, requests, atau modul `pip` apa pun.
3. **Nol Berkas Audio di Disk**:
   - Seluruh musik latar dan efek suara disintesis langsung lewat browser **Web Audio API**. Tidak ada berkas `.mp3` atau `.wav` yang diunduh.
4. **Peta Tunggal & Save Berbasis Selisih (Delta-Only)**:
   - Satu peta luar berukuran 48×48 tile (`valley`).
   - Dunia dibangun ulang secara deterministik dari seed PRNG (`mulberry32`).
   - Berkas save hanya menyimpan perubahan yang dilakukan pemain (tanah yang dicangkul, pohon/batu yang ditebang, status inventori), bukan seluruh peta.

---

## 2. Struktur Proyek

```
lembah-kenanga/
├── index.html            # Halaman beranda: cara main, karakter, tentang
├── game.html             # Kanvas utama tempat game dimainkan
├── opencode.json         # Konfigurasi agen & editor opencode
├── AGENTS.md             # Dokumen panduan kerja agen AI (berkas ini)
├── src/                  # Kode sumber frontend (ES Modules)
│   ├── main.js           # Pengikat utama: loop, interaksi, inisialisasi state
│   ├── core/             # Waktu (GameTime), input, save/migrasi, akun, PRNG, event bus
│   ├── render/           # Canvas 2D renderer, kamera, pemuat aset, tilemap
│   ├── entities/         # Character, NPC, Animal (sapi, ayam, anjing)
│   ├── world/            # valley.js (pembangun peta), map.js, layout.js (anggaran & audit)
│   ├── systems/          # farming, fishing, social, requests, weather, juice, audio, chat
│   ├── ui/               # hud, dialog, inventory-ui, shop-ui, fishing-ui, chat-ui, menu
│   └── data/             # crops.json, fish.json, items.json, npcs.json, shops.json
├── assets/               # Aset visual game
│   ├── manifest.json     # Registry sprite: berkas, frame, cols, rows, pivot
│   ├── scale.json        # Tabel ukuran kanonis (sumber kebenaran skala)
│   ├── sprites/          # File PNG sprite sheets dan potongan per-frame
│   └── homepage/         # Gambar untuk halaman depan
├── tools/                # Pipeline aset (Python) & server dev/chat
│   ├── serve.py          # Server HTTP statis + endpoint obrolan & akun
│   ├── publish.py        # Penyusun bundle bersih folder dist/
│   ├── check_scale.py    # Verifikator ukuran sprite vs scale.json
│   ├── chroma_key.py     # Pembersih latar hijau chroma #00FF00
│   ├── slice_grid.py     # Pemotong sheet menjadi frame
│   ├── guard.py          # Rate limiter per-IP & proteksi ukuran payload
│   └── moderation.py     # Penyaring kata kasar (Indonesia & Inggris)
└── docs/                 # Dokumentasi desain
    ├── DESIGN.md         # Kontrak teknis & visual lengkap
    ├── ASSETS.md         # Catatan prompt card & batch generator
    └── AUDIO.md          # Panduan sintesis audio
```

---

## 3. Kontrak Arsitektur Penting

### A. Rendering & Kedalaman (Canvas 2D)
- **Ukuran Tile**: 32×32 piksel logis.
- **Viewport Logis**: Dinamis mengikuti jendela dengan zoom integer otomatis (`floor(min(W/640, H/360))`, maks ×4). UI di-anchor ke tepi memakai `view.w/h` (jangan di-hardcode).
- **Depth Sorting**: Penggambaran entitas diurutkan berdasarkan `y` kaki (bottom-center pivot). Bagian atas sprite akan menutupi entitas yang berjalan di belakangnya secara alami.
- **Animasi Bergerak**: Animasi jalan menyesuaikan rasio kecepatan (`animT += dt * (speed / baseSpeed)`). Lari (Shift) berkecepatan 168 px/dtk, jalan biasa 96 px/dtk.

### B. Anggaran Tata Letak Dunia (`src/world/layout.js`)
Setiap perubahan pada peta harus lolos dari audit `auditArea(map)`:
- `maxSpan`: $\le 48$ tile per sisi.
- `maxWalkBetweenHubs`: $\le 34$ tile antar hub tetangga terdekat.
- `maxLandmarkGap`: $\le 14$ tile antar landmark bertetangga.
- `maxEmptyRun`: $\le 8\times 8$ tile untuk petak kosong terbuka terbesar.
- `density`: Kepadatan solid + jalan berada dalam rentang **22% – 55%**.
- **Jalan**: Lebar tepat 1 tile; objek di atas petak jalan adalah 0 (kecuali rumput liar & gerbang).
- **Pintu Bangunan**: Wajib bersentuhan langsung dengan petak jalan; seluruh bangunan menghadap ke **Selatan** (`south`).
- **Urutan Build Peta**: Jalan $\to$ Pagar $\to$ Plaza $\to$ Bangunan $\to$ Perabot $\to$ Scatter Alam $\to$ `auditArea()`.

### C. Kontrak Skala & Manifest Aset (`assets/scale.json`)
- Acuan kanonis karakter dewasa: **32×48 px**.
- Setiap sprite baru **wajib** dicatat di `assets/scale.json` dan `assets/manifest.json`.
- Jalankan verifikasi: `uv run --with pillow python tools/check_scale.py --strict` (harus menghasilkan 0 masalah).

### D. Server Obrolan & Akun (`tools/`)
- Obrolan menggunakan **HTTP Long-Poll** (ditahan sampai 20 detik, dibangunkan seketika oleh `threading.Condition`).
- Basis data menggunakan **SQLite WAL** (`var/chat.db`), satu sambungan per thread (`threading.local`).
- Batas ukuran payload: `MAX_BODY = 512 KB` (ditolak sebelum dibaca).
- Sensor kata kasar: disensor menjadi bintang, bukan ditolak; normalisasi angka/simbol penyamaran sebelum pencocokan kata.

---

## 4. Skills Khusus Proyek

Proyek ini dilengkapi dengan skill spesifik di `.opencode/skills/`:

| Skill | Lokasi | Kegunaan |
|---|---|---|
| **`asset-pipeline`** | `.opencode/skills/asset-pipeline/SKILL.md` | Menormalkan, memotong, menghapus chroma hijau, mendaftarkan sprite, dan memeriksa skala kanonis. |
| **`world-layout-builder`** | `.opencode/skills/world-layout-builder/SKILL.md` | Merancang tata letak peta `valley.js`, mengatur jalan, pagar, bangunan, pencahayaan, serta lolos `auditArea`. |
| **`gameplay-content`** | `.opencode/skills/gameplay-content/SKILL.md` | Menambah NPC, tanaman, ikan, item, toko, dan permintaan harian di `src/data/*.json`. |
| **`audio-synthesis`** | `.opencode/skills/audio-synthesis/SKILL.md` | Mensintesis efek suara dan melodi prosedural Web Audio tanpa berkas audio eksternal. |
| **`server-api-ops`** | `.opencode/skills/server-api-ops/SKILL.md` | Mengelola API obrolan & akun Python bawaan, guard, moderasi, serta menyusun bundle `dist/` via `publish.py`. |

---

## 5. Prosedur Kerja & Verifikasi (Quality Assurance)

Setiap agen yang melakukan perubahan kode wajib menjalankan langkah verifikasi berikut:

### 1. Verifikasi Skala Sprite (Bila Menyentuh Aset/Manifest)
```bash
uv run --with pillow python tools/check_scale.py --strict
```
*Hasil yang diharapkan: `diperiksa X sprite, 0 masalah`.*

### 2. Verifikasi Bundle Distribusi
Pastikan skrip build distribusi dapat berjalan bersih tanpa dependensi yang hilang:
```bash
python3 tools/publish.py
```
*Periksa bahwa seluruh sprite dari manifest berhasil disalin ke `dist/`.*

### 3. Verifikasi Logika JavaScript & Format JSON
- Uji integritas file JSON yang diedit:
```bash
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('src/data/*.json')]"
```
- Uji sintaksis berkas JavaScript jika Node.js tersedia:
```bash
node --check src/main.js
```

### 4. Menjalankan Server Lokal untuk Uji Game
```bash
python3 tools/serve.py 47311
```
Buka browser di `http://localhost:47311` dan periksa console DevTools untuk memastikan tidak ada pesan error modul dan `auditArea` menghasilkan nilai valid.

---

## 6. Konvensi Kode & Gaya Komitmen

- **Gaya Kode**:
  - ES2022 murni, 2 spasi indentasi, titik-koma (`semicolons: true`).
  - Impor berkas JavaScript internal wajib mencantumkan ekstensi `.js` lengkap (mis. `import { TILE } from './map.js';`).
  - Hindari komentar basa-basi. Tulis komentar hanya pada keputusan logika "mengapa" (*why*) suatu hal dilakukan.
- **Konvensi Pesan Git Commit**:
  - Gunakan **Bahasa Indonesia** yang ringkas, deskriptif, dan langsung pada sasaran.
  - Contoh:
    - `Tambah Maung, harimau penunggu hutan utara Balai Desa`
    - `Perbaiki batas jalan di depan klinik Dokter Ratna`
    - `Sesuaikan durasi tumbuh tanaman cabai pada musim panas`
