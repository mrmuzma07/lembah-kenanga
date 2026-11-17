---
name: gameplay-content
description: Add and balance gameplay content in Lembah Kenanga including NPCs, crops, fish species, items, shops, and notice board requests across src/data/*.json and src/systems/*. Use when adding or updating NPCs, crops, fish, items, dialogues, or shop stocks.
---

# Gameplay Content — Lembah Kenanga

Panduan untuk menambah, mengonfigurasi, dan menyeimbangkan konten gameplay di Lembah Kenanga meliputi Warga (NPC), Tanaman (Crops), Ikan (Fish), Barang (Items), Toko (Shops), dan Permintaan Balai Desa (Requests).

---

## 1. Menambah atau Mengubah Warga (NPC)

Konfigurasi warga berada di `src/data/npcs.json` dan diinisialisasi oleh `src/entities/npc.js` serta `src/systems/social.js`.

### Struktur Entri NPC:
```json
{
  "id": "nama_npc",
  "name": "Nama Lengkap NPC",
  "sprite": "npc_nama",
  "portrait": "portrait_npc_nama",
  "role": "Peran atau pekerjaan di desa",
  "likes": ["Kopi", "Stroberi"],
  "dialogs": {
    "default": [
      "Dialog perkenalan awal.",
      "Dialog harian umum baris 1.|Lanjutan dialog baris 2."
    ],
    "spring": ["Dialog khusus musim semi."],
    "winter": ["Dialog khusus musim dingin."],
    "friend": [
      "Dialog khusus jika hati persahabatan >= 4."
    ]
  },
  "schedule": [
    { "h": 6, "at": "rumah" },
    { "h": 10, "at": "plaza" },
    { "h": 17, "at": "warung" }
  ],
  "wants": ["turnip", "wood"]
}
```

### Aturan & Perilaku:
- **Tingkat Hati**: Diatur di `src/systems/social.js`. 1 hati = 100 poin. Maksimal 10 hati (1000 poin).
  - Menyapa sekali sehari: `+8 poin`.
  - Hadiah: Suka (`+80`), Gemar (`+45`), Netral (`+20`), Benci (`-20`).
  - Maksimal 1 hadiah per orang per hari (`GIFTS_PER_DAY = 1`).
- **Jadwal Harian**: Per jam (`h: 6`, `h: 10`, dst). Saat pemain tidak melihat, NPC bergeser langsung (`snap`) ke lokasi tujuan agar tidak tersangkut geometri.
- **Entitas Non-Warga / Beast**: Jika diberi properti `"beast": true`, entitas dilewati oleh sistem hati, dialog persahabatan, dan jadwal harian (contoh: Maung harimau penunggu hutan).

---

## 2. Menambah Tanaman (Crops)

Data tanaman didefinisikan di `src/data/crops.json` dan diproses oleh `src/systems/farming.js`.

### Struktur Entri Tanaman:
```json
"nama_tanaman": {
  "sprite": "crop_nama_tanaman",
  "seasons": ["spring", "summer"],
  "yields": "id_item_panen",
  "stageDays": [1, 1, 2, 2],
  "regrowDays": 3
}
```

### Aturan:
- `stageDays`: Array berisi durasi hari untuk masing-masing fase pertumbuhan (total 4 transisi menuju fase 5: siap panen).
- `regrowDays` *(opsional)*: Jika ada, tanaman tidak mati setelah dipanen, melainkan mundur sekian hari untuk panen berulang (contoh: cabai, tomat).
- Pastikan ada item benih (`seed_<nama>`) dan item hasil panen yang terdaftar di `src/data/items.json`.
- Daftarkan benih ke toko Bu Sari di `src/data/shops.json`.

---

## 3. Menambah Ikan (Fish) & Sistem Memancing

Data ikan tersimpan di `src/data/fish.json` dan diatur di `src/systems/fishing.js`.

### Struktur Entri Ikan:
```json
{
  "id": "nama_ikan",
  "item": "fish_nama_ikan",
  "water": "pond",
  "seasons": ["spring", "summer"],
  "hours": [18, 26],
  "difficulty": 3,
  "weight": 5
}
```

### Parameter:
- `water`: `"pond"` (air tawar di kolam hutan), `"sea"` (air asin di laut/pantai), atau `"any"` (misal sampah sepatu).
- `difficulty`: Skala 1–5. Mengatur kegelisahan gerakan ikan dan lebar gauge hijau pada mini-game tarik-ulur.
- `weight`: Bobot peluang undian kemunculan saat pancing disambar.
- `hours`: Rentang jam aktif (opsional; format `[start, end]`, jam 24+ berarti lewat tengah malam).

---

## 4. Item & Toko (Items & Shops)

### Item (`src/data/items.json`)
Setiap barang di inventori memiliki entri:
```json
"id_item": {
  "name": "Nama Tampilan",
  "icon": 12,
  "price": 50,
  "desc": "Keterangan item.",
  "edible": { "energy": 25 },
  "category": "produce"
}
```
- `icon`: Indeks sprite icon di `items_sheet.png`.
- `price`: Nilai jual di kotak pengiriman (shipping bin) atau toko.
- `edible`: Properti pemulih energi jika barang bisa dimakan (`E`/Spasi).

### Toko (`src/data/shops.json`)
Toko mendefinisikan jam buka, pesan saat tutup, izin menjual barang pemain, dan stok barang per musim:
- `shop` (Toko Kelontong Bu Sari): Buka 09:00–17:00, menjual benih dan pancing.
- `blacksmith` (Pandai Besi Bang Jaka): Upgrade level alat (tembaga, besi, emas).
- `warung` (Warung Kopi Kang Dadang): Menjual makanan pemulih tenaga.
- `clinic` (Klinik Dokter Ratna): Menjual pemulihan kesehatan dan obat.

---

## 5. Permintaan Harian Balai Desa (Requests)

Dikelola oleh `src/systems/requests.js`:
- Tiap hari muncul satu permintaan dari warga di papan pengumuman Balai Desa.
- Permintaan diundi secara deterministik dari nomor hari (`GameTime.dayNumber`), sehingga memuat ulang save tidak akan mengganti jenis permintaan hari itu.
- Menyelesaikan permintaan memberi imbalan uang (G) dan poin persahabatan ekstra ke warga bersangkutan.
