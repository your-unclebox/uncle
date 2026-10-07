# Uncle — Platform Ticketing Event (White-Label SaaS)

> Dokumen ini berisi penjelasan tujuan, alur (flow) untuk tiap aktor, dan contoh UI
> untuk project **Uncle**. Contoh kasus pakai di seluruh dokumen ini: event
> **Teater Bagol**.

---

## 1. Tujuan Project

**Uncle** adalah platform ticketing event berbasis web yang disewakan
(white-label) ke penyelenggara event eksternal — bukan hanya tools internal
untuk satu event saja.

**Masalah yang diselesaikan:**
- Penyelenggara event (terutama skala kecil-menengah, contoh: komunitas
  teater) butuh cara jualan tiket online yang terintegrasi dengan pembayaran
  real (QRIS), tanpa harus bikin sistem sendiri dari nol.
- Proses pengecekan tiket & pembayaran di lokasi event (hari-H) sering manual
  dan rawan selisih data — Uncle menyediakan scan QR tiket langsung dari HP
  untuk verifikasi check-in dan status bayar secara real-time.
- Penyelenggara butuh dashboard transaksi yang jelas: siapa sudah bayar, siapa
  belum, tiket siapa yang sudah/belum diambil — semua dalam satu tempat.

**Siapa yang pakai:**
- **Owner** — pemilik platform Uncle, mengelola seluruh event dari banyak
  client sekaligus, menyiapkan landing page tiap event dari template.
- **Admin/Client** — penyelenggara event (organisasi eksternal yang
  menyewa Uncle), mengelola transaksi & check-in event mereka sendiri.
- **Customer** — pembeli tiket, publik umum.

**Prinsip inti:**
- 1 event = 1 landing page dengan subdomain sendiri, isolasi data penuh
  antar-client.
- Uncle tidak pernah memegang uang customer — tiap client pakai akun QRIS
  mereka sendiri, uang langsung masuk ke rekening mereka.
- Pembelian tiket tanpa perlu bikin akun — cukup isi nama, no HP, dan email
  (email wajib, dipakai untuk kirim salinan QR Tiket, bukan untuk login).

---

## 2. Aktor & Peran

| Aktor | Akses | Tanggung Jawab |
|---|---|---|
| **Owner** | Owner Dashboard | Buat event baru, setup landing page (konten, branding, harga tiket, subdomain), invite admin/client, oversight & tracking lintas semua event |
| **Admin/Client** | Admin Dashboard (scoped ke 1 event) | Pantau transaksi & data pembeli, scan QR tiket saat check-in, kelola kredensial QRIS mereka sendiri |
| **Customer** | Landing page publik | Lihat info event, beli tiket, bayar, terima QR tiket |

---

## 3. Alur (Flow)

### 3.1 Flow Owner

1. Login ke Owner Dashboard
2. Klik **"Buat Event Baru"**
3. Isi detail event dari template: nama, deskripsi, dokumentasi (foto/video),
   lokasi, tanggal & waktu
4. Setup branding: logo, warna tema
5. Setup jenis & harga tiket (boleh lebih dari 1 kategori, masing-masing ada
   kuota)
6. Setup kontak & kebijakan: kontak penyelenggara (WA/email/IG), syarat &
   ketentuan, kebijakan pengembalian — ditampilkan di landing page
7. Setup slug/subdomain (contoh: `teaterbagol` → `teaterbagol.uncle.id`)
8. Publish → landing page langsung live di subdomain-nya
9. Invite akun Admin (client) khusus untuk event tersebut
10. Pantau semua event dari dashboard pusat: total tiket terjual, revenue,
    status tiap event

### 3.2 Flow Admin/Client

1. Login — hanya bisa akses data event miliknya sendiri
2. Lihat daftar transaksi: nama pembeli, no HP, jenis & jumlah tiket, metode
   bayar, status bayar, status ambil tiket
3. (Opsional) Setup kredensial akun QRIS sendiri di menu **Payment Settings**
4. Filter/cari transaksi (misal: yang belum bayar, yang belum diambil)
5. Buka menu **"Scan Tiket"** dari HP di lokasi event
6. Scan QR tiket milik pembeli
7. Sistem tampilkan detail transaksi terkait
8. **Jika QRIS** → status bayar otomatis "Lunas", admin tinggal tandai
   **"Tiket Diambil"**
9. **Jika Cash** → admin terima uang dulu → tandai manual **"Lunas"** →
   tandai **"Tiket Diambil"**

### 3.3 Flow Customer

1. Buka landing page `{slug}.uncle.id`
2. Lihat deskripsi, dokumentasi, lokasi, waktu, jenis & harga tiket
3. Klik **"Pilih Tiket"** → pilih jenis & jumlah tiket (boleh campur jenis
   dalam 1 transaksi)
4. Isi data diri: nama, no HP, email (wajib — dipakai untuk kirim salinan QR
   Tiket)
5. Pilih metode bayar: **QRIS** atau **Cash**
6. **QRIS** → muncul QR pembayaran sesuai total harga → bayar via e-wallet/
   m-banking apa pun → status otomatis ter-update lewat webhook
7. **Cash** → langsung lanjut tanpa pembayaran online, status pesanan jadi
   **"Reserved"** dengan batas waktu (kuota otomatis kembali ke pool kalau
   tidak diambil/dibayar sampai batas waktu habis — diatur Owner per event)
8. Sistem generate **QR Tiket** (beda dari QR pembayaran) → tampil di layar +
   terkirim ke email
9. Di venue, customer tunjukkan QR Tiket ke admin untuk discan, ambil tiket
   fisik (dan bayar cash kalau belum)

---

## 4. Contoh UI

### 4.1 Landing Page (Customer, per event)

```
┌─────────────────────────────────────────────────┐
│  [Logo Client]                   [Cek Pesanan]  │  Header (minimal,
├─────────────────────────────────────────────────┤  tanpa search/
│                                                   │  marketplace nav
│            [   BANNER / COVER EVENT   ]          │
│                                                   │  Hero
│  Teater Bagol — "Nama Lakon"                      │
│  📅 Sabtu, 20 Des 2026 · 19:00–22:00 WIB           │
│  📍 Gedung Kesenian, Jakarta     [Lihat peta]     │
│                                                   │
│              [   Pilih Tiket   ]                 │
├─────────────────────────────────────────────────┤
│  Ajak teman nonton:   [ WhatsApp ]  [ Salin Link]│  Share
├─────────────────────────────────────────────────┤
│  Deskripsi | Dokumentasi | Tiket | Lokasi         │  Tab nav (sticky)
├─────────────────────────────────────────────────┤
│  ## Deskripsi                                     │
│  Tanggal: 20 Des 2026   Jam: 19:00–22:00 WIB      │
│  Kategori: Teater       Tipe: Di lokasi           │
│                                                   │
│  [ Paragraf deskripsi lengkap event ... ]         │
│                                                   │
│  ▸ Kebijakan Pengembalian (expand/collapse)       │
├─────────────────────────────────────────────────┤
│  ## Dokumentasi                                   │
│  [foto 1] [foto 2] [foto 3] [video]               │
├─────────────────────────────────────────────────┤
│  ## Tiket                                         │
│  ┌─────────────────────────────────┐              │
│  │ Reguler          Rp 75.000      │  [ − 0 + ]   │
│  │ Kuota tersisa: 20 (dari 150)       │             │
│  ├─────────────────────────────────┤              │
│  │ VIP               Rp 150.000     │  [ − 0 + ]   │
│  │ Kuota tersisa: 10 (dari 50)        │             │
│  └─────────────────────────────────┘              │
│  Subtotal: Rp 0                                   │
│  [ Lanjut Isi Data Diri → ]                       │
│                                                   │
│  --- Step 2: Data Diri ---                        │
│  Nama      [__________________]                   │
│  No. HP    [__________________]                   │
│  Email     [__________________]  (wajib)          │
│                                                   │
│  --- Step 3: Metode Pembayaran ---                │
│  ( ) QRIS        ( ) Cash                         │
│  [ Bayar Sekarang → ]                             │
│                                                   │
│  --- Step 4: Pembayaran ---                       │
│  [QR PEMBAYARAN]     ← khusus QRIS, nominal sesuai│
│  (Cash: lewati step ini, langsung ke step 5)      │
│                                                   │
│  --- Step 5: Tiket Siap ---                       │
│  [   QR TIKET   ]                                 │
│  Tunjukkan QR ini saat pengambilan tiket di lokasi│
│  ✅ Juga sudah dikirim ke email kamu               │
├─────────────────────────────────────────────────┤
│  ## Lokasi                                        │
│  [  EMBED GOOGLE MAPS  ]                          │
│  Gedung Kesenian, Jl. Contoh No. 1, Jakarta        │
│  [ Salin Alamat ]   [ Petunjuk Arah ]              │
├─────────────────────────────────────────────────┤
│  Kontak Penyelenggara  |  Syarat & Kebijakan       │
│  Metode Bayar:  [QRIS]  [Cash]                     │
└─────────────────────────────────────────────────┘
```

### 4.2 Owner Dashboard

```
┌─────────────────────────────────────────────────────┐
│  UNCLE — Owner Dashboard            [Profil Owner ▾] │
├────────┬──────────────────────────────────────────────┤
│ Menu   │  Ringkasan Semua Event                        │
│        │  ┌──────────┬──────────┬──────────┐           │
│ •Event │  │Total Event│ Tiket    │ Event    │           │
│ •Client│  │    12     │ Terjual  │ Aktif    │           │
│ •Report│  │           │  3.480   │    5     │           │
│        │  └──────────┴──────────┴──────────┘           │
│        │                                                │
│        │  Daftar Event                [+ Buat Event]    │
│        │  ┌──────────────────────────────────────────┐ │
│        │  │ Teater Bagol   | Aktif   | 170 terjual   │ │
│        │  │ Konser X       | Draft   | -             │ │
│        │  │ Workshop Y     | Selesai | 80 terjual    │ │
│        │  └──────────────────────────────────────────┘ │
└────────┴──────────────────────────────────────────────┘

↓ klik salah satu event untuk edit

┌─────────────────────────────────────────────────────┐
│  Edit Event: Teater Bagol                             │
├─────────────────────────────────────────────────────┤
│  [Tab] Info Umum | Branding | Jenis Tiket |            │
│        Kebijakan & Kontak | Subdomain | Akses Admin    │
│                                                         │
│  --- Info Umum ---                                     │
│  Nama Event      [______________________]              │
│  Deskripsi       [______________________]              │
│  Tanggal         [______________________]              │
│  Jam Mulai       [______________________]              │
│  Jam Selesai     [______________________]  (wajib —    │
│                   default terisi Jam Mulai + 3 jam,     │
│                   bisa diubah; dipakai sebagai basis    │
│                   default batas reservasi Cash)         │
│  Lokasi          [______________________]              │
│  Dokumentasi     [ Upload Foto / Video ]                │
│                                                         │
│  --- Branding ---                                      │
│  Logo            [ Upload ]                             │
│  Warna Tema      [●Primary]  [●Secondary]                │
│                                                         │
│  --- Jenis Tiket ---                                    │
│  [+ Tambah Jenis Tiket]                                  │
│    Reguler  | Rp 75.000  | Kuota 150                     │
│    VIP      | Rp 150.000 | Kuota 50                      │
│                                                         │
│  --- Kebijakan & Kontak ---                             │
│  Kontak Penyelenggara  [WA] [Email] [Instagram]          │
│  Syarat & Ketentuan    [______________________]          │
│  Kebijakan Pengembalian[______________________]          │
│                                                         │
│  --- Subdomain ---                                      │
│  slug: [ teaterbagol ]  →  teaterbagol.uncle.id          │
│                                                         │
│  --- Akses Admin ---                                    │
│  [+ Invite Admin]  (email, nama)                         │
│    admin@teaterbagol.com   (sudah diinvite)               │
│                                                         │
│  [ Simpan & Publish ]                                    │
└─────────────────────────────────────────────────────┘
```

### 4.3 Admin Dashboard (Client, scoped per event)

```
┌─────────────────────────────────────────────────────┐
│  UNCLE — Admin Dashboard (Teater Bagol)  [Profil ▾]   │
├────────┬──────────────────────────────────────────────┤
│ Menu   │  Ringkasan                                     │
│        │  ┌───────┬───────┬───────┬───────────┐         │
│•Transaksi│Terjual│ Lunas │ Belum │ Diambil   │           │
│•Scan Tiket│  170 │  150  │  20   │    130    │           │
│•Payment  │ └───────┴───────┴───────┴───────────┘         │
│ Settings │                                                │
│        │  Daftar Transaksi         [Filter ▾] [Cari...]  │
│        │  ┌──────────────────────────────────────────┐  │
│        │  │ Nama   |No HP  |Tiket |Bayar|Status|Ambil │  │
│        │  │ Budi S.|0812xx |2 Reg |QRIS |Lunas |Belum │  │
│        │  │ Siti R.|0813xx |1 VIP |Cash |Belum |Belum │  │
│        │  └──────────────────────────────────────────┘  │
└────────┴──────────────────────────────────────────────┘

--- Menu Payment Settings ---
┌─────────────────────────────────────────────────────┐
│  Konfigurasi QRIS                                      │
│  Provider         [ DOKU ▾ ]                            │
│  Client ID (BRN)  [ ●●●●●●●●●●●● ]                       │
│  Secret Key       [ ●●●●●●●●●●●● ]                       │
│  Status Koneksi   ✅ Terhubung                            │
│  [ Simpan ]                                              │
└─────────────────────────────────────────────────────┘
```

### 4.4 Scanner Page (Mobile, diakses admin via HP)

```
┌─────────────────────────┐
│  UNCLE — Scan Tiket       │
│  Teater Bagol              │
├─────────────────────────┤
│                           │
│   [   KAMERA AKTIF    ]   │
│   (arahkan ke QR tiket)   │
│                           │
├─────────────────────────┤
│  Hasil Scan:               │
│  Nama    : Budi S.          │
│  Tiket   : 2x Reguler       │
│  Metode  : QRIS              │
│  Bayar   : ✅ Lunas          │
│                           │
│  [ Tandai Tiket Diambil ] │
└─────────────────────────┘

--- Kasus: metode Cash & belum bayar ---
┌─────────────────────────┐
│  Nama    : Siti R.          │
│  Tiket   : 1x VIP            │
│  Metode  : Cash               │
│  Bayar   : ❌ Belum           │
│                           │
│  [ ] Sudah terima uang      │
│  [ Konfirmasi Lunas ]       │
│                           │
│  (tombol "Tandai Diambil"  │
│   aktif setelah dikonfirmasi│
│   lunas)                    │
└─────────────────────────┘
```

---

## 5. Model Pembayaran

- **QRIS** — tiap client/admin event menghubungkan akun QRIS miliknya
  sendiri (lewat Payment Settings di Admin Dashboard). Pembayaran customer
  masuk langsung ke rekening client, bukan ke Uncle. Status "Lunas"
  ter-update otomatis lewat webhook dari payment gateway.
- **Cash** — tidak ada pembayaran online. Pesanan Cash berstatus
  **"Reserved"** (bukan langsung "Lunas") dan mengunci kuota tiket. Karena
  pembayaran Cash dilakukan di venue pada hari-H, batas waktu reservasi
  default-nya adalah **jam selesai event** (bukan H-1 — supaya kuota tidak
  terlepas sebelum pembeli sempat datang). Owner bisa mempercepat batas ini
  per event kalau perlu (misal: jam mulai event, atau sekian jam setelah
  mulai), supaya kuota lebih cepat tersedia lagi kalau memang diperlukan.
  Kalau lewat batas waktu, kuota kembali ke pool dan tiket bisa dibeli
  orang lain. Status bayar ditandai manual oleh admin saat scan di lokasi,
  setelah uang diterima.

Channel pembayaran lain (Virtual Account, e-wallet, minimarket) bisa
ditambahkan belakangan tanpa mengubah arsitektur inti, karena mengikuti
channel yang didukung payment gateway yang dipakai.

**Refund** — Uncle tidak memproses pengembalian dana secara finansial,
karena platform tidak pernah memegang uang customer (lihat Prinsip Inti di
bagian 1). Admin/Client bisa menandai status pesanan menjadi
**"Dibatalkan/Refund"** di dashboard mereka untuk keperluan pencatatan
(tiket otomatis dianggap tidak valid saat discan), tapi proses pengembalian
uang ke customer dilakukan sendiri oleh client di luar sistem Uncle (manual
transfer, atau lewat dashboard payment gateway mereka).

---

## 6. Catatan Penutup

Dokumen ini fokus pada **tujuan, flow, dan gambaran UI** sebagai acuan desain
& komunikasi. Rincian teknis seperti skema database, daftar entity &
relasinya, serta matriks permission per role akan dituangkan di dokumen
spesifikasi teknis terpisah sebelum development dimulai.
