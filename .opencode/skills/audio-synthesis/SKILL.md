---
name: audio-synthesis
description: Synthesize and tune procedural Web Audio music, ambient soundscapes, and sound effects in Lembah Kenanga using src/systems/audio.js without external audio files. Use when adding or adjusting sound effects, modifying background melodies, or tuning audio mix.
---

# Audio Synthesis — Lembah Kenanga

Panduan untuk merawat, menambah, dan menyesuaikan sistem audio prosedural di Lembah Kenanga sesuai implementasi di `src/systems/audio.js` dan panduan `docs/AUDIO.md`.

---

## 1. Prinsip Utama: Nol Berkas Audio (Zero Audio Assets)

Game ini tidak mengunduh berkas audio eksternal (`.mp3`, `.wav`, `.ogg` sama sekali dilarang di `dist/`):
- Seluruh musik latar dan efek suara **disintesis secara real-time** menggunakan browser **Web Audio API**.
- Beban unduhan audio adalah 0 KB.
- Musik latar tidak pernah berulang persis sama karena dihasilkan melalui random-walk nada di dalam tangga nada pentatonik.

---

## 2. Struktur Musik Prosedural (Music Box Melody)

### Skala Pentatonik:
Melodi menggunakan nada-nada pentatonik:
```javascript
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5]; // C5, D5, E5, G5, A5, C6, E6
const BASSLINE = [130.81, 98.0, 110.0, 87.31];                          // C3, G2, A2, F2
```

### Mengapa Pentatonik:
Setiap nada dalam tangga nada pentatonik terdengar harmonis jika disandingkan dengan nada lainnya. Langkah random-walk acak antar nada tidak akan pernah menghasilkan interval disonan (fals), memungkinkan musik tenang yang digenerate secara on-the-fly tanpa partitur kaku.

### Sintesis Kotak Musik (Music Box Timbre):
- Menggunakan osilator tipe `sine` atau `triangle` dengan decay instan dan rilis lembut (envelope eksponensial).
- Bassline menggunakan osilator `triangle` frekuensi rendah yang berganti setiap bar birama.

---

## 3. Ambience Siang & Malam

- **Siang Hari (`day`)**: Angin sepoi-sepoi dan gemersik dedaunan menggunakan buffer white noise yang dilewatkan bandpass filter dinamis frekuensi rendah.
- **Malam Hari (`night`)**: Suara jangkrik menggunakan osilator pulsa/modulasi frekuensi tinggi (4.5 kHz – 5.5 kHz) berirama ritmis pelan.
- Transisi antara siang dan malam dilakukan secara cross-fade halus melalui pengaturan `gainNode` masing-masing bus.

---

## 4. Efek Suara (SFX)

Semua efek suara dibentuk dari kombinasi osilator (`sine`, `square`, `sawtooth`, `triangle`) dan kurva amplop volume (`exponentialRampToValueAtTime`):

| SFX | Metode Sintesis |
|---|---|
| **Cangkul (`hoe`)** | Sapuan nada turun cepat (120 Hz → 40 Hz) + ledakan noise pendek terfilter |
| **Siram (`water`)** | White noise terfilter lowpass dengan amplop lembut menyerupai semburan air |
| **Sabit (`sickle`)** | Desiran nada tinggi singkat (swish) bandpass noise |
| **Pukul Pohon (`chop`)** | Dentuman kayu resonant filter (200 Hz → 80 Hz) |
| **Pukul Batu (`mine`)** | Nada tinggi metalik/mineral (square wave pendek + pitch drop tajam) |
| **Langkah Kaki (`step`)** | Ketukan sangat pendek (thud) berdurasi 30 ms tiap ~24 px langkah jalan |
| **Ikan Menyambar (`bite`)** | Dua nada ceria cepat melompat naik |
| **Buka/Tutup Menu** | Denting halus ramah bergaya UI kayu |

---

## 5. Bekerja dengan Web Audio Browser

- **Audio Unlock Policy**: Peramban modern memblokir `AudioContext` sebelum ada interaksi pengguna (user gesture). Pemanggilan `audio.unlock()` wajib dipicu saat klik pertama atau penekanan tombol awal.
- **Pengaturan & Mute**: Nilai volume disimpan di `localStorage` dengan kunci `'lk_audio'`:
  - `musicVolume` (default `0.15`)
  - `sfxVolume` (default `0.60`)
  - `muted` (boolean)
