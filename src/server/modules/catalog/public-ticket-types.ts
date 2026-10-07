import "server-only";

import { asc, eq } from "drizzle-orm";

import { ticketTypes } from "@/server/db/schema";
import type { TenantScopedRepository } from "@/server/tenancy";

// UI-UX 1.3 Step 1: "Hampir habis" bila sisa ≤ 10% kuota atau ≤ 10 tiket.
const LOW_STOCK_ABSOLUTE = 10;
const LOW_STOCK_RATIO = 0.1;

export interface PublicTicketType {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly remaining: number;
  readonly lowStock: boolean;
}

/**
 * Jenis tiket aktif + kuota tersisa (BR-TRX-06: kuota − terjual − ditahan).
 * Hold yang sudah lewat batas tapi belum disapu job expire-orders masih
 * terhitung ditahan; alokasi saat checkout menyapunya lebih dulu.
 */
export async function listPublicTicketTypes(
  repo: TenantScopedRepository,
): Promise<PublicTicketType[]> {
  const rows = await repo.tx
    .select()
    .from(ticketTypes)
    .where(repo.scope(ticketTypes, eq(ticketTypes.isActive, true)))
    .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.name));
  return rows.map((row) => {
    const remaining = Math.max(0, row.quota - row.allocatedCount);
    return {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      remaining,
      lowStock:
        remaining > 0 &&
        (remaining <= LOW_STOCK_ABSOLUTE || remaining <= row.quota * LOW_STOCK_RATIO),
    };
  });
}
