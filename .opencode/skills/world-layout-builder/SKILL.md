---
name: world-layout-builder
description: Design, modify, and validate map layouts in Lembah Kenanga following layout budgets, district connectivity, and auditArea rules in src/world/layout.js and src/world/valley.js. Use when modifying the valley map, placing buildings, altering roads or fences, or resolving layout audit warnings.
---

# World Layout Builder — Lembah Kenanga

Panduan untuk merancang, memodifikasi, dan mengaudit tata letak dunia (map) di game Lembah Kenanga berdasarkan kontrak teknis `docs/DESIGN.md` §3.1–3.4 dan implementasi di `src/world/layout.js` serta `src/world/valley.js`.

---

## 1. Filosofi & Batasan Peta (Layout Contracts)

Lembah Kenanga menggunakan **satu peta terpadu** (single outdoor map) berukuran **48×48 tile** tanpa layar pemuatan (loading screen). Pemain berjalan dengan kecepatan **3 tile/detik** (96 px/dtk).

Semua batasan angka pada tabel di bawah dihitung dari waktu perjalanan pemain dan divalidasi otomatis oleh fungsi `auditArea(map)`:

| Parameter | Batas | Alasan / Toleransi |
|---|---|---|
| **Sisi Peta (`maxSpan`)** | $\le 48$ tile | Menyeberang peta penuh butuh $\le 16$ detik |
| **Jarak Antar Hub (`maxWalkBetweenHubs`)** | $\le 34$ tile | $\sim 11$ detik jalan kaki ke hub tetangga terdekat |
| **Jarak Antar Landmark (`maxLandmarkGap`)** | $\le 14$ tile | Tidak boleh ada fasilitas yang terisolasi |
| **Petak Kosong Terbesar (`maxEmptyRun`)** | $\le 8\times 8$ tile | Ruang mati harus dipersempit atau diisi dekorasi |
| **Kepadatan Total (`density`)** | $22\% - 55\%$ | Di bawah $22\%$ terasa sepi/hampa, di atas $55\%$ seperti semak belukar |
| **Objek di Atas Jalan** | 0 | Hanya rumput liar (`weed`), gerbang (`gate`), dan jalan yang boleh |
| **Objek per Tile** | Tepat 1 | Tidak boleh menumpuk objek padat di atas objek petik (`pick`) |
| **Lebar Jalan** | Tepat 1 tile | Dua jalur berdampingan terlihat seperti jalan raya ganda |
| **Pintu Bangunan** | Wajib sentuh jalan | Setiap pintu harus berbatasan langsung dengan petak jalan |
| **Orientasi Bangunan (`FACING`)** | Menghadap Selatan (`south`) | Pintu berada di baris bawah footprint; jalan akses harus di baris bawahnya |

---

## 2. Urutan Wajib Pembangunan Peta (Build Order)

Saat mengedit atau membuat peta di `src/world/valley.js`, urutan eksekusi **tidak boleh dibalik**:

1. **Jalan (`carve`)**:
   - Bentuk jalur utama dan cabang-cabangnya, catat di set `map.road` dan beri terrain `'dirt'`.
   - Pastikan ujung jalan menempel pada bangunan yang dilayani atau menembus batas peta (bukan terputus menggantung di tengah rumput).
2. **Area Berpagar (`fenceRing`)**:
   - Pagar dipasang sebagai cincin tertutup 1 tile di luar area.
   - Gunakan potongan horizontal `h` (atas/bawah), vertikal `v` (kiri/kanan), dan 4 potongan sudut yang sesuai.
   - Pintu masuk kebun dibiarkan sebagai celah terbuka tanpa sprite gerbang jika berada di sisi vertikal.
3. **Plaza & Paving (`pave`)**:
   - Petak plaza diberi terrain `'plaza'`, bukan jalan, agar perabot/bangunan dekorasi diizinkan berdiri di atasnya.
4. **Bangunan & Footprint**:
   - Taruh bangunan dengan pivot kaki kiri-bawah (`bottom-left tile`).
   - Tandai solid collision pada petak tapak (`footprint`) di baris-baris bawah bangunan.
   - Catat koordinat pintu (`door: { c, r }`) dan pastikan terhubung ke jalan.
5. **Perabot Plaza & Titik Lampu (`lights`)**:
   - Tempatkan air mancur (`fountain`), papan pengumuman (`notice_board`), dan lampu jalan (`street_lamp`).
   - Daftarkan sumber cahaya malam (`light(c, r, radius, kind)`) untuk pencahayaan malam otomatis.
6. **Dekorasi Alam (`scatter`)**:
   - Tebar alam liar (pohon, pinus, batu, semak, jamur, bunga) menggunakan helper `scatter()`.
   - Urutan pemrosesan scatter mengutamakan jenis yang paling langka dan berjarak renggang (`pine`, `log`, `stump`) sebelum yang umum (`tree`, `weed`).
7. **Jalankan Audit (`auditArea`)**:
   - Selalu panggil `auditArea(map, { landmarks, portals })` di akhir builder.

---

## 3. Sistem Save & Rekonstruksi Deterministik

- Peta selalu dibangun ulang dari seed PRNG yang sama (`makeRng(20260908)`).
- **Berkas save tidak pernah menyimpan seluruh peta.**
- Yang disimpan di save hanya **delta/perubahan**:
  - ID objek yang telah ditebang/dihancurkan/dipungut (`removals`).
  - Status petak tanah yang dicangkul dan tanaman yang tumbuh (`farming.soil`).
- Jangan mengacak urutan pemanggilan `rng()` pada objek permanen karena akan merusak konsistensi posisi objek dunia antar sesi.

---

## 4. Cara Verifikasi

1. Buka browser dan jalankan game via `python3 tools/serve.py 47311`.
2. Buka DevTools Console pada peramban (`F12` / `Cmd+Option+I`).
3. Periksa apakah terdapat log bertanda `[layout:valley]`.
4. Jika audit mendeteksi pelanggaran, pesan peringatan akan mencantumkan daftar masalah (misal: kepadatan di luar batas, pintu tidak menyentuh jalan, atau ruang kosong melebihi 8×8). Sesuaikan koordinat hingga audit menghasilkan `ok: true`.
