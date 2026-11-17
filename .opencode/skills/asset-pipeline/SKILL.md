---
name: asset-pipeline
description: Process, normalize, slice, and register pixel art sprites in Lembah Kenanga using tools/ scripts, assets/manifest.json, and assets/scale.json. Use when adding, slicing, or updating sprites, checking sprite scale, chroma keying, or modifying the sprite manifest.
---

# Asset Pipeline — Lembah Kenanga

Panduan alur kerja untuk memproses, menormalkan, dan mendaftarkan aset visual pixel art ke dalam game Lembah Kenanga sesuai kontrak arsitektur di `docs/DESIGN.md` dan `docs/ASSETS.md`.

---

## 1. Prinsip Utama Aset

1. **Gaya Visual Terkunci (Style Lock)**:
   - Oblique top-down view (tanah datar dari atas, bangunan & pohon memperlihatkan tampak depan + atap yang direbahkan ke belakang).
   - Pixel art 16-bit tajam (crisp hard pixel clusters), tanpa anti-aliasing, tanpa gradien halus.
   - Outline 1px warna gelap hangat (`#3a2a2a`, bukan hitam murni `#000000`).
   - Cel-shading 3 band (shadow, mid, highlight). Pencahayaan dari kiri-atas, bayangan kontak elips di kaki objek.
   - Palet warna maksimal 48 warna per sprite.
2. **Latar Chroma Green**:
   - Selalu di-generate dengan warna latar hijau murni `#00FF00` solid (bukan transparan langsung dari generator) agar proses pemotongan dan despill dapat diulang dan dikontrol secara presisi di komputer lokal.
3. **Ukuran Kanonik adalah Kontrak**:
   - Sumber kebenaran ukuran kanonik ada di `assets/scale.json`.
   - Ukuran frame tidak boleh diambil langsung dari bounding box mentah hasil AI generator.
   - Acuan dasar: Karakter manusia dewasa adalah **32×48 px** (1 × 1.5 tile).

---

## 2. Alur Penambahan & Pemrosesan Sprite

### Langkah 1: Siapkan Gambar Mentah
Simpan hasil generate di direktori kerja atau `assets/_raw/` (jangan masukkan `_raw` ke berkas rilis/dist).

### Langkah 2: Chroma Key & Hapus Latar Hijau
Gunakan `tools/chroma_key.py`:
```bash
uv run --with pillow python tools/chroma_key.py input_green.png --out output_clean.png
```
Opsi penting:
- `--hard`: Membuang bayangan semi-transparan (cocok untuk sprite solid).
- `--unspill`: Membersihkan pantulan hijau yang tembus pada tepi atau objek bening.
- `--threshold`: Toleransi jarak warna hijau (default wajar).

### Langkah 3: Potong Sheet / Grid
Untuk lembaran sprite karakter (sheet 4 baris × 4 kolom) atau objek multi-frame:
```bash
uv run --with pillow python tools/slice_grid.py output_clean.png --rows 4 --cols 4 --frame-w 32 --frame-h 48 --out assets/sprites/characters/npc_name/
```

Untuk hewan (strip 4 atau 8 frame hadap kiri):
- Gunakan `tools/build_animal_strip.py` bila celah antar frame tidak berjarak reguler.
- Ingat bahwa hewan hanya dibuat hadap **kiri**; hadap kanan dibalik (mirror) otomatis oleh kode renderer.

Untuk terrain seamless 32×32:
```bash
uv run --with pillow python tools/tile_check.py raw_texture.png --out assets/sprites/terrain/grass_new.png --size 32 --repeat 3 --zoom 4
```

Untuk menurunkan varian musim (spring → summer/autumn/winter):
- Gunakan `tools/tint_tile.py` agar keempat musim tetap sekeluarga dan memiliki tekstur dasar yang seragam.

### Langkah 4: Daftarkan ke `assets/scale.json`
Setiap objek dunia dan makhluk wajib memiliki entri ukuran kanonis di `assets/scale.json`:
```json
"npc_nama": {
  "px": [32, 48],
  "tiles": [1.0, 1.5],
  "anchor": "bottom-center",
  "category": "characters",
  "faces": "south"
}
```

### Langkah 5: Daftarkan ke `assets/manifest.json`
Tambahkan deklarasi sprite ke dalam berkas `assets/manifest.json` di bawah objek `"sprites"`:
```json
"npc_nama": {
  "file": "sprites/characters/npc_nama/npc_nama_sheet.png",
  "frame": [32, 48],
  "cols": 4,
  "rows": 4,
  "pivot": [16, 48]
}
```
Aturan pivot:
- Karakter & makhluk: `bottom-center` (`[w/2, h]`).
- Bangunan: `bottom-left tile` atau sesuai titik tumpu kaki bangunan.
- Ikon item & efek partikel: `center` (`[w/2, h/2]`).

---

## 3. Verifikasi Skala & Aset

Setiap kali mengubah, menambah, atau memotong ulang sprite, wajib jalankan pemeriksaan skala:
```bash
uv run --with pillow python tools/check_scale.py --strict
```
Kriteria kelulusan:
- **0 masalah**.
- Ukuran file PNG fisik harus sama persis dengan `frame_w * cols` × `frame_h * rows`.
- Seluruh sprite di `manifest.json` (kecuali UI & portrait) terdaftar di `scale.json`.
- Tidak ada berkas sprite yang hilang atau salah jalur.
