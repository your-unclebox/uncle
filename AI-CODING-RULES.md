# AI Coding Rules — Uncle (Platform Ticketing Event White-Label)

> **Untuk siapa:** AI coding assistant (mis. Claude Code) dan developer manusia
> yang menulis kode Uncle. Dokumen ini adalah instruksi kerja, bukan bacaan
> opsional.
>
> **Sumber kebenaran (urutan prioritas bila bertentangan):**
> `uncle-overview.md` → `PRD.md` (v1.4) → `UI-UX.md` (v1.4) → `DRD.md` (v1.5,
> acuan final tech stack & arsitektur) → dokumen ini. Dokumen ini **tidak
> boleh** dipakai untuk membatalkan keputusan di empat dokumen tersebut.
>
> **Label:**
> - **[WAJIB]** — non-negotiable. Pelanggaran = pekerjaan ditolak, apa pun
>   alasannya.
> - **[REKOMENDASI]** — default yang diikuti, kecuali ada alasan kuat yang
>   ditulis di laporan.
> - **[KONFIRMASI]** — keputusan di dokumen ini yang belum ada di dokumen
>   sumber; berlaku sementara, tetapi wajib dikonfirmasi pemilik project.
>
> **Status:** v1.0 · **Tanggal:** 7 Oktober 2026

---

## Coding Conventions

### 1. Aturan proses (berlaku untuk setiap task)

1. **[WAJIB] Kerjakan hanya yang diminta.** Scope task = apa yang tertulis di
   prompt/task + acceptance criteria PRD yang dirujuk. Jangan "sekalian"
   merapikan, me-refactor, atau menambah fitur di luar itu.
2. **[WAJIB] Tandai semua keputusan/asumsi di luar permintaan.** Setiap kali
   membuat keputusan atau asumsi yang **tidak diminta secara langsung** dalam
   task/prompt — termasuk mengubah nilai default, menambah field/kolom/endpoint,
   mengubah logika yang sudah ditetapkan di dokumen manapun, memilih library di
   antara opsi, atau mengisi detail yang tidak disebut dokumen — tulis di
   laporan/ringkasan akhir dengan label persis:
   > **Di luar permintaan — perlu dikonfirmasi:** _<apa yang diputuskan>_ —
   > _<alasan>_ — _<file/baris terdampak>_

   Tidak ada keputusan yang boleh diterapkan diam-diam. Jika ragu apakah
   sesuatu termasuk "di luar permintaan", anggap **termasuk**.
3. **[WAJIB] Keputusan final tidak boleh diubah sepihak.** Keputusan yang sudah
   difinalkan di `uncle-overview.md`, `PRD.md`, `UI-UX.md`, atau `DRD.md`
   (mis. email wajib, batas reservasi Cash default = jam selesai event, 3
   kredensial Tripay, stack D5, state machine order, format QR Tiket) **hanya
   boleh diusulkan**, tidak boleh diubah — baik di kode maupun di dokumen.
   Jika implementasi tidak mungkin tanpa mengubahnya, **berhenti**, jelaskan
   konfliknya, dan ajukan usulan. Jangan menulis kode yang menyimpang.
4. **[WAJIB] Item "Asumsi — perlu konfirmasi" / "Rekomendasi" di dokumen
   sumber** boleh diimplementasikan sesuai isi dokumen, tetapi rujuk ID-nya
   (mis. `BR-TRX-05`) di kode/PR dan sebutkan di laporan bahwa fitur bergantung
   pada asumsi yang belum final.
5. **[WAJIB] Jangan mengarang requirement.** Jika AC, BR, atau kontrak API yang
   dibutuhkan tidak ada di dokumen, tanyakan atau tandai sebagai
   [KONFIRMASI] — jangan menebak nilai bisnis (harga, durasi, batas, teks copy).
6. **[WAJIB] Laporan akhir setiap task** berisi: (a) ID requirement yang
   dikerjakan, (b) file yang diubah, (c) test yang ditambahkan & hasilnya,
   (d) daftar "Di luar permintaan — perlu dikonfirmasi" (tulis "Tidak ada" bila
   kosong), (e) hal yang belum selesai/diketahui bermasalah. Laporkan hasil test
   apa adanya; jangan klaim lulus bila tidak dijalankan.

### 2. Aturan bisnis yang tidak boleh dilanggar kode

Ringkasan invariant dari dokumen sumber. Kode yang melanggar salah satu ini
dianggap bug kritis.

| # | Invariant | Sumber |
|---|---|---|
| I-1 | **[WAJIB]** Semua data tenant di-scope `event_id`. Tenant publik dari **Host header** (`{slug}.uncle.id`), tenant admin dari **path** `/admin/events/{eventId}`. **Tidak pernah** dari body/query. | DRD Architecture §3, BR-ACC-01 |
| I-2 | **[WAJIB]** Akses resource tenant lain → **404** (bukan 403), tanpa data apa pun di respons/log klien. | DRD API §1 |
| I-3 | **[WAJIB]** Harga & total dihitung **di server** dari `ticket_types.price`; nilai harga dari klien diabaikan. Uang = `bigint` Rupiah utuh, tanpa float. | BR-TRX-04, DRD §Database 1 |
| I-4 | **[WAJIB]** Kuota tidak pernah oversell: alokasi dalam satu transaksi DB, `SELECT … FOR UPDATE` urut `id`, sweep-on-write, UPDATE bersyarat, plus `CHECK (allocated_count BETWEEN 0 AND quota)`. | BR-TRX-06, DRD §5.1 |
| I-5 | **[WAJIB]** Cash = `RESERVED` dengan `expires_at` dihitung dari `cash_reservation_mode` (default `UNTIL_EVENT_END` = `events.ends_at`). Lewat batas → `EXPIRED`, kuota dilepas, ticket `VOID`. Jangan memakai H-1 atau default lain. | BR-TRX-08, DRD §5.2 |
| I-6 | **[WAJIB]** Status `PAID` untuk QRIS **hanya** dari webhook yang lolos verifikasi signature atau rekonsiliasi API gateway. Admin tidak bisa menandai Lunas QRIS. | BR-PAY-03 |
| I-7 | **[WAJIB]** Webhook idempoten (`webhook_events.dedupe_key UNIQUE` + transisi bersyarat). Nominal ≠ `total_amount` → `needs_review`, bukan `PAID`. | BR-PAY-05/06, DRD Integrations §1.4 |
| I-8 | **[WAJIB]** Transisi status order **hanya** lewat fungsi state machine di modul `ordering` (satu tempat). Dilarang `UPDATE orders SET status = …` di tempat lain. | DRD §4.1 |
| I-9 | **[WAJIB]** Check-in atomik: `UPDATE tickets … WHERE status='ISSUED' AND order PAID`; 0 baris → `409 ALREADY_CHECKED_IN`. | BR-TKT-04/05, DRD Security §6 |
| I-10 | **[WAJIB]** Reissue dari reservasi kedaluwarsa: hanya order `CASH` + `EXPIRED`, semua item harus muat (semua-atau-tidak), maksimal sekali (`reissued_from_order_id` partial UNIQUE), order baru langsung `PAID`, QR lama tetap `VOID`. Pakai ulang fungsi alokasi kuota yang sama dengan create order — jangan menulis ulang. | BR-TKT-07, DRD §5.2a |
| I-11 | **[WAJIB]** Email customer wajib, hanya untuk mengirim QR Tiket — **tidak pernah** dipakai untuk login/akun customer. | BR-TRX-03 |
| I-12 | **[WAJIB]** QR Tiket ≠ QR pembayaran. Payload `U1.{ticketId}.{qrVersion}.{mac}` dengan HMAC; tanpa PII. | BR-TKT-01, DRD Security §6 |
| I-13 | **[WAJIB]** Uncle tidak memegang uang & tidak memproses refund finansial; refund hanya penandaan status. | BR-PAY-01, BR-RFD-01 |

### 3. TypeScript

- **[WAJIB]** `tsconfig`: `"strict": true`, `"noUncheckedIndexedAccess": true`,
  `"noImplicitOverride": true`, `"exactOptionalPropertyTypes": true`.
- **[WAJIB]** Dilarang `any`. Untuk data tak dikenal pakai `unknown` lalu
  validasi dengan Zod. `// @ts-ignore` dilarang; `// @ts-expect-error` hanya
  dengan komentar alasan.
- **[WAJIB]** Semua input dari luar (request body, query, params, webhook,
  respons API pihak ketiga, env var) divalidasi dengan **Zod** di batas sistem.
  Tipe diturunkan dari schema (`z.infer`), bukan ditulis ulang manual.
- **[WAJIB]** Schema Zod memakai `.strict()` untuk request body (tolak field
  tak dikenal).
- **[WAJIB]** `async/await`; tidak memakai `.then()` berantai. Setiap promise
  di-`await` atau sengaja di-`void` dengan komentar alasan.
- **[WAJIB]** Enum status memakai union string literal yang sama persis dengan
  enum DB (`'PENDING_PAYMENT' | 'RESERVED' | …`), di-generate/diambil dari
  schema Drizzle — bukan didefinisikan ulang.
- **[REKOMENDASI]** Fungsi murni untuk logika bisnis (hitung total, hitung
  `expires_at`, validasi transisi status) dipisah dari I/O agar mudah di-unit
  test.
- **[REKOMENDASI]** Gunakan `readonly` dan return type eksplisit pada fungsi
  yang diekspor dari modul server.

### 4. React / Next.js (App Router)

- **[WAJIB]** Hanya **function component** + hooks. Tidak ada class component.
- **[WAJIB]** Default **Server Component**; tambahkan `'use client'` hanya
  untuk komponen yang butuh state/efek/browser API (stepper tiket, form,
  scanner kamera, countdown).
- **[WAJIB]** Kode yang menyentuh DB, secret, kredensial QRIS, atau service role
  key **hanya** di file server (`import 'server-only'`). Tidak pernah diimpor
  ke Client Component.
- **[WAJIB]** Mutasi data lewat **Route Handler** di `src/app/api/**` sesuai
  kontrak di DRD API. Server Actions **tidak dipakai** untuk mutasi agar
  kontrak API, rate limit, dan test tetap di satu tempat. **[KONFIRMASI]**
- **[WAJIB]** Semua teks UI berbahasa Indonesia dan mengikuti microcopy di
  `UI-UX.md` §States 5. Status selalu **warna + ikon + teks**. Warna status
  memakai token tetap yang tidak bisa di-override client.
- **[WAJIB]** Setiap layar/komponen data menangani 4 state UI-UX.md:
  loading (skeleton), empty, error, success.
- **[WAJIB]** Tombol aksi yang memicu mutasi dikunci saat request berjalan
  (cegah klik ganda) dan mengirim `Idempotency-Key` bila endpoint
  mendukungnya.
- **[REKOMENDASI]** Form pakai React Hook Form + resolver Zod dengan schema
  yang sama dengan server (diimpor dari `src/server/modules/*/schemas.ts` versi
  shared, tanpa dependensi server).

### 5. Backend & database

- **[WAJIB]** Akses data tenant **hanya** lewat `TenantScopedRepository`
  (atau fungsi repository yang menerima `TenantContext`). Repository tanpa
  `eventId` harus `throw`. Query builder Drizzle mentah dilarang di route
  handler (ditegakkan lint rule).
- **[WAJIB]** Setiap transaksi DB tenant menjalankan
  `SET LOCAL app.event_id = $eventId` (RLS). Role DB `BYPASSRLS` hanya dipakai
  modul Owner dan job sistem.
- **[WAJIB]** Koneksi DB dari Vercel lewat Supavisor **transaction mode**
  (`prepare: false`). Migrasi lewat koneksi langsung/session dan role migrator.
- **[WAJIB]** Semua perubahan skema lewat migrasi drizzle-kit yang
  backward-compatible (expand → migrate → contract). Dilarang mengubah skema
  manual di dashboard Supabase.
- **[WAJIB]** Constraint penting ada di DB, bukan hanya di aplikasi (CHECK
  kuota, UNIQUE idempotensi, composite FK `(event_id, id)`, partial UNIQUE
  reissue). Jangan menghapus/melemahkan constraint dari DRD.
- **[WAJIB]** Waktu disimpan `timestamptz` (UTC); ditampilkan
  `Asia/Jakarta` dengan format UI-UX (mis. `19:00–22:00 WIB`).
- **[WAJIB]** Email & efek samping eksternal ditulis ke **outbox** di
  transaksi yang sama, dikirim oleh job — tidak dipanggil langsung di jalur
  request yang mengubah status.
- **[WAJIB]** Data API Supabase (PostgREST) tidak dipakai; `@supabase/supabase-js`
  hanya untuk Storage di sisi server.

### 6. Keamanan kredensial QRIS & secret

- **[WAJIB]** Merchant Code, API Key, Private Key Tripay disimpan sesuai DRD
  Security §1: API Key & Private Key dienkripsi **AES-256-GCM** (envelope
  encryption, AAD = `event_id` + `payment_config_id`).
- **[WAJIB]** Kredensial mentah **tidak pernah**: dikembalikan API, dikirim ke
  browser, ditulis ke log/Sentry/audit log, disimpan di fixture/test snapshot,
  atau di-commit. Tampilan hanya termasking (4 karakter terakhir).
- **[WAJIB]** Dekripsi hanya di modul `payments` saat create payment, verifikasi
  webhook, dan test koneksi; nilai mentah tidak disimpan di variabel modul/cache.
- **[WAJIB]** Verifikasi signature webhook memakai **raw body** dan
  `crypto.timingSafeEqual`, dengan private key tenant yang ditunjuk
  `webhookKey`.
- **[WAJIB]** Secret (DB URL, `PAYMENT_KEK_*`, `QR_SIGNING_KEY`, `CRON_SECRET`,
  API key email, token Vercel) hanya dari env yang divalidasi Zod di
  `src/config/env.ts`. Tidak ada default nilai secret di kode.
- **[WAJIB]** Owner tidak bisa membaca kredensial QRIS (tidak ada endpoint/
  query untuk itu).

### 7. Error handling

- **[WAJIB]** Error API memakai format **RFC 9457 Problem Details** dari DRD
  (`type`, `code`, `title`, `status`, `detail`, `errors`). `code` memakai
  kode yang sudah ada di DRD (`QUOTA_INSUFFICIENT`, `ORDER_NOT_EXPIRED`,
  `ALREADY_REISSUED`, `PRICE_CHANGED`, dll). Kode baru = [KONFIRMASI].
- **[WAJIB]** Error domain dilempar sebagai class turunan `DomainError`
  (punya `code` & `status`), diubah ke Problem Details di satu wrapper route
  handler. Error tak dikenal → `500` dengan pesan generik; detail hanya di log.
- **[WAJIB]** Jangan menelan error (`catch {}` kosong dilarang). Jika error
  sengaja diabaikan, tulis alasan dan log level `warn`.
- **[WAJIB]** Pesan error ke customer tidak membocorkan informasi (mis. Cek
  Pesanan selalu "Pesanan tidak ditemukan", login selalu "Email atau password
  salah").
- **[WAJIB]** Kegagalan pihak ketiga (Tripay, Resend, Storage, Vercel API)
  diberi timeout (Tripay 10 detik) dan ditangani eksplisit sesuai DRD
  (mis. gagal buat QRIS → kompensasi lepas kuota, `502 PAYMENT_GATEWAY_ERROR`).

### 8. Logging

- **[WAJIB]** Log terstruktur JSON lewat satu modul `logger` (bukan
  `console.log` di kode produksi). Field minimal: `level`, `msg`, `requestId`,
  `eventId` (bila ada), `userId` (bila ada), `route`.
- **[WAJIB]** **Dilarang** me-log: kredensial QRIS, secret, token akses/order
  access token, password, raw cookie, payload QR lengkap, dan PII (nama, no HP,
  email customer) dalam bentuk utuh. No HP/email dimasking bila perlu
  dicatat. Sentry diberi `beforeSend` yang men-scrub PII & secret.
- **[WAJIB]** Aksi sensitif dicatat di `audit_logs` (append-only):
  konfirmasi Cash, reissue, check-in, batal, refund, ubah kredensial, publish,
  akses Owner ke tenant, setiap hasil scan.
- **[REKOMENDASI]** Level: `error` = butuh tindakan; `warn` = anomali yang
  ditangani (signature webhook salah, rate limit); `info` = transisi status
  penting; `debug` dimatikan di production.

### 9. Komentar

- **[WAJIB]** Komentar menjelaskan **kenapa**, bukan mengulang **apa**.
- **[WAJIB]** Logika yang mengimplementasikan aturan bisnis diberi rujukan ID
  di komentar singkat, mis. `// BR-TRX-08: default batas = ends_at`.
- **[WAJIB]** `TODO`/`FIXME` wajib menyertakan ID requirement atau pertanyaan
  terbuka (mis. `// TODO(T21): …`). TODO tanpa rujukan dilarang.
- **[REKOMENDASI]** JSDoc hanya untuk fungsi publik modul server dan util
  shared; tidak perlu untuk komponen UI yang jelas dari props-nya.

---

## Folder Structure

**[WAJIB]** Struktur di bawah diikuti. Menambah folder top-level baru =
[KONFIRMASI].

```
uncle/
├─ src/
│  ├─ proxy.ts                       # Host-based routing & tenant resolution (DRD Architecture §4; Next 16: dulu middleware.ts)
│  ├─ config/
│  │  └─ env.ts                      # Validasi env (Zod); satu-satunya pembaca process.env
│  │
│  ├─ app/                           # Next.js App Router — hanya routing, layout, komposisi UI
│  │  ├─ sites/[slug]/               # ── LANDING PAGE / CUSTOMER ({slug}.uncle.id di-rewrite ke sini)
│  │  │  ├─ page.tsx                 #    Hero, Deskripsi, Dokumentasi, Tiket (Step 1–5), Lokasi
│  │  │  ├─ pesanan/[orderCode]/page.tsx   # Halaman status/tiket (link email, Cek Pesanan)
│  │  │  ├─ not-found.tsx
│  │  │  └─ _components/             #    Komponen khusus landing (EventHero, TicketTypeCard, CheckoutStepper…)
│  │  ├─ (marketing)/page.tsx        # uncle.id / www
│  │  ├─ (auth)/                     # login, invitations/[token], password/forgot|reset
│  │  ├─ owner/                      # ── OWNER DASHBOARD (app.uncle.id/owner)
│  │  │  ├─ page.tsx                 #    Ringkasan + Daftar Event
│  │  │  ├─ events/[eventId]/…       #    Edit Event (tab Info Umum, Branding, Jenis Tiket, Subdomain, Akses Admin)
│  │  │  ├─ clients/ · reports/
│  │  │  └─ _components/
│  │  ├─ admin/                      # ── ADMIN DASHBOARD (app.uncle.id/admin)
│  │  │  └─ events/[eventId]/
│  │  │     ├─ page.tsx              #    Ringkasan + Daftar Transaksi
│  │  │     ├─ scan/page.tsx         #    Scan Tiket (mobile-only)
│  │  │     ├─ payment-settings/page.tsx
│  │  │     └─ _components/
│  │  └─ api/                        # ── API (Route Handlers) — tipis: parse → panggil service → respons
│  │     ├─ public/…                 #    Customer (tenant dari Host)
│  │     ├─ auth/…
│  │     ├─ owner/…
│  │     ├─ admin/events/[eventId]/… #    orders, scan, tickets, payment-config, orders/[orderId]/reissue
│  │     ├─ webhooks/payments/tripay/[webhookKey]/route.ts
│  │     ├─ webhooks/email/[provider]/route.ts
│  │     ├─ internal/cron/[job]/route.ts
│  │     └─ health/route.ts
│  │
│  ├─ server/                        # ── BACKEND (server-only)
│  │  ├─ http/                       #    withAuth, withMembership, withRateLimit, problem-details, idempotency
│  │  ├─ tenancy/                    #    TenantContext, TenantScopedRepository, RLS helper
│  │  ├─ db/
│  │  │  ├─ schema/                  #    Drizzle schema per domain (orders.ts, tickets.ts, …)
│  │  │  ├─ client.ts
│  │  │  └─ migrations/              #    drizzle-kit output (jangan edit file yang sudah di-merge)
│  │  ├─ modules/                    #    Domain modules (DRD Architecture §1)
│  │  │  ├─ identity/ · tenancy/ · catalog/ · ordering/ · payments/
│  │  │  ├─ ticketing/ · notifications/ · audit/ · media/
│  │  │  │  # tiap modul: service.ts, repository.ts, schemas.ts, errors.ts, *.test.ts
│  │  └─ jobs/                       #    expire-orders, process-email-outbox, reconcile-qris, finish-events
│  │
│  ├─ integrations/                  # ── UTILITAS INTEGRASI PIHAK KETIGA (server-only)
│  │  ├─ payment-gateway/
│  │  │  ├─ payment-provider.ts      #    Interface PaymentProvider (DRD Integrations §1.1)
│  │  │  └─ tripay/                  #    client, signature, webhook parser, mapper
│  │  ├─ email/
│  │  │  ├─ email-sender.ts          #    Interface EmailSender
│  │  │  ├─ resend/
│  │  │  └─ templates/               #    React Email (ticket-issued, cash-reservation, …)
│  │  ├─ storage/supabase-storage.ts
│  │  ├─ vercel-domains/             #    Daftar host {slug}.uncle.id saat publish (DRD Deployment §3)
│  │  ├─ turnstile/
│  │  └─ redis/                      #    Upstash client + rate limiter
│  │
│  ├─ lib/                           # ── UTILITAS MURNI (boleh dipakai client & server, tanpa I/O)
│  │  ├─ qr/                         #    payload U1 encode/decode (HMAC di server-only), render QR
│  │  ├─ money.ts · phone.ts · datetime.ts · slug.ts · crypto/ (server-only)
│  │  └─ logger.ts
│  │
│  └─ components/                    # ── SHARED COMPONENTS
│     ├─ ui/                         #    shadcn/ui primitives (Button, Modal/BottomSheet, Toast…)
│     └─ shared/                     #    TransactionStatusBadge, QRCodeDisplay, OrderCodeChip, EmptyState…
│
├─ tests/
│  ├─ integration/                   # Vitest + Postgres asli (Testcontainers)
│  ├─ cross-tenant/                  # Suite isolasi tenant untuk setiap endpoint admin
│  ├─ e2e/                           # Playwright
│  └─ fixtures/                      # Seed Teater Bagol / Konser X (data dummy, tanpa secret)
├─ uncle-overview.md · PRD.md · UI-UX.md · DRD.md · AI-CODING-RULES.md   # dokumen acuan (root repo)
└─ .github/workflows/
```

Aturan penempatan:
- **[WAJIB]** `src/app/**` tidak berisi logika bisnis atau query DB; route
  handler maksimal: validasi input → panggil service → bentuk respons.
- **[WAJIB]** Komponen yang hanya dipakai satu area tinggal di `_components/`
  area itu; dipindah ke `src/components/shared/` hanya bila dipakai ≥ 2 area.
- **[WAJIB]** Landing page tidak boleh mengimpor apa pun dari `owner/` atau
  `admin/` (dan sebaliknya), selain `src/components/**` dan `src/lib/**`.
- **[WAJIB]** `src/integrations/**` hanya diakses dari `src/server/**`, tidak
  dari komponen UI.
- **[WAJIB]** Landing page berada di `src/app/sites/[slug]`; `src/proxy.ts`
  me-rewrite `{slug}.uncle.id` ke `/sites/{slug}` dan menolak akses langsung
  ke `/sites/*` dari host `app`/`www`/apex (404). Sudah disetujui dan dicatat di
  DRD v1.3 (sebelumnya `/_sites/{slug}`, yang tidak membentuk route di App
  Router karena folder berawalan `_` adalah private folder).

---

## Naming Conventions

### 1. Kode

| Elemen | Konvensi | Contoh |
|---|---|---|
| File & folder | `kebab-case` | `ticket-type-card.tsx`, `payment-gateway/` |
| Komponen React | `PascalCase` (nama file tetap kebab-case) | `TicketTypeCard`, `ScanResultPanel` |
| Nama komponen dari UI-UX.md | **[WAJIB]** Pakai nama persis di UI-UX §Components | `QRCodeDisplay`, `CashConfirmation` |
| Fungsi & variabel | `camelCase`, fungsi diawali kata kerja | `allocateQuota()`, `computeCashExpiresAt()` |
| Boolean | awalan `is/has/can/should` | `isSalesOpen`, `canReissue` |
| Konstanta | `SCREAMING_SNAKE_CASE` | `MAX_TICKETS_PER_ORDER` |
| Type/interface | `PascalCase`, tanpa awalan `I` | `PaymentProvider`, `TenantContext` |
| Zod schema | `camelCase` + akhiran `Schema` | `createOrderSchema` |
| Error class | `PascalCase` + akhiran `Error` | `QuotaInsufficientError` |
| Error code | `SCREAMING_SNAKE_CASE`, sama dengan DRD | `QUOTA_INSUFFICIENT` |
| Env var | `SCREAMING_SNAKE_CASE` | `QR_SIGNING_KEY`, `PAYMENT_KEK_V1` |
| Test file | `<nama>.test.ts` (unit/integration), `<flow>.spec.ts` (E2E) | `cash-expiry.test.ts`, `checkout-cash.spec.ts` |

**[WAJIB] Bahasa:** identifier kode dalam **bahasa Inggris**; teks UI, pesan
error untuk pengguna, dan template email dalam **bahasa Indonesia**. Istilah
domain dipetakan konsisten:

| Istilah dokumen | Identifier kode / enum |
|---|---|
| Lunas | `PAID` |
| Reserved / Belum bayar (Cash) | `RESERVED` |
| Menunggu pembayaran (QRIS) | `PENDING_PAYMENT` |
| Kedaluwarsa | `EXPIRED` |
| Dibatalkan / Refund | `CANCELLED` / `REFUNDED` |
| Diambil | ticket `CHECKED_IN` |
| Reservasi kedaluwarsa (hasil scan) | `RESERVATION_EXPIRED` |
| Buat pesanan baru dari reservasi kedaluwarsa | `reissue` |
| Event (tenant) | `event`, `eventId` |

### 2. Database

- **[WAJIB]** Tabel `snake_case` jamak (`orders`, `ticket_types`), kolom
  `snake_case` (`expires_at`, `reissued_from_order_id`). Nama tabel/kolom yang
  sudah ada di DRD dipakai **persis**; tabel/kolom baru = [KONFIRMASI].
- **[WAJIB]** FK: `<entitas_tunggal>_id` (`order_id`). Waktu: akhiran `_at`.
  Boolean: `is_`/`has_` atau kata sifat (`is_active`, `sales_open`).
- **[WAJIB]** Enum DB `SCREAMING_SNAKE_CASE`, nilai persis DRD.
- **[REKOMENDASI]** Nama constraint/index eksplisit: `pk_`, `fk_`, `uq_`,
  `ck_`, `ix_` + tabel + kolom (mis. `uq_orders_event_id_idempotency_key`).
- **[WAJIB]** Migrasi: `NNNN_<deskripsi_snake_case>.sql` (format drizzle-kit),
  satu tujuan per migrasi.

### 3. API

- **[WAJIB]** Path mengikuti DRD API persis: prefix `/api/public`,
  `/api/auth`, `/api/owner`, `/api/admin/events/{eventId}`, `/api/webhooks`,
  `/api/internal/cron`. Segmen `kebab-case`, resource kata benda jamak, aksi
  sebagai sub-resource kata kerja (`/confirm-cash`, `/reissue`, `/check-in`).
- **[WAJIB]** JSON body & response `camelCase` (`totalAmount`, `expiresAt`).
  Uang integer Rupiah; waktu ISO 8601 dengan offset.
- **[WAJIB]** Endpoint baru di luar DRD = [KONFIRMASI].

### 4. Rujukan requirement (commit, PR, branch, test)

- **[WAJIB]** Pakai ID dari PRD: `OWN-`, `ADM-`, `LP-`, `SCN-`, `PLT-` (fitur),
  `BR-…` (aturan bisnis), `AC-…` (acceptance criteria), `US-…` (user story);
  dari DRD: `D1`–`D7`, `T…`.
- **Branch:** `<type>/<ID>-<deskripsi-singkat>` → `feat/SCN-08-reissue-expired`.
- **Commit:** Conventional Commits dengan ID di scope →
  `feat(SCN-08): reissue order from expired cash reservation`; body memuat
  `Refs: BR-TKT-07, AC-SCN-08.2`.
- **PR title:** `[SCN-08] Buat pesanan baru dari reservasi kedaluwarsa`.
- **Test:** nama test memuat ID AC → `it('AC-SCN-08.4: rejects when quota taken before confirm', …)`.
- **Kode:** komentar `// BR-TRX-08` pada baris yang mengimplementasikan aturan.

---

## Libraries Allowed

**[WAJIB]** Hanya library di tabel ini yang boleh dipasang. Menambah
dependency baru membutuhkan: (1) alasan kuat yang tidak bisa dipenuhi library
yang ada atau platform API bawaan, (2) dicatat di laporan sebagai "Di luar
permintaan — perlu dikonfirmasi", (3) persetujuan sebelum di-merge.

**[WAJIB]** Pilihan stack & provider yang sudah final di DRD (D5): **Vercel
Pro**, **Supabase Pro** (Postgres + Storage, Singapore), **Cloudflare** (DNS,
Turnstile), **Resend**, **Tripay** sebagai payment gateway — **tidak boleh
diganti** atau ditambah alternatifnya tanpa persetujuan eksplisit.

| Kebutuhan | Library / layanan yang boleh | Catatan |
|---|---|---|
| Framework | `next` (App Router), `react`, `react-dom`, `typescript` | |
| Styling & UI | `tailwindcss`, shadcn/ui (Radix: `@radix-ui/*`), `lucide-react` (ikon outline UI-UX) | Komponen shadcn disalin ke `src/components/ui`. |
| Validasi | `zod` | Client & server. |
| Form | `react-hook-form`, `@hookform/resolvers` | |
| Database | `drizzle-orm`, `drizzle-kit`, `postgres` (postgres-js, `prepare: false`) | Tidak memakai Supabase client untuk query DB. |
| Auth & session | `better-auth` (session di Postgres sendiri) | DRD juga mengizinkan session custom; pilih satu di awal, tidak dicampur. |
| Hash password | Argon2id via `@node-rs/argon2` **[KONFIRMASI]** | DRD mewajibkan Argon2id tanpa menyebut library. |
| 2FA Owner (TOTP) | Plugin 2FA bawaan Better Auth | Tidak menambah library TOTP terpisah. |
| Payment gateway | **Tripay** via `fetch` + adapter `PaymentProvider` buatan sendiri | Tanpa SDK pihak ketiga. |
| Kirim email | `resend`, `@react-email/components` | Lewat interface `EmailSender` + outbox. |
| File storage | `@supabase/supabase-js` (Storage saja, server-side) | |
| Rate limit & cache | `@upstash/ratelimit`, `@upstash/redis` | |
| Generate QR code | `qrcode` | QR Tiket & render QR pembayaran (`qr_string`). |
| Scan QR code | **Salah satu:** `@zxing/browser` **atau** `qr-scanner` | DRD menyebut dua opsi; hanya satu yang dipasang. Pilihan = [KONFIRMASI]. |
| Pemrosesan gambar | `sharp` | Resize, WebP/AVIF, strip EXIF. |
| Sanitasi HTML | `sanitize-html` **[KONFIRMASI]** | DRD mewajibkan sanitasi allowlist tanpa menyebut library. |
| CAPTCHA | Cloudflare Turnstile via `fetch` (siteverify) + script resmi Turnstile | Tanpa wrapper pihak ketiga. |
| Kriptografi | `node:crypto` (AES-256-GCM, HMAC-SHA256, `timingSafeEqual`, `randomBytes`) | Dilarang library kripto pihak ketiga. |
| ID | `crypto.randomUUID()` / `gen_random_uuid()` | Tanpa paket `uuid`. |
| Tanggal & waktu | `Intl.DateTimeFormat` (zona `Asia/Jakarta`) | Tanpa moment/dayjs/date-fns kecuali disetujui. |
| HTTP client | `fetch` bawaan | Tanpa axios. |
| Monitoring | `@sentry/nextjs` | `beforeSend` scrub PII & secret. |
| Testing | `vitest`, `@testcontainers/postgresql`, `@playwright/test`, `@testing-library/react` | |
| Lint & format | `eslint` (config Next.js + aturan custom tenant), `prettier` | |

**[WAJIB] Dilarang** (tanpa persetujuan): Prisma, NextAuth/Auth.js, Supabase
Auth, Supabase Data API/PostgREST, Neon, Cloudflare R2/AWS S3 SDK, SDK payment
lain (Midtrans/Xendit/Duitku), axios, moment, lodash (penuh), penyimpanan
token di `localStorage`, UI kit selain shadcn/Radix.

---

## Testing Requirements

### 1. Jenis test wajib

**[WAJIB] Unit test (Vitest)** — logika murni, tanpa DB:
- Perhitungan harga & total (Σ harga × qty, `bigint`, snapshot harga) —
  BR-TRX-04, BR-EVT-07.
- Validasi pesanan: total 1..`max_tickets_per_order`, jenis aktif — BR-TRX-01/05.
- Hitung `expires_at` Cash untuk **ketiga** mode (`UNTIL_EVENT_END` default,
  `UNTIL_EVENT_START`, `AFTER_START_MINUTES` di-cap ke `ends_at`) + kasus batas
  sudah lewat saat checkout — BR-TRX-08, DRD §5.2.
- State machine order: semua transisi valid diterima, semua transisi tidak
  valid ditolak — DRD §4.1.
- QR payload `U1`: encode/decode, MAC salah, versi lama, payload QRIS EMVCo →
  `INVALID` — BR-TKT-01.
- Verifikasi signature webhook Tripay (valid, salah, header hilang).
- Normalisasi no HP, validasi email, validasi slug + kata cadangan.
- Enkripsi/dekripsi kredensial (round-trip, AAD tenant lain gagal).

**[WAJIB] Integration test (Vitest + Postgres asli via Testcontainers)** —
tidak boleh mock DB untuk alur kuota & tenant:
- `POST /api/public/orders`: QRIS & Cash sukses; **uji konkurensi** (mis. 50
  checkout paralel pada kuota 10 → tepat 10 sukses, 0 oversell) — AC-LP-06.6,
  AC-PLT-04.1; idempotency key yang sama → satu order.
- **Reservasi Cash & kedaluwarsa:** job `expire-orders` dan sweep-on-write
  melepas kuota & `VOID` ticket; reservasi belum lewat batas tetap tertahan
  (AC-LP-08.2–08.4).
- **Webhook payment** `POST /api/webhooks/payments/tripay/{webhookKey}`:
  signature valid → `PAID` + ticket + outbox email; signature salah → 401 &
  status tidak berubah; duplikat → no-op 200; nominal tidak cocok →
  `needs_review`; webhook `PAID` terlambat setelah `EXPIRED` (kuota ada → `PAID`,
  kuota habis → `needs_review`); `webhookKey` tenant A tidak bisa mengubah order
  tenant B — AC-LP-09.2–09.6.
- **Reissue** `POST /api/admin/events/{eventId}/orders/{orderId}/reissue`:
  sukses (order baru `PAID`, kode & QR baru, kuota +qty, `reissued_from_order_id`
  terisi, email `TICKET_ISSUED`); setiap error DRD (`400`, `404` tenant lain,
  `409 ORDER_NOT_EXPIRED`, `409 ALREADY_REISSUED`, `409 QUOTA_INSUFFICIENT`
  termasuk multi-jenis sebagian, `409 PRICE_CHANGED`); dua request paralel →
  tepat satu order baru; `RESERVED` yang `expires_at`-nya lewat tetapi belum
  disapu cron diproses benar — AC-SCN-08.1–08.6.
- `POST …/scan`: ketujuh `result` (`READY_PICKUP`, `CASH_UNPAID`,
  `ALREADY_CHECKED_IN`, `RESERVATION_EXPIRED` + blok `reissue`, `CANCELLED`,
  `OTHER_EVENT`, `INVALID`).
- `confirm-cash` dan `check-in`: sukses, ditolak bila status salah, dua
  check-in paralel → satu sukses — AC-SCN-04, AC-SCN-07.1.
- Payment Settings: kredensial tersimpan terenkripsi, respons API tidak pernah
  memuat nilai mentah — AC-ADM-07.4, AC-PLT-02.1.

**[WAJIB] Cross-tenant isolation suite** (`tests/cross-tenant/`):
- Untuk **setiap** endpoint `/api/admin/events/{eventId}/**` dan
  `/api/public/**`: admin/host event A mengakses resource event B → **404**
  tanpa data. Daftar endpoint diambil otomatis dari route registry; endpoint
  baru tanpa entri test membuat suite **gagal**.
- Scan QR event lain → `OTHER_EVENT` tanpa data order.
- Admin tanpa membership aktif → 404; Owner endpoint dari akun Admin → ditolak.
- Query dengan RLS aktif tanpa `app.event_id` → 0 baris.

**[WAJIB] E2E (Playwright)** — alur kritis di viewport mobile 360px:
checkout QRIS (gateway sandbox/mock), checkout Cash, scan → Konfirmasi Lunas →
Tandai Diambil, scan reservasi kedaluwarsa → Buat Pesanan Baru.

**[REKOMENDASI]** Uji beban k6 sebelum event besar pertama (500 checkout
serentak pada kuota 100 → 0 oversell) — DRD Deployment §4.

### 2. Target coverage MVP **[KONFIRMASI]**

| Area | Target minimum |
|---|---|
| `server/modules/ordering`, `payments`, `ticketing`, `server/tenancy`, `lib/qr`, `lib/crypto` | **90% line, 85% branch** |
| Modul server lainnya (`catalog`, `identity`, `notifications`, `media`, `audit`) | 70% line |
| Keseluruhan project (termasuk UI) | 60% line |
| Endpoint admin & public di cross-tenant suite | **100%** endpoint |
| AC di PRD untuk fitur Must | Setiap AC punya minimal satu test yang namanya memuat ID AC |

### 3. Aturan pelaksanaan

- **[WAJIB]** CI menjalankan lint → typecheck → unit → integration →
  cross-tenant → build → E2E; semua harus hijau sebelum merge.
- **[WAJIB]** Dilarang men-skip, menonaktifkan, atau melemahkan test untuk
  membuat CI hijau. Test flaky diperbaiki akar masalahnya.
- **[WAJIB]** Bug fix disertai test yang gagal sebelum fix dan lulus sesudahnya.
- **[WAJIB]** Fixture & snapshot tidak berisi kredensial asli, PII asli, atau
  secret.

---

## Definition of Done

Fitur dianggap selesai **hanya** jika semua item **[WAJIB]** tercentang.

**Requirement & scope**
- [ ] **[WAJIB]** Semua acceptance criteria PRD yang dirujuk task (`AC-…`)
      terpenuhi dan masing-masing punya test.
- [ ] **[WAJIB]** Tidak ada perubahan di luar scope task, kecuali yang sudah
      ditandai "Di luar permintaan — perlu dikonfirmasi" di laporan.
- [ ] **[WAJIB]** Tidak ada keputusan final di `uncle-overview.md`/PRD/UI-UX/DRD
      yang diubah; konflik yang ditemukan diajukan sebagai usulan.
- [ ] **[WAJIB]** Commit/PR merujuk ID requirement (`LP-`, `OWN-`, `ADM-`,
      `SCN-`, `PLT-`, `BR-`, `AC-`).

**Kualitas & test**
- [ ] **[WAJIB]** Lint, typecheck (strict), unit, integration, cross-tenant,
      dan E2E terkait lulus di CI.
- [ ] **[WAJIB]** Target coverage area terkait tercapai (Testing Requirements §2).
- [ ] **[WAJIB]** Tidak ada `any`, `@ts-ignore`, `console.log`, atau TODO tanpa
      rujukan ID.

**UI/UX** (untuk fitur dengan antarmuka)
- [ ] **[WAJIB]** State loading (skeleton), empty, error, dan success
      diimplementasikan sesuai tabel States di `UI-UX.md`.
- [ ] **[WAJIB]** Teks & microcopy sesuai `UI-UX.md`; status = warna + ikon + teks.
- [ ] **[WAJIB]** Landing & Scan Tiket diuji di lebar 360px; target sentuh
      sesuai UI-UX (≥ 48px di Scan Tiket); tombol mutasi anti-klik-ganda.
- [ ] **[REKOMENDASI]** Kontras WCAG AA dicek; `prefers-reduced-motion` dihormati.

**Keamanan & multi-tenant**
- [ ] **[WAJIB]** Semua akses data tenant lewat `TenantScopedRepository`;
      endpoint baru terdaftar di cross-tenant suite dan lulus (404 untuk tenant
      lain).
- [ ] **[WAJIB]** Input divalidasi Zod di server; harga/total dihitung server.
- [ ] **[WAJIB]** Kredensial QRIS & secret tidak muncul di respons, log, Sentry,
      audit log, fixture, atau commit.
- [ ] **[WAJIB]** Rate limit endpoint baru sesuai DRD Security §4 (atau
      ditandai [KONFIRMASI] bila belum ada di DRD).
- [ ] **[WAJIB]** Aksi sensitif tercatat di `audit_logs`.

**Data & operasional**
- [ ] **[WAJIB]** Migrasi DB backward-compatible, berjalan bersih di DB kosong
      dan di staging; constraint DRD tidak dilemahkan.
- [ ] **[WAJIB]** Efek samping eksternal (email) lewat outbox; job idempoten.
- [ ] **[REKOMENDASI]** Metrik/alert ditambahkan bila fitur menyentuh webhook,
      email, atau kuota.

**Review & laporan**
- [ ] **[WAJIB]** Sudah di-review (minimal satu reviewer manusia; perubahan
      modul `payments`, `tenancy`, `identity` wajib review manusia — DRD
      Security §7).
- [ ] **[WAJIB]** Laporan akhir task berisi lima bagian di Coding Conventions
      §1.6, termasuk daftar "Di luar permintaan — perlu dikonfirmasi".
