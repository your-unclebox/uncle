import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { APP_DB_ROLE } from "@/server/db/roles";

import { assertTenantContext, type TenantContext } from "./tenant-context";
import { TenantScopedRepository } from "./tenant-scoped-repository";

/**
 * Menjalankan pekerjaan dalam satu transaksi yang terikat ke satu tenant:
 * 1. `SET LOCAL ROLE uncle_app` → RLS berlaku (role ini bukan owner tabel).
 * 2. `app.event_id` di-set lokal ke transaksi → policy tenant_isolation.
 * 3. Repository men-scope setiap query ke event_id yang sama.
 * Aman untuk Supavisor mode transaction karena semua setting bersifat LOCAL.
 */
export async function withTenant<T>(
  db: Database,
  context: TenantContext,
  work: (repo: TenantScopedRepository) => Promise<T>,
): Promise<T> {
  assertTenantContext(context);
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_DB_ROLE}`));
    await tx.execute(sql`SELECT set_config('app.event_id', ${context.eventId}, true)`);
    return work(new TenantScopedRepository(tx, context));
  });
}
