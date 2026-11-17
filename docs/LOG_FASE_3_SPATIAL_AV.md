# Log Hasil Implementasi Fase 3: Proximity-Based Spatial Audio/Video Engine

Dokumen ini mencatat rincian hasil implementasi **Fase 3** dari roadmap transformasi Lembah Kenanga menjadi platform kantor virtual 2D (Gather.town / WorkAdventure).

---

## 1. Ringkasan Eksekutif

Pada Fase 3 ini, telah dibangun **Spatial Audio & Video Proximity Engine** (`src/systems/spatial-av.js`) yang mengintegrasikan matematika jarak spasial 2D, Web Audio API, dan LiveKit SFU Selective Track Subscriptions.

Pengguna kini mengalami interaksi media proksimitas alami layaknya di dunia nyata:
- **Audio Atenuasi Spasial**: Saat dua avatar saling mendekat, suara rekan kerja terdengar semakin jelas. Saat menjauh, suara meredup hingga hening total.
- **Stereo Panning**: Rekan kerja yang berdiri di sebelah kiri avatar terdengar di telinga kiri; rekan di sebelah kanan terdengar di telinga kanan.
- **Dynamic Selective Subscription (LiveKit SFU)**: Aliran video dan audio hanya diunduh (subscribe) jika avatar rekan kerja berada dalam radius pendengaran ($\le 7\text{ tile}$). Di luar jarak tersebut, streaming video diputus otomatis untuk menghemat bandwidth dan beban CPU klien.

---

## 2. Parameter Spasial & Rumus Matematika

### A. Parameter Ambang Jarak
- **Ukuran Tile**: $32\text{ px}$.
- **$R_{MIN}$ (Kontak Penuh / Full Volume)**: $3 \times 32 = 96\text{ px}$ ($\sim 3\text{ tile}$).
- **$R_{MAX}$ (Batas Komunikasi / Cutoff Radius)**: $7 \times 32 = 224\text{ px}$ ($\sim 7\text{ tile}$).

### B. Perhitungan Jarak Euclidean Real-Time
Jarak antara pemain lokal $(x_1, y_1)$ dan avatar daring $(x_2, y_2)$ dihitung per-frame pada game loop:
$$d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$

### C. Kurva Atenuasi Volume
Volume audio dihitung dengan fungsi linier terpangkas (*clamped linear attenuation*):
$$Volume(d) = \begin{cases} 
1.0 & \text{jika } d \le R_{MIN} \\ 
\max\left(0, 1.0 - \frac{d - R_{MIN}}{R_{MAX} - R_{MIN}}\right) & \text{jika } R_{MIN} < d \le R_{MAX} \\ 
0.0 & \text{jika } d > R_{MAX} 
\end{cases}$$

### D. Stereo Panning Horizontal
Arah suara stereo dihitung dari selisih posisi horizontal $\Delta x = x_2 - x_1$:
$$Pan(\Delta x) = \operatorname{clamp}\left(\frac{\Delta x}{R_{MAX}}, -1.0, 1.0\right)$$
- Nilai $-1.0$: Suara $100\%$ di telinga kiri (avatar teman berada di batas kiri).
- Nilai $0.0$: Suara di tengah (*centered*).
- Nilai $+1.0$: Suara $100\%$ di telinga kanan (avatar teman berada di batas kanan).

---

## 3. Pipeline Web Audio API Graph

Setiap peserta LiveKit yang mempublikasikan audio dihubungkan ke grafik node Web Audio independen:

```
┌─────────────────────────────────┐
│ LiveKit RemoteAudioTrack Stream │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   MediaStreamAudioSourceNode    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│        StereoPannerNode         │  ◄── Diberi nilai Pan (-1 s/d +1)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│            GainNode             │  ◄── Diberi nilai Volume (0.0 s/d 1.0)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     AudioContext.destination    │  (Output speaker / headphone pemain)
└─────────────────────────────────┘
```

Perubahan volume dan pan diperbarui secara mulus menggunakan `linearRampToValueAtTime` (jendela transisi 50 ms) untuk mencegah bunyi *clicking* atau lonjakan audio (*pop noise*).

---

## 4. Mekanisme Selective Track Subscription (LiveKit SFU)

Untuk mencegah lonjakan konsumsi bandwidth saat puluhan orang berada dalam satu kantor virtual, `SpatialAVSystem` mengevaluasi status langganan track setiap $200\text{ ms}$:

1. **Jarak $d \le R_{MIN}$ (Dekat, $\le 3\text{ tile}$)**:
   - `publication.setSubscribed(true)`
   - `publication.setVideoQuality(VideoQuality.HIGH)` (Kualitas video maksimal).
2. **Jarak $R_{MIN} < d \le R_{MAX}$ (Sedang, $3 - 7\text{ tile}$)**:
   - `publication.setSubscribed(true)`
   - `publication.setVideoQuality(VideoQuality.MEDIUM_OR_LOW)` (Kualitas video adaptif).
3. **Jarak $d > R_{MAX}$ (Jauh, $> 7\text{ tile}$)**:
   - `publication.setSubscribed(false)` (Aliran video dan audio diputus oleh server SFU).

---

## 5. Berkas yang Dibuat & Dimodifikasi

| Berkas | Status | Peran & Deskripsi |
|---|---|---|
| **`src/systems/spatial-av.js`** | *Baru* | Kelas `SpatialAVSystem` berisi algoritma proksimitas, pembuatan grafik Web Audio per peserta, kontrol gain & panner, serta manajemen langganan track LiveKit. |
| **`src/network/livekit-bridge.js`** | *Modifikasi* | Integrasi callback track subscribed/unsubscribed audio untuk langsung disambungkan ke `SpatialAVSystem`. |
| **`src/main.js`** | *Modifikasi* | Inisialisasi `state.spatialAV`, pemanggilan `state.spatialAV.update(player, remotePlayers, dt)` pada loop utama, dan cleanup pada event `pagehide`. |

---

## 6. Hasil Pengujian & Verifikasi Kualitas (QA)

1. **Unit Test Logika Jarak & Atenuasi Spasial**:
   - Uji jarak dekat ($d = 50\text{ px} \le R_{MIN}$): Track tersubscribe dengan `videoQuality = HIGH (2)`.
   - Uji jarak menengah ($d = 160\text{ px}$): Track tersubscribe dengan `videoQuality = MEDIUM/LOW (1)` dan volume teratenuasi secara linier.
   - Uji jarak jauh ($d = 300\text{ px} > R_{MAX}$): Track di-unsubscribed otomatis (`isSubscribed = false`) dan audio hening ($0.0$).
   - *Status: Lolos 100%*.
2. **Uji Validasi Sintaks JavaScript**:
   - `node --check src/systems/spatial-av.js && node --check src/network/livekit-bridge.js && node --check src/main.js` $\to$ **Valid, 0 error**.
3. **Uji Skala Sprite & Bundle Produksi**:
   - `uv run --with pillow python tools/check_scale.py --strict` $\to$ **78 sprite kanonis, 0 masalah**.
   - `python3 tools/publish.py` $\to$ **157 berkas, 3 MB, build bersih**.

---

## 7. Kesiapan Menuju Fase 4

Engine spasial audio/video telah siap dan akan diperluas pada:
- **Fase 4: Private Meeting Spaces & Room Isolation**:
  - Menambahkan isolasi zona (`private`, `open`, `quiet`).
  - Pemain di dalam ruang rapat tertutup saling mendengar $100\%$ tanpa penurunan jarak, dan terisolasi dari avatar di luar ruangan.
