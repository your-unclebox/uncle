# PRD — Uncle: Platform Ticketing Event (White-Label)

> **Sumber kebenaran:** `uncle-overview.md`. Dokumen ini tidak mengubah keputusan
> yang ada di sana. Setiap hal yang belum diputuskan di overview ditandai
> **"Asumsi — perlu konfirmasi"**, dan semua pertanyaan dikumpulkan di bagian
> **Pertanyaan Terbuka** di akhir dokumen.
>
> **Contoh kasus:** event **Teater Bagol** (`teaterbagol.uncle.id`).
> **Status:** Draft v1 · **Tanggal:** 6 Oktober 2026 · **Scope:** MVP

---

## Product Goal

### Ringkasan

**Uncle** adalah platform ticketing event berbasis web yang **disewakan
(white-label)** ke penyelenggara event eksternal. Tiap event punya landing page
sendiri di subdomain `{slug}.uncle.id`, customer bisa beli tiket tanpa bikin
akun, bayar lewat **QRIS** (masuk langsung ke akun QRIS milik client) atau
**Cash** (dibayar di lokasi), lalu menerima **QR Tiket** yang discan admin di
venue untuk verifikasi bayar & pengambilan tiket.

### Masalah yang diselesaikan

| # | Masalah | Solusi Uncle |
|---|---|---|
| 1 | Penyelenggara event kecil–menengah (mis. komunitas teater) butuh jualan tiket online yang terhubung ke pembayaran real (QRIS) tanpa bikin sistem sendiri dari nol. | Landing page siap pakai dari template + integrasi QRIS memakai akun milik client sendiri. |
| 2 | Pengecekan tiket & pembayaran di hari-H manual dan rawan selisih data. | Scan QR Tiket dari HP yang langsung menampilkan status bayar & status ambil secara real-time. |
| 3 | Tidak ada satu tempat untuk melihat siapa sudah bayar, siapa belum, tiket siapa yang sudah/belum diambil. | Admin Dashboard per event dengan daftar transaksi, filter, dan ringkasan. |

### Kenapa project ini dibuat

- Membuka model bisnis **SaaS white-label**: satu platform melayani banyak
  penyelenggara, bukan tools internal untuk satu event.
- **Uncle tidak pernah memegang uang customer** — menghilangkan beban
  regulasi/rekonsiliasi dana pihak ketiga, dan membuat client percaya karena uang
  langsung masuk ke rekening mereka.
- Owner bisa **menerbitkan event baru dengan cepat** dari template, lalu
  menyerahkan operasional ke client lewat akun admin terisolasi.

### Success Metrics (MVP)

> Semua angka target di bawah adalah **usulan — perlu konfirmasi**; overview
> tidak menetapkan target kuantitatif.

| Kategori | Metrik | Target MVP (usulan) |
|---|---|---|
| Adopsi | Event yang live end-to-end (publish → jual → scan di venue) | ≥ 1 event pilot (Teater Bagol) sukses, lalu ≥ 3 client dalam 3 bulan pertama |
| Efisiensi Owner | Waktu dari "Buat Event Baru" sampai landing page live | ≤ 30 menit (konten & aset sudah tersedia) |
| Konversi Customer | Rasio checkout selesai (klik "Pilih Tiket" → QR Tiket terbit) | ≥ 60% |
| Keandalan pembayaran | Status QRIS ter-update otomatis via webhook setelah customer bayar | ≥ 99% transaksi ter-update ≤ 10 detik |
| Akurasi data | Selisih antara transaksi "Lunas" QRIS di Uncle vs laporan payment gateway client | 0 selisih |
| Integritas kuota | Kejadian overselling (tiket terjual melebihi kuota) | 0 |
| Kecepatan check-in | Waktu dari QR discan sampai detail transaksi tampil | ≤ 3 detik (koneksi 4G) |
| Kecepatan check-in | Waktu proses 1 pembeli QRIS (scan → "Tiket Diambil") | ≤ 15 detik |
| Keamanan | Insiden data satu client terlihat oleh client lain | 0 |
| Pengiriman | QR Tiket terkirim ke email (jika email diisi) | ≥ 95% terkirim ≤ 5 menit |

---

## User / Persona

### Persona 1 — Owner (Pemilik Platform Uncle)

| Aspek | Deskripsi |
|---|---|
| **Nama peran** | Owner |
| **Akses** | Owner Dashboard |
| **Konteks penggunaan** | Pemilik/operator platform Uncle. Menangani banyak event dari banyak client sekaligus. Bekerja dari laptop/desktop. Menerima materi event dari client (deskripsi, foto, logo, harga), lalu menyiapkan landing page dari template, memasang subdomain, dan mengundang admin client. |
| **Tujuan memakai sistem** | (1) Menerbitkan landing page event baru dengan cepat dan konsisten dari template; (2) Memberi client akses terisolasi untuk event mereka; (3) Memantau seluruh event dari satu dashboard pusat (total tiket terjual, revenue, status event). |
| **Pain point sebelum Uncle** *(disimpulkan dari tujuan project)* | Setiap event baru berarti setup halaman & alur pembelian dari nol; tidak ada pandangan terpusat atas performa banyak event; sulit menawarkan layanan ke penyelenggara eksternal tanpa menanggung risiko memegang uang mereka. |

### Persona 2 — Admin/Client (Penyelenggara Event)

| Aspek | Deskripsi |
|---|---|
| **Nama peran** | Admin/Client (contoh: panitia/koordinator tiket Teater Bagol) |
| **Akses** | Admin Dashboard, **scoped ke 1 event** |
| **Konteks penggunaan** | Organisasi eksternal skala kecil–menengah yang menyewa Uncle. Sebelum hari-H memantau transaksi dari laptop/HP; pada hari-H berdiri di meja pengambilan tiket di venue dan memindai QR Tiket memakai **HP**. Menerima uang cash langsung dari pembeli yang memilih Cash. |
| **Tujuan memakai sistem** | (1) Menerima pembayaran QRIS langsung ke akun/rekening sendiri; (2) Tahu persis siapa sudah bayar, siapa belum, tiket siapa sudah/belum diambil; (3) Check-in pembeli cepat & tanpa selisih data di hari-H. |
| **Pain point sebelum Uncle** | Tidak punya sistem jual tiket online yang terintegrasi dengan pembayaran real; pengecekan tiket & pembayaran di lokasi dilakukan manual dan rawan selisih; data transaksi tersebar sehingga sulit tahu status bayar & status ambil tiket. |

### Persona 3 — Customer (Pembeli Tiket)

| Aspek | Deskripsi |
|---|---|
| **Nama peran** | Customer |
| **Akses** | Landing page publik `{slug}.uncle.id` |
| **Konteks penggunaan** | Publik umum, mayoritas membuka dari HP lewat link yang dibagikan (mis. WhatsApp). Membeli satu atau beberapa tiket, kadang campuran kategori (mis. 2 Reguler + 1 VIP) untuk teman/keluarga. |
| **Tujuan memakai sistem** | (1) Melihat info event dengan jelas (deskripsi, dokumentasi, lokasi, waktu, harga); (2) Membeli tiket secepat mungkin tanpa membuat akun; (3) Membayar pakai e-wallet/m-banking apa pun via QRIS, atau memilih bayar Cash di lokasi; (4) Punya bukti tiket (QR Tiket) yang mudah ditunjukkan di venue. |
| **Pain point sebelum Uncle** *(disimpulkan)* | Proses beli tiket event kecil sering lewat chat & transfer manual yang lambat dan butuh konfirmasi bukti bayar; tidak ada kepastian bahwa pembayaran sudah tercatat; platform tiket besar sering mewajibkan pembuatan akun. |

---

## User Stories

### Epic 1 — Manajemen Event (Owner)

| ID | User Story |
|---|---|
| US-OWN-01 | Sebagai **Owner**, saya ingin login ke Owner Dashboard, supaya hanya saya yang bisa mengelola seluruh event & client di platform. |
| US-OWN-02 | Sebagai **Owner**, saya ingin membuat event baru dari template dengan mengisi nama, deskripsi, dokumentasi (foto/video), lokasi, serta tanggal & waktu, supaya landing page event bisa disiapkan cepat tanpa membangun halaman dari nol. |
| US-OWN-03 | Sebagai **Owner**, saya ingin mengatur branding event (logo, warna tema primary & secondary), supaya landing page terlihat sebagai milik client (white-label). |
| US-OWN-04 | Sebagai **Owner**, saya ingin menambahkan lebih dari satu jenis tiket, masing-masing dengan harga dan kuota, supaya client bisa menjual kategori tiket berbeda (mis. Reguler & VIP). |
| US-OWN-05 | Sebagai **Owner**, saya ingin menentukan slug/subdomain event (mis. `teaterbagol` → `teaterbagol.uncle.id`), supaya tiap event punya alamat sendiri yang mudah dibagikan. |
| US-OWN-06 | Sebagai **Owner**, saya ingin mem-publish event, supaya landing page langsung live di subdomain-nya dan customer bisa membeli tiket. |
| US-OWN-07 | Sebagai **Owner**, saya ingin mengedit event yang sudah ada, supaya perubahan info dari client (mis. revisi deskripsi atau tambah kuota) bisa diterapkan. |

### Epic 2 — Akses Client (Owner & Admin)

| ID | User Story |
|---|---|
| US-ACC-01 | Sebagai **Owner**, saya ingin meng-invite akun Admin (email, nama) khusus untuk satu event, supaya client bisa mengelola event mereka tanpa saya beri akses ke event lain. |
| US-ACC-02 | Sebagai **Admin/Client**, saya ingin menerima undangan dan mengaktifkan akun saya, supaya saya bisa login ke Admin Dashboard event saya. |
| US-ACC-03 | Sebagai **Admin/Client**, saya ingin hanya melihat data event milik saya sendiri, supaya data pembeli kami aman dan tidak tercampur dengan client lain. |

### Epic 3 — Monitoring & Laporan (Owner)

| ID | User Story |
|---|---|
| US-REP-01 | Sebagai **Owner**, saya ingin melihat ringkasan semua event (total event, tiket terjual, event aktif, revenue), supaya saya tahu kondisi bisnis platform dalam sekali lihat. |
| US-REP-02 | Sebagai **Owner**, saya ingin melihat daftar event beserta statusnya (Draft/Aktif/Selesai) dan jumlah tiket terjual, supaya saya bisa memantau tiap event dan memilih event yang perlu diedit. |
| US-REP-03 | Sebagai **Owner**, saya ingin melihat daftar client dan laporan lintas event, supaya saya bisa mengevaluasi performa tiap client. |

### Epic 4 — Transaksi & Payment Settings (Admin)

| ID | User Story |
|---|---|
| US-ADM-01 | Sebagai **Admin/Client**, saya ingin melihat ringkasan event (Terjual, Lunas, Belum, Diambil), supaya saya tahu progres penjualan dan check-in. |
| US-ADM-02 | Sebagai **Admin/Client**, saya ingin melihat daftar transaksi (nama, no HP, jenis & jumlah tiket, metode bayar, status bayar, status ambil), supaya saya tahu siapa saja pembeli dan statusnya. |
| US-ADM-03 | Sebagai **Admin/Client**, saya ingin memfilter dan mencari transaksi (mis. yang belum bayar, yang belum diambil), supaya saya bisa menindaklanjuti pembeli tertentu dengan cepat. |
| US-ADM-04 | Sebagai **Admin/Client**, saya ingin menghubungkan kredensial akun QRIS saya sendiri di menu Payment Settings, supaya pembayaran customer masuk langsung ke rekening saya, bukan ke Uncle. |
| US-ADM-05 | Sebagai **Admin/Client**, saya ingin melihat status koneksi QRIS saya, supaya saya yakin pembayaran QRIS bisa berjalan sebelum penjualan dibuka. |

### Epic 5 — Pembelian Tiket (Customer)

| ID | User Story |
|---|---|
| US-CUS-01 | Sebagai **Customer**, saya ingin membuka landing page `{slug}.uncle.id` dan melihat deskripsi, dokumentasi, lokasi, waktu, serta jenis & harga tiket, supaya saya bisa memutuskan untuk membeli. |
| US-CUS-02 | Sebagai **Customer**, saya ingin memilih jenis & jumlah tiket, termasuk mencampur beberapa jenis dalam satu transaksi, supaya saya bisa membeli untuk rombongan sekaligus. |
| US-CUS-03 | Sebagai **Customer**, saya ingin melihat kuota tersisa tiap jenis tiket, supaya saya tahu ketersediaan sebelum memesan. |
| US-CUS-04 | Sebagai **Customer**, saya ingin cukup mengisi nama & no HP tanpa membuat akun, supaya proses beli cepat. |
| US-CUS-05 | Sebagai **Customer**, saya ingin memilih metode bayar QRIS atau Cash, supaya saya bisa bayar dengan cara yang paling nyaman. |
| US-CUS-06 | Sebagai **Customer** yang memilih QRIS, saya ingin melihat QR pembayaran dengan nominal sesuai total dan statusnya ter-update otomatis setelah saya bayar, supaya saya tidak perlu mengirim bukti transfer. |
| US-CUS-07 | Sebagai **Customer** yang memilih Cash, saya ingin langsung mendapat QR Tiket tanpa pembayaran online, supaya saya bisa bayar di lokasi saat mengambil tiket. |
| US-CUS-08 | Sebagai **Customer**, saya ingin QR Tiket tampil di layar dan terkirim ke email, supaya saya punya bukti tiket yang tidak hilang. |
| US-CUS-09 | Sebagai **Customer**, saya ingin mengecek pesanan saya kembali lewat tombol "Cek Pesanan", supaya saya bisa menampilkan ulang QR Tiket jika layar tertutup. |
| US-CUS-10 | Sebagai **Customer**, saya ingin membagikan link event lewat WhatsApp atau menyalin link, supaya saya bisa mengajak teman nonton. |
| US-CUS-11 | Sebagai **Customer**, saya ingin melihat lokasi di peta, menyalin alamat, dan membuka petunjuk arah, supaya saya mudah sampai ke venue. |
| US-CUS-12 | Sebagai **Customer**, saya ingin membaca kebijakan pengembalian, syarat & kebijakan, dan kontak penyelenggara, supaya saya tahu hak saya sebelum membeli. |

### Epic 6 — Check-in di Venue (Admin via Scanner)

| ID | User Story |
|---|---|
| US-SCN-01 | Sebagai **Admin/Client**, saya ingin membuka menu "Scan Tiket" dari HP dan memakai kamera untuk memindai QR Tiket, supaya check-in di lokasi tidak perlu perangkat khusus. |
| US-SCN-02 | Sebagai **Admin/Client**, saya ingin sistem menampilkan detail transaksi (nama, tiket, metode, status bayar) setelah QR discan, supaya saya bisa memverifikasi pembeli. |
| US-SCN-03 | Sebagai **Admin/Client**, saya ingin menandai "Tiket Diambil" untuk transaksi QRIS yang sudah Lunas otomatis, supaya pengambilan tiket tercatat dan tidak bisa diulang. |
| US-SCN-04 | Sebagai **Admin/Client**, saya ingin mengonfirmasi "Lunas" secara manual untuk transaksi Cash setelah menerima uang, baru kemudian menandai "Tiket Diambil", supaya tidak ada tiket diserahkan sebelum dibayar. |
| US-SCN-05 | Sebagai **Admin/Client**, saya ingin diberi peringatan jika QR sudah pernah diambil, tidak valid, atau milik event lain, supaya tidak terjadi penyerahan tiket ganda atau penipuan. |

---

## Features

**Legenda prioritas:** **Must** = wajib ada di MVP · **Should** = penting, masuk MVP
bila kapasitas memungkinkan · **Could** = nice-to-have, bisa setelah MVP.

### A. Owner Dashboard

| ID | Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| OWN-01 | Login Owner | Autentikasi akun Owner ke Owner Dashboard. | Must |
| OWN-02 | Ringkasan Semua Event | Kartu metrik: Total Event, Tiket Terjual, Event Aktif, Revenue (lintas semua event). | Must |
| OWN-03 | Daftar Event | Tabel event dengan nama, status (Draft/Aktif/Selesai), jumlah tiket terjual; klik untuk edit; tombol "+ Buat Event". | Must |
| OWN-04 | Buat/Edit Event — Info Umum | Form dari template: nama event, deskripsi, tanggal/waktu, lokasi. | Must |
| OWN-05 | Upload Dokumentasi | Upload foto/video untuk galeri landing page. | Must |
| OWN-06 | Branding | Upload logo, pilih warna tema Primary & Secondary. | Must |
| OWN-07 | Jenis Tiket | Tambah/edit/hapus jenis tiket: nama, harga, kuota (boleh > 1 kategori). | Must |
| OWN-08 | Subdomain/Slug | Input slug dengan preview `{slug}.uncle.id` dan validasi keunikan & format. | Must |
| OWN-09 | Simpan & Publish | Simpan sebagai Draft atau Publish → landing page langsung live di subdomain. | Must |
| OWN-10 | Akses Admin (Invite) | Invite admin per event (email, nama), lihat status undangan. | Must |
| OWN-11 | Konten Pendukung Landing | Isi kontak penyelenggara, syarat & kebijakan, kebijakan pengembalian, kategori & tipe event (mis. Teater / Di lokasi) yang tampil di landing page. *(Asumsi — perlu konfirmasi: diisi oleh Owner karena field ini muncul di landing page tapi tidak tercantum di form Owner pada overview.)* | Should |
| OWN-12 | Menu Client | Daftar client/admin beserta event yang mereka pegang dan status undangan. | Should |
| OWN-13 | Menu Report | Laporan lintas event: tiket terjual & revenue per event, per metode bayar. | Should |
| OWN-14 | Unpublish / Tutup Penjualan | Menarik event dari publik atau menutup penjualan tanpa menghapus data. *(Asumsi — perlu konfirmasi)* | Should |
| OWN-15 | Status Selesai Otomatis | Event berubah ke "Selesai" setelah tanggal/waktu event lewat. *(Asumsi — perlu konfirmasi)* | Should |
| OWN-16 | Export Report (CSV) | Unduh laporan lintas event. | Could |

### B. Admin Dashboard (scoped per event)

| ID | Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| ADM-01 | Aktivasi Akun & Login Admin | Admin mengaktifkan akun dari undangan (set password), lalu login. | Must |
| ADM-02 | Scoping Data per Event | Semua data, menu, dan API hanya untuk event yang di-assign ke admin. | Must |
| ADM-03 | Ringkasan Event | Kartu: Terjual, Lunas, Belum (bayar), Diambil. | Must |
| ADM-04 | Daftar Transaksi | Kolom: nama, no HP, jenis & jumlah tiket, metode bayar, status bayar, status ambil. | Must |
| ADM-05 | Filter & Cari Transaksi | Filter status bayar, status ambil, metode bayar; cari nama/no HP/kode pesanan. | Must |
| ADM-06 | Detail Transaksi | Rincian item tiket, total, waktu transaksi, waktu lunas, waktu diambil, siapa yang menandai. | Must |
| ADM-07 | Payment Settings (QRIS) | Pilih provider (mis. Tripay), isi API Key & Private Key (dimasking), simpan, tampilkan status koneksi. | Must |
| ADM-08 | Kirim Ulang QR Tiket | Kirim ulang email QR Tiket ke pembeli. *(Asumsi)* | Could |
| ADM-09 | Batalkan Transaksi / Tandai Refund | Batalkan transaksi (mis. Cash tidak datang, atau refund di luar sistem) → kuota dikembalikan & QR Tiket tidak berlaku. *(Asumsi — perlu konfirmasi, lihat BR Refund)* | Could |
| ADM-10 | Export Transaksi (CSV) | Unduh daftar transaksi event. | Could |

### C. Landing Page (Customer, per event)

| ID | Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| LP-01 | Routing Subdomain | `{slug}.uncle.id` menampilkan landing page event terkait dengan branding client. | Must |
| LP-02 | Header Minimal & Hero | Logo client, tombol "Cek Pesanan", banner/cover, nama event, tanggal & jam, lokasi + "Lihat peta", tombol "Pilih Tiket". Tanpa navigasi marketplace. | Must |
| LP-03 | Tab Navigasi Sticky | Deskripsi · Dokumentasi · Tiket · Lokasi. | Should |
| LP-04 | Section Deskripsi | Tanggal, jam, kategori, tipe, paragraf deskripsi, Kebijakan Pengembalian (expand/collapse). | Must |
| LP-05 | Section Dokumentasi | Galeri foto & video. | Must |
| LP-06 | Pilih Tiket (Step 1) | Daftar jenis tiket, harga, kuota tersisa, stepper [− n +], subtotal; boleh campur jenis. | Must |
| LP-07 | Data Diri (Step 2) | Nama & No. HP (wajib). Email untuk pengiriman QR Tiket — lihat BR-TRX-03. | Must |
| LP-08 | Metode Pembayaran (Step 3) | Pilih QRIS atau Cash. | Must |
| LP-09 | Pembayaran QRIS (Step 4) | Tampilkan QR pembayaran dengan nominal = total, countdown batas waktu, status auto-update via webhook. | Must |
| LP-10 | Tiket Siap (Step 5) | Tampilkan QR Tiket (beda dari QR pembayaran) + kode pesanan + instruksi; kirim ke email. | Must |
| LP-11 | Cek Pesanan | Customer menampilkan ulang pesanan & QR Tiket. Mekanisme: kode pesanan + no HP. *(Asumsi — perlu konfirmasi)* | Should |
| LP-12 | Share | Tombol WhatsApp & Salin Link. | Should |
| LP-13 | Section Lokasi | Embed Google Maps, alamat lengkap, Salin Alamat, Petunjuk Arah. | Should (alamat teks: Must) |
| LP-14 | Footer | Kontak Penyelenggara, Syarat & Kebijakan, ikon metode bayar (QRIS, Cash). | Should |
| LP-15 | Mobile-first Responsive | Seluruh alur nyaman dipakai di layar HP. | Must |
| LP-16 | State Khusus | Tampilan untuk: slug tidak ditemukan, event belum publish, tiket habis per jenis / semua, penjualan ditutup, event selesai. | Must |

### D. Scanner (Mobile, diakses Admin via HP)

| ID | Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| SCN-01 | Halaman Scan Tiket | Halaman mobile web dengan kamera aktif, header nama event. Hanya untuk admin yang login. | Must |
| SCN-02 | Scan & Tampil Detail | Scan QR Tiket → tampil nama, tiket (jenis × jumlah), metode, status bayar, status ambil. | Must |
| SCN-03 | Tandai Tiket Diambil | Tombol aktif hanya jika status bayar Lunas. | Must |
| SCN-04 | Konfirmasi Lunas (Cash) | Checkbox "Sudah terima uang" + tombol "Konfirmasi Lunas"; setelah itu tombol "Tandai Diambil" aktif. | Must |
| SCN-05 | Validasi Scan | Tolak/peringatkan: QR tidak valid, QR milik event lain, tiket sudah diambil, transaksi dibatalkan, QRIS belum lunas. | Must |
| SCN-06 | Input Kode Manual | Fallback ketik kode pesanan jika kamera tidak tersedia / QR rusak. *(Asumsi)* | Should |
| SCN-07 | Multi-perangkat Bersamaan | Beberapa admin bisa scan bersamaan; status selalu konsisten (tidak ada pengambilan ganda). | Should |

### E. Lintas Area (Platform & Non-Fungsional)

| ID | Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| PLT-01 | Webhook Payment Gateway | Endpoint webhook per client, verifikasi signature memakai kredensial client, idempotent. | Must |
| PLT-02 | Penyimpanan Kredensial Aman | API Key & Private Key dienkripsi at-rest, tidak pernah ditampilkan ulang dalam bentuk utuh. | Must |
| PLT-03 | Pengiriman Email QR Tiket | Email berisi QR Tiket, kode pesanan, ringkasan pesanan & info event. | Must |
| PLT-04 | Kontrol Kuota Atomik | Pengurangan/penahanan kuota aman terhadap pembelian bersamaan (no overselling). | Must |
| PLT-05 | Audit Log | Catat siapa & kapan menandai Lunas (Cash), Diambil, membatalkan, atau mengubah Payment Settings. *(Asumsi)* | Should |
| PLT-06 | Notifikasi WhatsApp/SMS | Kirim QR Tiket ke no HP. | Could |
| PLT-07 | Channel Bayar Tambahan | VA, e-wallet, minimarket sesuai dukungan gateway (overview: bisa ditambahkan belakangan). | Could (pasca-MVP) |

---

## Business Rules

### Event & Landing Page

| ID | Aturan |
|---|---|
| BR-EVT-01 | **1 event = 1 landing page = 1 subdomain** `{slug}.uncle.id`. |
| BR-EVT-02 | Slug harus unik di seluruh platform. *Asumsi — perlu konfirmasi:* format huruf kecil `a–z`, angka `0–9`, dan tanda `-`; panjang 3–30 karakter; tidak boleh diawali/diakhiri `-`; daftar kata cadangan ditolak (mis. `www`, `admin`, `api`, `app`, `owner`, `mail`). |
| BR-EVT-03 | Event memiliki status **Draft → Aktif → Selesai**. Hanya event **Aktif** yang menerima pembelian. Event Draft tidak dapat diakses publik. |
| BR-EVT-04 | Event hanya bisa di-publish bila minimal terisi: nama, tanggal/waktu, lokasi, ≥ 1 jenis tiket (harga & kuota valid), dan slug valid. *(Asumsi — perlu konfirmasi untuk daftar field wajib)* |
| BR-EVT-05 | Setiap jenis tiket wajib punya nama, harga, dan kuota > 0. *Asumsi — perlu konfirmasi:* harga minimum Rp 1 (tiket gratis Rp 0 tidak didukung di MVP karena alur QRIS). |
| BR-EVT-06 | *Asumsi — perlu konfirmasi:* slug **tidak dapat diubah** setelah event memiliki transaksi, agar link & QR yang sudah dibagikan tetap valid. |
| BR-EVT-07 | *Asumsi — perlu konfirmasi:* perubahan harga tiket hanya berlaku untuk transaksi baru; transaksi lama tetap memakai harga saat dibuat. Kuota tidak boleh diturunkan di bawah jumlah tiket yang sudah terjual/ditahan. Jenis tiket yang sudah punya transaksi tidak boleh dihapus (hanya bisa dinonaktifkan). |
| BR-EVT-08 | *Asumsi — perlu konfirmasi:* event otomatis berstatus **Selesai** setelah tanggal/waktu event lewat; penjualan ditutup, tetapi Scanner tetap bisa dipakai hingga akhir hari event. |

### Akses & Isolasi Data

| ID | Aturan |
|---|---|
| BR-ACC-01 | **Isolasi data penuh antar-client.** Admin hanya bisa melihat & mengubah data event yang di-assign kepadanya — baik lewat UI, API, maupun Scanner. |
| BR-ACC-02 | Akun Admin hanya dibuat lewat **invite oleh Owner**, terikat ke **satu event**. |
| BR-ACC-03 | Owner dapat melihat data seluruh event (oversight). *Asumsi — perlu konfirmasi:* Owner tidak dapat melihat kredensial QRIS client dalam bentuk utuh. |
| BR-ACC-04 | Customer tidak membuat akun. Data customer hanya terlihat oleh admin event terkait dan Owner. |
| BR-ACC-05 | *Asumsi — perlu konfirmasi:* undangan admin berlaku 7 hari; Owner dapat mengirim ulang atau mencabut undangan/akses. |

### Transaksi & Kuota

| ID | Aturan |
|---|---|
| BR-TRX-01 | **Satu transaksi boleh berisi lebih dari satu jenis tiket** (mis. 2 Reguler + 1 VIP). Total jumlah tiket minimal 1. |
| BR-TRX-02 | Data diri wajib: **nama** dan **no HP**. Tidak perlu akun. *Asumsi — perlu konfirmasi:* no HP format Indonesia (diawali `08` atau `+628`, 10–14 digit). |
| BR-TRX-03 | **Email** — overview menyebut QR Tiket "terkirim ke email" tetapi data diri hanya nama & no HP. *Asumsi — perlu konfirmasi:* ditambahkan field **email opsional**; jika diisi, QR Tiket dikirim ke email; jika tidak, QR Tiket tetap tampil di layar dan dapat diakses ulang via Cek Pesanan. Ini menjaga prinsip "cukup nama & no HP". |
| BR-TRX-04 | Total harga dihitung **di server** = Σ (harga jenis tiket × jumlah); nilai dari browser tidak dipercaya. |
| BR-TRX-05 | *Asumsi — perlu konfirmasi:* maksimal **10 tiket per transaksi** (gabungan semua jenis). |
| BR-TRX-06 | Kuota tersisa = kuota − tiket terjual − tiket yang sedang ditahan. Jumlah yang dipesan tidak boleh melebihi kuota tersisa per jenis; pengecekan dilakukan atomik saat transaksi dibuat. |
| BR-TRX-07 | *Asumsi — perlu konfirmasi:* transaksi **QRIS** menahan kuota sejak QR pembayaran dibuat sampai Lunas atau kedaluwarsa; jika kedaluwarsa, kuota dikembalikan. |
| BR-TRX-08 | *Asumsi — perlu konfirmasi:* transaksi **Cash** langsung mengurangi kuota sejak QR Tiket terbit (karena QR Tiket sudah diberikan di awal). Kuota baru kembali jika admin membatalkan transaksi (ADM-09). |
| BR-TRX-09 | Setiap transaksi punya **kode pesanan** unik yang tampil di Step 5, di email, dan di dashboard admin. |

### Pembayaran

| ID | Aturan |
|---|---|
| BR-PAY-01 | **Uncle tidak pernah memegang uang customer.** Pembayaran QRIS memakai akun QRIS milik client dan masuk langsung ke rekening client. |
| BR-PAY-02 | **Kredensial QRIS dipegang dan dikelola oleh client** (Admin) lewat menu Payment Settings. Disimpan terenkripsi, ditampilkan termasking, dan tidak bisa dibaca ulang utuh setelah disimpan. |
| BR-PAY-03 | **Status QRIS otomatis:** status "Lunas" hanya diubah oleh webhook payment gateway yang **lolos verifikasi signature**. *Asumsi — perlu konfirmasi:* admin tidak dapat menandai Lunas transaksi QRIS secara manual. |
| BR-PAY-04 | **Status Cash manual:** status "Lunas" hanya ditandai admin setelah menerima uang, saat scan di lokasi (checkbox "Sudah terima uang" + "Konfirmasi Lunas"). |
| BR-PAY-05 | Webhook diproses **idempotent**: notifikasi ganda untuk transaksi yang sama tidak mengubah apa pun setelah status Lunas tercatat. |
| BR-PAY-06 | Nominal QR pembayaran = total transaksi. Webhook dengan nominal berbeda dari total transaksi tidak menandai Lunas dan ditandai untuk ditinjau. *(Asumsi)* |
| BR-PAY-07 | *Asumsi — perlu konfirmasi:* batas waktu bayar QRIS **15 menit** (atau mengikuti batas maksimum provider), lalu status "Kedaluwarsa". Customer bisa memulai transaksi baru. |
| BR-PAY-08 | *Asumsi — perlu konfirmasi:* bila webhook "paid" tiba **setelah** transaksi kedaluwarsa: jika kuota masih tersedia → transaksi tetap ditandai Lunas & QR Tiket terbit; jika kuota sudah habis → transaksi ditandai "Perlu Refund" dan muncul di dashboard admin untuk diselesaikan client di luar sistem. |
| BR-PAY-09 | *Asumsi — perlu konfirmasi:* opsi QRIS hanya tampil di landing page bila kredensial QRIS client berstatus **Terhubung**. Cash selalu tersedia. |
| BR-PAY-10 | Biaya MDR/fee payment gateway mengikuti kontrak antara client dan provider; Uncle tidak menambahkan biaya di sisi customer. *(Asumsi — perlu konfirmasi)* |

### QR Tiket & Pengambilan

| ID | Aturan |
|---|---|
| BR-TKT-01 | **QR Tiket berbeda dari QR pembayaran.** QR Tiket berisi token acak yang tidak bisa ditebak, bukan data pribadi. |
| BR-TKT-02 | **QRIS:** QR Tiket terbit **setelah** status Lunas. **Cash:** QR Tiket terbit **langsung** setelah checkout, dengan status bayar "Belum". |
| BR-TKT-03 | **Satu QR Tiket per transaksi**, mewakili semua tiket di dalamnya (sesuai contoh scanner "2x Reguler"). *Asumsi — perlu konfirmasi:* semua tiket fisik dalam satu transaksi diambil sekaligus (tidak ada pengambilan sebagian). |
| BR-TKT-04 | Tombol **"Tandai Tiket Diambil" hanya aktif bila status bayar Lunas.** |
| BR-TKT-05 | Status "Diambil" bersifat final. Scan ulang QR yang sudah diambil menampilkan peringatan beserta waktu & admin yang menandai. *Asumsi — perlu konfirmasi:* pembatalan status Diambil tidak tersedia dari Scanner. |
| BR-TKT-06 | QR Tiket hanya valid untuk event-nya sendiri; scan di Scanner event lain ditolak tanpa menampilkan data transaksi. |

### Refund & Pembatalan *(seluruhnya Asumsi — perlu konfirmasi; overview hanya menyebut "Kebijakan Pengembalian" di landing page)*

| ID | Aturan |
|---|---|
| BR-RFD-01 | Karena Uncle tidak memegang uang (BR-PAY-01), **Uncle tidak memproses refund**. Refund QRIS dilakukan oleh client langsung (lewat dashboard provider/transfer manual) sesuai kebijakan pengembalian yang ditulis client. |
| BR-RFD-02 | Kebijakan pengembalian ditentukan per event oleh client dan ditampilkan di landing page sebelum pembelian. Default yang diusulkan: **tiket tidak dapat dikembalikan, kecuali event dibatalkan/ditunda oleh penyelenggara**. |
| BR-RFD-03 | Admin dapat menandai transaksi sebagai **Dibatalkan/Refund** (ADM-09) untuk pencatatan: QR Tiket menjadi tidak valid, kuota dikembalikan, dan transaksi tidak dihitung di revenue. |
| BR-RFD-04 | Transaksi Cash yang belum dibayar sampai event selesai tetap berstatus "Belum" dan tidak dihitung di revenue. |
| BR-RFD-05 | Jika event dibatalkan oleh penyelenggara, Owner menutup penjualan; komunikasi ke customer dilakukan oleh client memakai data kontak di dashboard. |

### Pelaporan

| ID | Aturan |
|---|---|
| BR-RPT-01 | *Asumsi — perlu konfirmasi:* **Revenue** = jumlah total transaksi berstatus Lunas (QRIS + Cash), nilai bruto sebelum fee gateway. Bersifat informasi; uang tidak lewat Uncle. |
| BR-RPT-02 | *Asumsi — perlu konfirmasi:* **Terjual** = jumlah tiket pada transaksi Lunas + transaksi Cash yang belum dibayar (karena QR Tiket sudah terbit & kuota terpakai). Transaksi QRIS pending/kedaluwarsa dan transaksi dibatalkan tidak dihitung. |

---

## Acceptance Criteria

> Format: **Given** (kondisi awal) · **When** (aksi) · **Then** (hasil yang diharapkan).
> Kode AC merujuk ke ID fitur di bagian Features.

### AC Owner Dashboard

#### OWN-01 Login Owner
- **AC-OWN-01.1 (sukses)** — **Given** akun Owner terdaftar · **When** Owner login dengan kredensial benar · **Then** Owner diarahkan ke halaman Ringkasan Semua Event.
- **AC-OWN-01.2 (gagal)** — **Given** akun Owner terdaftar · **When** Owner login dengan password salah · **Then** login ditolak dengan pesan umum "Email atau password salah" tanpa membocorkan field mana yang salah.
- **AC-OWN-01.3 (gagal — role salah)** — **Given** akun Admin aktif · **When** Admin mencoba membuka URL Owner Dashboard · **Then** akses ditolak dan tidak ada data lintas event yang tampil.

#### OWN-02 & OWN-03 Ringkasan & Daftar Event
- **AC-OWN-02.1 (sukses)** — **Given** ada 12 event dengan 5 berstatus Aktif · **When** Owner membuka dashboard · **Then** kartu menampilkan Total Event = 12, Event Aktif = 5, dan Tiket Terjual & Revenue sesuai BR-RPT-01/02.
- **AC-OWN-02.2 (data kosong)** — **Given** belum ada event · **When** Owner membuka dashboard · **Then** kartu menampilkan 0 dan daftar event menampilkan ajakan "Buat Event".
- **AC-OWN-03.1 (sukses)** — **Given** event Teater Bagol Aktif dengan 230 tiket terjual · **When** Owner melihat Daftar Event · **Then** baris "Teater Bagol | Aktif | 230 terjual" tampil, dan klik baris membuka halaman Edit Event.

#### OWN-04 s/d OWN-09 Buat, Edit & Publish Event
- **AC-OWN-04.1 (sukses — simpan draft)** — **Given** Owner di form Buat Event · **When** Owner mengisi nama event lalu klik Simpan · **Then** event tersimpan berstatus Draft dan belum bisa diakses publik.
- **AC-OWN-05.1 (sukses — upload)** — **Given** Owner di tab Info Umum · **When** Owner mengunggah foto/video dengan format & ukuran yang didukung · **Then** file tampil di pratinjau galeri.
- **AC-OWN-05.2 (gagal — file tidak valid)** — **Given** Owner di tab Info Umum · **When** Owner mengunggah file dengan format tidak didukung atau melebihi batas ukuran *(batas ukuran: Asumsi — perlu konfirmasi)* · **Then** upload ditolak dengan pesan yang menyebutkan format/ukuran yang diizinkan.
- **AC-OWN-06.1 (sukses)** — **Given** Owner di tab Branding · **When** Owner mengunggah logo dan memilih warna Primary & Secondary lalu menyimpan · **Then** landing page memakai logo dan warna tersebut.
- **AC-OWN-07.1 (sukses — multi kategori)** — **Given** Owner di tab Jenis Tiket · **When** Owner menambahkan "Reguler Rp 75.000 kuota 150" dan "VIP Rp 150.000 kuota 50" · **Then** kedua jenis tersimpan dan tampil di landing page.
- **AC-OWN-07.2 (gagal — data tidak valid)** — **Given** Owner di tab Jenis Tiket · **When** Owner menyimpan jenis tiket dengan harga kosong/≤ 0 atau kuota ≤ 0 · **Then** penyimpanan ditolak dengan pesan pada field terkait.
- **AC-OWN-07.3 (gagal — kuota di bawah terjual)** — **Given** jenis Reguler sudah terjual 120 · **When** Owner mengubah kuota Reguler menjadi 100 · **Then** perubahan ditolak dengan pesan "Kuota tidak boleh lebih kecil dari tiket terjual (120)".
- **AC-OWN-08.1 (sukses)** — **Given** slug `teaterbagol` belum dipakai · **When** Owner mengisi slug `teaterbagol` · **Then** preview menampilkan `teaterbagol.uncle.id` dengan tanda tersedia.
- **AC-OWN-08.2 (gagal — slug dipakai)** — **Given** slug `teaterbagol` sudah dipakai event lain · **When** Owner menyimpan slug yang sama · **Then** penyimpanan ditolak dengan pesan "Subdomain sudah digunakan".
- **AC-OWN-08.3 (gagal — format)** — **Given** Owner di tab Subdomain · **When** Owner mengisi slug `Teater Bagol!` atau kata cadangan `admin` · **Then** penyimpanan ditolak dengan pesan aturan format (BR-EVT-02).
- **AC-OWN-09.1 (sukses — publish)** — **Given** event Draft dengan semua field wajib lengkap (BR-EVT-04) · **When** Owner klik "Simpan & Publish" · **Then** status menjadi Aktif dan `teaterbagol.uncle.id` langsung menampilkan landing page.
- **AC-OWN-09.2 (gagal — data belum lengkap)** — **Given** event Draft tanpa jenis tiket · **When** Owner klik "Simpan & Publish" · **Then** publish ditolak dan sistem menunjukkan tab/field yang belum lengkap.
- **AC-OWN-09.3 (edit setelah publish)** — **Given** event Aktif · **When** Owner mengubah deskripsi lalu menyimpan · **Then** perubahan langsung tampil di landing page tanpa mengubah transaksi yang ada.

#### OWN-10 Invite Admin
- **AC-OWN-10.1 (sukses)** — **Given** event Teater Bagol tersimpan · **When** Owner mengisi email & nama lalu klik "Invite Admin" · **Then** email undangan terkirim dan status "sudah diinvite" tampil di tab Akses Admin.
- **AC-OWN-10.2 (gagal — email tidak valid)** — **Given** Owner di tab Akses Admin · **When** Owner mengisi email dengan format salah · **Then** undangan tidak terkirim dan muncul pesan validasi.
- **AC-OWN-10.3 (gagal — duplikat)** — **Given** email sudah diundang ke event yang sama · **When** Owner mengundang email itu lagi · **Then** sistem menolak dan menawarkan "Kirim ulang undangan".

### AC Admin Dashboard

#### ADM-01 & ADM-02 Aktivasi, Login & Scoping
- **AC-ADM-01.1 (sukses)** — **Given** admin menerima undangan yang masih berlaku · **When** admin membuka link dan mengatur password · **Then** akun aktif dan admin masuk ke Admin Dashboard event Teater Bagol.
- **AC-ADM-01.2 (gagal — undangan kedaluwarsa)** — **Given** undangan sudah lewat masa berlaku (BR-ACC-05) · **When** admin membuka link · **Then** sistem menampilkan "Undangan kedaluwarsa, hubungi Owner" dan akun tidak dibuat.
- **AC-ADM-02.1 (sukses)** — **Given** admin Teater Bagol login · **When** membuka menu Transaksi · **Then** hanya transaksi Teater Bagol yang tampil.
- **AC-ADM-02.2 (gagal — akses event lain)** — **Given** admin Teater Bagol login · **When** admin mengakses URL/API transaksi milik event Konser X (mis. dengan mengganti ID di URL) · **Then** sistem menolak (tidak ditemukan/terlarang) dan tidak mengembalikan data apa pun dari Konser X.

#### ADM-03 Ringkasan
- **AC-ADM-03.1 (sukses)** — **Given** event memiliki 230 tiket terjual, 210 lunas, 20 belum bayar, 180 diambil · **When** admin membuka dashboard · **Then** kartu menampilkan Terjual 230, Lunas 210, Belum 20, Diambil 180.
- **AC-ADM-03.2 (real-time)** — **Given** admin membuka dashboard · **When** webhook QRIS menandai satu transaksi Lunas · **Then** angka Lunas bertambah setelah halaman dimuat ulang atau otomatis tanpa reload *(mekanisme refresh: Asumsi — perlu konfirmasi)*.

#### ADM-04 & ADM-05 Daftar, Filter & Cari Transaksi
- **AC-ADM-04.1 (sukses)** — **Given** ada transaksi Budi S. (2 Reguler, QRIS, Lunas, Belum diambil) · **When** admin membuka Daftar Transaksi · **Then** baris menampilkan nama, no HP, "2 Reguler", "QRIS", "Lunas", "Belum".
- **AC-ADM-04.2 (multi jenis)** — **Given** transaksi berisi 2 Reguler + 1 VIP · **When** admin melihat baris tersebut · **Then** kolom Tiket menampilkan kedua jenis beserta jumlahnya.
- **AC-ADM-05.1 (filter)** — **Given** ada transaksi dengan beragam status · **When** admin memfilter "Status bayar: Belum" · **Then** hanya transaksi belum bayar yang tampil, dan jumlah hasil ditampilkan.
- **AC-ADM-05.2 (cari)** — **Given** ada transaksi atas nama "Siti R." · **When** admin mencari "siti" atau sebagian no HP · **Then** transaksi Siti R. tampil.
- **AC-ADM-05.3 (tidak ada hasil)** — **Given** admin mencari nama yang tidak ada · **When** pencarian dijalankan · **Then** tampil pesan "Tidak ada transaksi yang cocok".

#### ADM-07 Payment Settings (QRIS)
- **AC-ADM-07.1 (sukses)** — **Given** admin di menu Payment Settings · **When** admin memilih provider Tripay, mengisi API Key & Private Key yang valid, lalu Simpan · **Then** sistem menguji koneksi, menampilkan "✅ Terhubung", dan opsi QRIS muncul di landing page.
- **AC-ADM-07.2 (gagal — kredensial salah)** — **Given** admin di Payment Settings · **When** admin menyimpan kredensial yang ditolak provider · **Then** status menampilkan "Gagal terhubung" beserta alasan dari provider bila ada, dan opsi QRIS tidak tampil di landing page.
- **AC-ADM-07.3 (gagal — field kosong)** — **Given** admin di Payment Settings · **When** admin klik Simpan dengan API Key atau Private Key kosong · **Then** penyimpanan ditolak dengan pesan validasi.
- **AC-ADM-07.4 (keamanan)** — **Given** kredensial sudah tersimpan · **When** admin atau Owner membuka kembali Payment Settings · **Then** kredensial hanya tampil termasking dan tidak bisa disalin utuh.
- **AC-ADM-07.5 (belum diatur)** — **Given** admin belum mengatur QRIS · **When** customer membuka landing page · **Then** hanya metode Cash yang tersedia (BR-PAY-09).

### AC Landing Page

#### LP-01, LP-02 & LP-16 Akses Landing Page
- **AC-LP-01.1 (sukses)** — **Given** event Teater Bagol berstatus Aktif · **When** customer membuka `teaterbagol.uncle.id` · **Then** landing page tampil dengan logo, warna tema, banner, nama event, tanggal & jam, lokasi, dan tombol "Pilih Tiket".
- **AC-LP-01.2 (gagal — slug tidak ada)** — **Given** tidak ada event dengan slug `xyz` · **When** customer membuka `xyz.uncle.id` · **Then** tampil halaman "Event tidak ditemukan".
- **AC-LP-01.3 (gagal — Draft)** — **Given** event berstatus Draft · **When** customer membuka subdomain-nya · **Then** konten event tidak tampil (sama seperti tidak ditemukan).
- **AC-LP-16.1 (event selesai)** — **Given** event berstatus Selesai · **When** customer membuka landing page · **Then** info event tetap tampil, tombol "Pilih Tiket" nonaktif dengan label "Penjualan ditutup".

#### LP-06 Pilih Tiket
- **AC-LP-06.1 (sukses — campur jenis)** — **Given** Reguler sisa 120 dan VIP sisa 40 · **When** customer memilih 2 Reguler + 1 VIP · **Then** subtotal tampil Rp 300.000 dan tombol "Lanjut Isi Data Diri" aktif.
- **AC-LP-06.2 (gagal — belum pilih)** — **Given** semua stepper bernilai 0 · **When** customer melihat tombol lanjut · **Then** tombol "Lanjut Isi Data Diri" nonaktif.
- **AC-LP-06.3 (gagal — melebihi kuota)** — **Given** VIP sisa 3 · **When** customer menekan [+] VIP hingga 4 · **Then** stepper berhenti di 3 dan muncul info "Sisa kuota VIP: 3".
- **AC-LP-06.4 (gagal — kuota habis)** — **Given** VIP sisa 0 · **When** customer melihat section Tiket · **Then** VIP berlabel "Habis" dan stepper nonaktif; jenis lain tetap bisa dipilih.
- **AC-LP-06.5 (gagal — semua habis)** — **Given** semua jenis tiket sisa 0 · **When** customer membuka landing page · **Then** tombol "Pilih Tiket" berlabel "Tiket Habis" dan tidak bisa diklik.
- **AC-LP-06.6 (gagal — rebutan kuota)** — **Given** VIP sisa 1 dan dua customer sama-sama memilih 1 VIP · **When** keduanya mengirim checkout hampir bersamaan · **Then** hanya satu transaksi berhasil; yang lain menerima pesan "Kuota VIP tidak mencukupi, silakan ubah pilihan" dan tidak ada overselling.
- **AC-LP-06.7 (gagal — batas per transaksi)** — **Given** batas 10 tiket per transaksi (BR-TRX-05) · **When** customer mencoba memilih total 11 tiket · **Then** sistem mencegah dan menampilkan batas maksimum.

#### LP-07 Data Diri
- **AC-LP-07.1 (sukses)** — **Given** customer sudah memilih tiket · **When** mengisi nama "Budi Santoso" dan no HP "081234567890" · **Then** customer bisa lanjut ke Metode Pembayaran.
- **AC-LP-07.2 (gagal — tidak lengkap)** — **Given** customer di Step Data Diri · **When** nama atau no HP dikosongkan lalu klik lanjut · **Then** proses tertahan dan field kosong ditandai "Wajib diisi".
- **AC-LP-07.3 (gagal — no HP tidak valid)** — **Given** customer di Step Data Diri · **When** mengisi no HP "12345" · **Then** muncul pesan "Format no HP tidak valid" (BR-TRX-02).
- **AC-LP-07.4 (email tidak valid — Asumsi)** — **Given** field email opsional tersedia (BR-TRX-03) · **When** customer mengisi email dengan format salah · **Then** muncul pesan validasi; jika dikosongkan, customer tetap bisa lanjut.

#### LP-08 & LP-09 Metode Pembayaran & QRIS
- **AC-LP-09.1 (sukses — QRIS)** — **Given** QRIS client Terhubung dan customer memilih QRIS dengan total Rp 300.000 · **When** klik "Bayar Sekarang" · **Then** QR pembayaran bernominal Rp 300.000 tampil beserta countdown batas waktu, dan kuota ditahan (BR-TRX-07).
- **AC-LP-09.2 (sukses — auto-update)** — **Given** QR pembayaran tampil · **When** customer membayar via e-wallet/m-banking dan webhook valid diterima · **Then** status berubah Lunas tanpa aksi manual, halaman otomatis lanjut ke Step 5 Tiket Siap.
- **AC-LP-09.3 (gagal — kedaluwarsa)** — **Given** QR pembayaran tampil · **When** batas waktu habis tanpa pembayaran · **Then** status menjadi "Kedaluwarsa", QR pembayaran disembunyikan, kuota dikembalikan, QR Tiket tidak terbit, dan tampil tombol "Pesan Ulang".
- **AC-LP-09.4 (gagal — signature tidak valid)** — **Given** transaksi QRIS menunggu pembayaran · **When** sistem menerima webhook dengan signature tidak valid · **Then** webhook ditolak, status tidak berubah, dan kejadian dicatat di log.
- **AC-LP-09.5 (webhook ganda)** — **Given** transaksi sudah Lunas · **When** webhook "paid" yang sama diterima lagi · **Then** status tetap Lunas, tidak ada QR Tiket/email ganda (BR-PAY-05).
- **AC-LP-09.6 (webhook terlambat — Asumsi)** — **Given** transaksi sudah Kedaluwarsa · **When** webhook "paid" valid diterima · **Then** sistem mengikuti BR-PAY-08 (Lunas bila kuota tersedia, atau "Perlu Refund" bila kuota habis).
- **AC-LP-09.7 (gagal — gateway error)** — **Given** customer memilih QRIS · **When** payment gateway gagal membuat QR (timeout/error) · **Then** customer melihat pesan "Pembayaran QRIS sedang bermasalah, coba lagi atau pilih Cash", kuota tidak tertahan, dan tidak ada transaksi Lunas tercatat.
- **AC-LP-08.1 (sukses — Cash)** — **Given** customer memilih Cash · **When** klik "Bayar Sekarang" · **Then** Step 4 dilewati, transaksi tercatat dengan status bayar "Belum", kuota berkurang (BR-TRX-08), dan customer langsung ke Step 5.

#### LP-10 Tiket Siap & Email
- **AC-LP-10.1 (sukses)** — **Given** transaksi QRIS Lunas atau transaksi Cash dibuat · **When** Step 5 tampil · **Then** QR Tiket (berbeda dari QR pembayaran), kode pesanan, ringkasan tiket, dan instruksi "Tunjukkan QR ini saat pengambilan tiket di lokasi" tampil.
- **AC-LP-10.2 (sukses — email)** — **Given** customer mengisi email · **When** QR Tiket terbit · **Then** email berisi QR Tiket, kode pesanan, ringkasan pesanan & info event terkirim, dan layar menampilkan "✅ Juga sudah dikirim ke email kamu".
- **AC-LP-10.3 (gagal — email gagal)** — **Given** pengiriman email gagal (bounce/error) · **When** QR Tiket terbit · **Then** QR Tiket tetap tampil di layar, transaksi tetap valid, kegagalan dicatat, dan layar tidak menampilkan klaim "sudah dikirim ke email".
- **AC-LP-10.4 (gagal — QRIS belum lunas)** — **Given** transaksi QRIS belum Lunas · **When** customer mencoba membuka halaman Tiket Siap secara langsung · **Then** QR Tiket tidak ditampilkan.

#### LP-11 Cek Pesanan *(mekanisme Asumsi — perlu konfirmasi)*
- **AC-LP-11.1 (sukses)** — **Given** customer punya kode pesanan · **When** mengisi kode pesanan + no HP yang cocok di "Cek Pesanan" · **Then** detail pesanan, status bayar, dan QR Tiket (jika sudah terbit) tampil.
- **AC-LP-11.2 (gagal)** — **Given** kombinasi kode pesanan + no HP tidak cocok · **When** customer mengirim form · **Then** tampil pesan "Pesanan tidak ditemukan" tanpa membocorkan apakah kode atau no HP yang salah.
- **AC-LP-11.3 (gagal — beda event)** — **Given** kode pesanan milik event lain · **When** dicek di landing page Teater Bagol · **Then** tampil "Pesanan tidak ditemukan".

#### LP-12 & LP-13 Share & Lokasi
- **AC-LP-12.1 (sukses)** — **Given** customer di landing page · **When** klik "WhatsApp" · **Then** WhatsApp terbuka dengan pesan berisi link `teaterbagol.uncle.id`; **When** klik "Salin Link" **Then** link tersalin dan muncul notifikasi "Link disalin".
- **AC-LP-13.1 (sukses)** — **Given** event punya alamat lokasi · **When** customer klik "Petunjuk Arah" · **Then** Google Maps terbuka dengan tujuan venue; klik "Salin Alamat" menyalin alamat lengkap.

### AC Scanner

#### SCN-01 Akses Scanner
- **AC-SCN-01.1 (sukses)** — **Given** admin login di HP · **When** membuka menu "Scan Tiket" dan mengizinkan kamera · **Then** kamera aktif dengan header nama event.
- **AC-SCN-01.2 (gagal — izin kamera ditolak)** — **Given** admin membuka Scan Tiket · **When** izin kamera ditolak/tidak tersedia · **Then** muncul instruksi mengaktifkan izin kamera dan opsi input kode manual (SCN-06).
- **AC-SCN-01.3 (gagal — belum login)** — **Given** pengguna tidak login · **When** membuka URL Scanner · **Then** diarahkan ke halaman login.

#### SCN-02 & SCN-03 Scan QRIS Lunas → Diambil
- **AC-SCN-02.1 (sukses)** — **Given** transaksi Budi S. (2 Reguler, QRIS, Lunas, belum diambil) · **When** admin scan QR Tiket Budi · **Then** tampil Nama: Budi S., Tiket: 2x Reguler, Metode: QRIS, Bayar: ✅ Lunas, dan tombol "Tandai Tiket Diambil" aktif.
- **AC-SCN-03.1 (sukses)** — **Given** hasil scan Budi tampil dengan status Lunas · **When** admin klik "Tandai Tiket Diambil" · **Then** status ambil menjadi "Diambil" dengan waktu & nama admin tercatat, dan Ringkasan "Diambil" di dashboard bertambah.

#### SCN-04 Cash
- **AC-SCN-04.1 (sukses)** — **Given** transaksi Siti R. (1 VIP, Cash, Belum bayar) · **When** admin scan QR Tiket Siti · **Then** tampil Bayar: ❌ Belum, checkbox "Sudah terima uang", tombol "Konfirmasi Lunas", dan tombol "Tandai Diambil" nonaktif.
- **AC-SCN-04.2 (sukses — lunas lalu diambil)** — **Given** hasil scan Siti tampil · **When** admin mencentang "Sudah terima uang", klik "Konfirmasi Lunas", lalu klik "Tandai Diambil" · **Then** status bayar menjadi Lunas, lalu status ambil menjadi Diambil, keduanya tercatat dengan waktu & admin.
- **AC-SCN-04.3 (gagal — belum dicentang)** — **Given** hasil scan Siti tampil · **When** admin belum mencentang "Sudah terima uang" · **Then** tombol "Konfirmasi Lunas" nonaktif.
- **AC-SCN-04.4 (gagal — QRIS tidak bisa manual)** — **Given** transaksi metode QRIS · **When** admin scan · **Then** tidak ada opsi "Konfirmasi Lunas" manual (BR-PAY-03).

#### SCN-05 Validasi Scan
- **AC-SCN-05.1 (gagal — sudah diambil)** — **Given** tiket Budi sudah berstatus Diambil · **When** QR Budi discan lagi · **Then** tampil peringatan "Tiket sudah diambil pada [waktu] oleh [admin]" dan tidak ada tombol aksi.
- **AC-SCN-05.2 (gagal — event lain)** — **Given** admin Teater Bagol membuka Scanner · **When** memindai QR Tiket milik Konser X · **Then** tampil "QR tidak berlaku untuk event ini" tanpa menampilkan data transaksi.
- **AC-SCN-05.3 (gagal — QR tidak valid)** — **Given** Scanner aktif · **When** admin memindai QR yang bukan QR Tiket Uncle (mis. QR pembayaran atau QR acak) · **Then** tampil "QR tidak dikenali".
- **AC-SCN-05.4 (gagal — transaksi dibatalkan)** — **Given** transaksi berstatus Dibatalkan/Refund · **When** QR-nya discan · **Then** tampil "Transaksi dibatalkan" dan tidak ada tombol aksi.
- **AC-SCN-05.5 (gagal — koneksi putus)** — **Given** HP admin kehilangan koneksi · **When** QR discan atau tombol aksi ditekan · **Then** tampil pesan "Tidak ada koneksi, coba lagi" dan status tidak dianggap tersimpan sampai server mengonfirmasi.

#### SCN-07 Scan Bersamaan
- **AC-SCN-07.1 (gagal — pengambilan ganda)** — **Given** dua admin memindai QR Budi di dua HP hampir bersamaan · **When** keduanya klik "Tandai Tiket Diambil" · **Then** hanya satu yang berhasil; admin kedua menerima peringatan "Tiket sudah diambil".

### AC Lintas Area

- **AC-PLT-02.1 (enkripsi kredensial)** — **Given** admin menyimpan kredensial QRIS · **When** data diperiksa di penyimpanan · **Then** kredensial tersimpan terenkripsi, tidak tampil di log aplikasi, dan tidak dikirim ke browser setelah disimpan.
- **AC-PLT-04.1 (no overselling)** — **Given** kuota sebuah jenis tiket = N · **When** ada banyak checkout bersamaan · **Then** total tiket terjual + ditahan untuk jenis itu tidak pernah melebihi N.

---

## Pertanyaan Terbuka

> Bagian ini memuat hal yang belum diputuskan di `uncle-overview.md`. Item yang
> sudah diberi usulan ditandai "Asumsi — perlu konfirmasi" di bagian terkait.

| # | Topik | Pertanyaan | Terkait |
|---|---|---|---|
| Q1 | Email customer | Data diri hanya nama & no HP, tapi QR Tiket "terkirim ke email". Apakah email ditambahkan sebagai field **opsional** (usulan), wajib, atau pengiriman dialihkan ke WhatsApp/SMS? | BR-TRX-03, LP-07, PLT-03 |
| Q2 | Refund | Apa kebijakan pengembalian default, dan apakah perlu status Dibatalkan/Refund di sistem? Siapa yang menulis teks kebijakan per event? | BR-RFD-*, ADM-09 |
| Q3 | Kuota Cash | Transaksi Cash langsung memakai kuota walau belum dibayar → rawan pesanan fiktif. Perlu batas per no HP, masa berlaku reservasi Cash, atau kemampuan admin membatalkan? | BR-TRX-08 |
| Q4 | Batas waktu QRIS | Berapa lama QR pembayaran berlaku (usulan 15 menit)? Bagaimana menangani pembayaran yang masuk setelah kedaluwarsa? | BR-PAY-07, BR-PAY-08 |
| Q5 | Metode bayar per event | Bisakah client menonaktifkan Cash atau QRIS untuk event tertentu? Apa yang tampil bila QRIS belum diatur? | BR-PAY-09 |
| Q6 | Admin multi-event | Admin Dashboard "scoped ke 1 event". Jika satu client punya beberapa event, apakah perlu akun terpisah per event atau satu akun dengan pemilih event? Bolehkah satu event punya lebih dari satu admin? | BR-ACC-02 |
| Q7 | Kredensial QRIS | Payment Settings ada di Admin; tapi alurnya "(Opsional)". Apakah Owner boleh membantu mengisi kredensial atas nama client? Provider apa saja yang didukung di MVP selain Tripay? Kredensial berlaku per event atau per client? | ADM-07, BR-PAY-02 |
| Q8 | Cek Pesanan | Mekanisme verifikasi Cek Pesanan: kode pesanan + no HP (usulan), atau OTP ke no HP? | LP-11 |
| Q9 | Pengambilan sebagian | Untuk transaksi multi tiket, apakah boleh mengambil tiket fisik sebagian (mis. 1 dari 3)? | BR-TKT-03 |
| Q10 | Koreksi kesalahan admin | Jika admin salah menandai Lunas/Diambil, siapa yang boleh membatalkannya (Owner saja?) dan bagaimana dicatat? | BR-TKT-05, PLT-05 |
| Q11 | Definisi metrik | Apakah "Revenue" dan "Tiket Terjual" menghitung transaksi Cash yang belum dibayar? Bruto atau neto fee? | BR-RPT-01/02 |
| Q12 | Model bisnis Uncle | Bagaimana Uncle menagih client (biaya sewa flat, per tiket, per event)? Apakah perlu ditampilkan/dicatat di Owner Dashboard? | Product Goal |
| Q13 | Fee gateway | Siapa menanggung fee QRIS — client atau dibebankan ke customer? | BR-PAY-10 |
| Q14 | Template landing page | Apakah MVP hanya punya satu template, atau Owner bisa memilih beberapa template? | OWN-04 |
| Q15 | Field konten landing | Kategori, tipe event, kontak penyelenggara, syarat & kebijakan, kebijakan pengembalian muncul di landing page tapi tidak ada di form Owner. Siapa yang mengisi, dan di tab mana? | OWN-11 |
| Q16 | Tiket gratis | Apakah event gratis (harga Rp 0) perlu didukung? | BR-EVT-05 |
| Q17 | Batas upload & domain kustom | Batas ukuran/format foto & video? Apakah client bisa memakai domain sendiri (bukan `*.uncle.id`) di masa depan? | OWN-05, LP-01 |
| Q18 | Data pribadi | Berapa lama data customer (nama, no HP, email) disimpan setelah event selesai, dan apakah perlu persetujuan privasi di checkout (UU PDP)? | BR-ACC-04 |
