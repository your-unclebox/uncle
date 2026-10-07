-- Ekstensi yang dipakai skema (tersedia di Supabase & image postgres resmi).
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Role aplikasi untuk akses data tenant (DRD Security §3). Tidak bisa login,
-- tidak punya BYPASSRLS, bukan owner tabel. Koneksi aplikasi masuk ke role ini
-- per transaksi lewat `SET LOCAL ROLE uncle_app` (src/server/tenancy).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uncle_app') THEN
    CREATE ROLE uncle_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT uncle_app TO CURRENT_USER;
