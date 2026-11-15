# NetBill — versi demo (Operator & Teknisi)

Aplikasi billing ISP: pelanggan **PPPoE**, pendaftaran pelanggan oleh teknisi, paket internet, tagihan & pembayaran
(manual / **Midtrans**), laporan keuangan, **ODC/ODP & peta jaringan**, dan notifikasi **WhatsApp**.

Versi ini hanya memuat role **Operator** dan **Teknisi**. Perangkat (**MikroTik** & **OLT ZTE**), koneksi **WhatsApp**,
template pesan, dan pengaturan billing dianggap **sudah diatur admin di database** (`src/data/demo-data.json`):

- Operator tetap bisa **mengaktivasi pelanggan seperti biasa**: membuat secret PPPoE di MikroTik, memilih ONU yang belum
  terdaftar dan meregistrasinya di OLT ZTE, isolir/aktifkan, serta memantau **traffic real-time** di dashboard.
- Operator **tidak bisa melihat atau mengubah perangkat**: tidak ada menu Perangkat/OLT/Hotspot, dan API tidak pernah
  mengirim alamat IP, port, maupun kredensial perangkat ke peramban.
- Operator **tetap bisa mengirim WhatsApp** (akun pelanggan, tagihan, pengingat, broadcast, tes) sesuai pengaturan admin,
  tetapi **tidak bisa mengubah pengaturan** (menu Pengaturan tidak ada, tombol hubungkan/logout WhatsApp dihilangkan).
- Job otomatis (buat tagihan, pengingat H-5, isolir, auto delete) berjalan sendiri sekali sehari saat demo dibuka,
  meniru scheduler di server.

Ini adalah **demo statis untuk Vercel**: hanya frontend React (Vite), tanpa backend, database, maupun koneksi perangkat
sungguhan. Semua permintaan `/api/...` dijawab oleh **API tiruan di peramban** (`src/mock/`) dengan data awal dari
[`src/data/demo-data.json`](src/data/demo-data.json). Perubahan selama mencoba disimpan di `localStorage` peramban.

> Semua pelanggan, nomor WhatsApp, perangkat, dan transaksi di data demo adalah **fiktif**.

## Deploy ke Vercel

1. Push folder ini ke repositori GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New… → Project** → pilih repositori tersebut.
3. Biarkan pengaturan bawaan — `vercel.json` sudah mengatur build (`npm run build`), output (`dist`), dan routing SPA.
4. **Deploy**. Tidak perlu environment variable.

## Menjalankan di komputer sendiri

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # hasil ke dist/
```

## Akun demo

Password semua akun: **`demo123`** (di halaman login cukup klik nama akun).

| Username | Role | Yang bisa dicoba |
|---|---|---|
| `operator` | Operator | Dashboard & traffic real-time, pelanggan PPPoE (tambah + registrasi ONU, isolir, aktifkan), aktivasi pendaftaran, paket, tagihan, pembayaran, laporan, kirim WhatsApp |
| `teknisi` / `teknisi2` | Teknisi | Input pendaftaran pelanggan dari lapangan (koordinat, ODP), ODC/ODP & peta jaringan |

Untuk mengembalikan semua data ke awal: **Reset data demo** di halaman login.

## Apa yang disimulasikan

| Fitur | Di versi demo |
|---|---|
| Secret PPPoE di MikroTik (tambah, isolir, aktifkan, cek sesi) | Router tiruan di `demo-data.json → sim.routers`; isolir mengganti profile secret ke `ISOLIR` |
| Traffic real-time | Grafik bandwidth & paket per detik dari interface router (`sim.routers.*.interfaces`) |
| Registrasi ONU saat menambah pelanggan | OLT tiruan (`sim.olts`) – daftar ONU belum terdaftar & registrasi |
| WhatsApp | Dianggap sudah terhubung oleh admin. Pesan **tidak dikirim sungguhan**, hanya dicatat di *Log pesan* |
| Midtrans | "Link Midtrans" membuka `/midtrans-demo.html`; pilih metode bayar → tagihan lunas & notifikasi muncul di tab operator |
| Notifikasi real-time | Event lokal + `BroadcastChannel` antar-tab di peramban yang sama |
| Job otomatis (tagihan, pengingat H-5, isolir, auto delete) | Berjalan otomatis sekali sehari saat demo dibuka |

Tanggal di data dummy **otomatis digeser ke bulan berjalan** saat pertama dimuat.

Catatan: sesi login disimpan di `localStorage`, sehingga satu peramban hanya bisa login dengan satu akun sekaligus.

## Mengubah data dummy

Edit `src/data/demo-data.json`, lalu **naikkan angka `version`** agar peramban yang pernah membuka demo memuat data baru.

## Struktur

```
public/midtrans-demo.html   halaman simulasi pembayaran online
src/
  data/demo-data.json       data dummy (fiktif)
  mock/                     API tiruan pengganti backend
    db.js core.js           data, router, helper, bus realtime
    settings.js             pengaturan (diatur admin) & hak akses Operator/Teknisi
    sim.js                  simulasi MikroTik (PPPoE), OLT (ONU), WhatsApp
    services.js             billing, isolir/aktivasi, provisioning, Midtrans
    routes-a.js routes-b.js server.js
  lib/api.js lib/socket.js  pengganti fetch & Socket.IO
  pages/ components/        UI React
vercel.json  vite.config.js
```
