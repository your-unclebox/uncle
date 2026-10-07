# Uncle

Platform ticketing event white-label (multi-tenant). Dokumen acuan:
`uncle-overview.md`, `PRD.md`, `UI-UX.md`, `DRD.md`, dan aturan kerja
`AI-CODING-RULES.md`.

## Setup development (Fase 1)

Prasyarat: Node.js 22, Docker.

```bash
npm ci
cp .env.example .env        # isi nilai lokal; .env tidak pernah di-commit
npm run db:up               # Postgres 17 lokal di localhost:54322
npm run db:migrate          # jalankan migrasi (ditolak untuk NODE_ENV=production)
npm run db:seed             # data contoh event Teater Bagol (idempoten)
```

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run lint` / `npm run typecheck` / `npm run format:check` | Lint, typecheck strict, cek format |
| `npm test` | Semua test (unit + integrasi; integrasi butuh Docker untuk Testcontainers) |
| `npm run test:unit` / `npm run test:integration` | Per project Vitest |
| `npm run test:coverage` | Test + laporan coverage |
| `npm run db:generate` | Generate migrasi dari perubahan skema Drizzle |
