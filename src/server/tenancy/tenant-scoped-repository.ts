import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { DatabaseTransaction } from "@/server/db/client";
import { events } from "@/server/db/schema";

import {
  assertTenantContext,
  MissingTenantContextError,
  type TenantContext,
} from "./tenant-context";

// Tabel data tenant: wajib punya kolom event_id (DRD §Database 1).
export type TenantTable = PgTable & { eventId: AnyPgColumn };

type InsertValues<T extends TenantTable> = Omit<T["$inferInsert"], "eventId">;
type UpdateValues<T extends TenantTable> = Partial<Omit<T["$inferInsert"], "eventId">>;

/**
 * Satu-satunya pintu akses data tenant (AI-CODING-RULES §5). Setiap query
 * otomatis diberi `WHERE event_id = <tenant>`, dan insert selalu memakai
 * eventId dari konteks — bukan dari input pemanggil.
 *
 * Dibuat lewat `withTenant()`, sehingga RLS (`app.event_id`) juga aktif
 * sebagai jaring pengaman kedua.
 */
export class TenantScopedRepository {
  readonly context: TenantContext;
  readonly #tx: DatabaseTransaction;

  constructor(tx: DatabaseTransaction, context: TenantContext) {
    assertTenantContext(context);
    this.#tx = tx;
    this.context = context;
  }

  get eventId(): string {
    return this.context.eventId;
  }

  /**
   * Transaksi mentah untuk query lanjutan (mis. `FOR UPDATE` di alokasi kuota).
   * Setiap query lewat sini WAJIB memakai `scope()` pada klausa WHERE.
   */
  get tx(): DatabaseTransaction {
    return this.#tx;
  }

  /** `event_id = <tenant>` digabung dengan kondisi tambahan (AND). */
  scope(table: TenantTable, ...conditions: Array<SQL | undefined>): SQL {
    const clause = and(eq(table.eventId, this.eventId), ...conditions);
    if (!clause) throw new MissingTenantContextError();
    return clause;
  }

  async getEvent(): Promise<typeof events.$inferSelect | undefined> {
    const [row] = await this.#tx.select().from(events).where(eq(events.id, this.eventId)).limit(1);
    return row;
  }

  async findMany<T extends TenantTable>(table: T, where?: SQL): Promise<Array<T["$inferSelect"]>> {
    const rows: unknown[] = await this.#tx
      .select()
      .from(table as PgTable)
      .where(this.scope(table, where));
    return rows as Array<T["$inferSelect"]>;
  }

  async findFirst<T extends TenantTable>(
    table: T,
    where?: SQL,
  ): Promise<T["$inferSelect"] | undefined> {
    const rows: unknown[] = await this.#tx
      .select()
      .from(table as PgTable)
      .where(this.scope(table, where))
      .limit(1);
    return rows[0] as T["$inferSelect"] | undefined;
  }

  async insert<T extends TenantTable>(
    table: T,
    values: InsertValues<T>,
  ): Promise<T["$inferSelect"]> {
    this.#rejectEventIdOverride(values);
    const rows: unknown[] = await this.#tx
      .insert(table as PgTable)
      .values({ ...values, eventId: this.eventId })
      .returning();
    return rows[0] as T["$inferSelect"];
  }

  async update<T extends TenantTable>(
    table: T,
    values: UpdateValues<T>,
    where: SQL,
  ): Promise<Array<T["$inferSelect"]>> {
    this.#rejectEventIdOverride(values);
    const rows: unknown[] = await this.#tx
      .update(table as PgTable)
      .set(values)
      .where(this.scope(table, where))
      .returning();
    return rows as Array<T["$inferSelect"]>;
  }

  async delete<T extends TenantTable>(table: T, where: SQL): Promise<number> {
    const rows: unknown[] = await this.#tx
      .delete(table as PgTable)
      .where(this.scope(table, where))
      .returning();
    return rows.length;
  }

  // Pertahanan runtime terhadap pemanggil yang melewati tipe (mis. data dari JSON).
  #rejectEventIdOverride(values: object): void {
    if ("eventId" in values) throw new MissingTenantContextError();
  }
}
