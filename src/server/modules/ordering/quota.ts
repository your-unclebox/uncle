import "server-only";

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import type { DatabaseTransaction } from "@/server/db/client";
import { orderItems, orders, ticketTypes } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";

import { QuotaInsufficientError } from "./errors";
import { EXPIRABLE_STATUSES } from "./order-state-machine";
import { expireOrderIfDue } from "./order-transitions";

export type TicketTypeRow = typeof ticketTypes.$inferSelect;

export interface RequestedQuantity {
  readonly ticketTypeId: string;
  readonly quantity: number;
}

const uniqueSorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/** Kunci baris ticket_types (FOR UPDATE, urut id → tanpa deadlock). */
export async function lockTicketTypes(
  tx: DatabaseTransaction,
  eventId: string,
  ids: Iterable<string>,
): Promise<Map<string, TicketTypeRow>> {
  const sorted = uniqueSorted(ids);
  if (sorted.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.id, sorted)))
    .orderBy(asc(ticketTypes.id))
    .for("update");
  return new Map(rows.map((row) => [row.id, row]));
}

// Hold aktif yang sudah lewat batas dan menyentuh jenis tiket yang diminta.
async function findDueHolds(
  tx: DatabaseTransaction,
  eventId: string,
  ticketTypeIds: readonly string[],
  now: Date,
): Promise<{ orderIds: string[]; ticketTypeIds: string[] }> {
  const due = await tx
    .selectDistinct({ id: orders.id })
    .from(orders)
    .innerJoin(
      orderItems,
      and(eq(orderItems.eventId, orders.eventId), eq(orderItems.orderId, orders.id)),
    )
    .where(
      and(
        eq(orders.eventId, eventId),
        inArray(orderItems.ticketTypeId, [...ticketTypeIds]),
        inArray(orders.status, [...EXPIRABLE_STATUSES]),
        lt(orders.expiresAt, now),
      ),
    );
  const orderIds = due.map((row) => row.id);
  if (orderIds.length === 0) return { orderIds, ticketTypeIds: [] };
  const touched = await tx
    .selectDistinct({ id: orderItems.ticketTypeId })
    .from(orderItems)
    .where(and(eq(orderItems.eventId, eventId), inArray(orderItems.orderId, orderIds)));
  return { orderIds, ticketTypeIds: touched.map((row) => row.id) };
}

/**
 * Alokasi kuota atomik (DRD §Database 5.1, BR-TRX-06, AI-CODING-RULES I-4):
 * 1. sweep-on-write: kunci jenis tiket yang diminta + jenis tiket milik hold
 *    kedaluwarsa, lalu lepas hold tersebut;
 * 2. UPDATE bersyarat `allocated_count + qty <= quota AND is_active`;
 * 3. satu jenis saja gagal → QuotaInsufficientError dengan sisa kuota terbaru
 *    (pemanggil membatalkan transaksi, termasuk alokasi yang sudah berhasil).
 * Dipakai create order dan reissue (D7).
 */
export async function allocateQuota(
  tx: DatabaseTransaction,
  eventId: string,
  requested: readonly RequestedQuantity[],
  now: Date,
): Promise<Map<string, TicketTypeRow>> {
  const requestedIds = uniqueSorted(requested.map((item) => item.ticketTypeId));
  const due = await findDueHolds(tx, eventId, requestedIds, now);
  const locked = await lockTicketTypes(tx, eventId, [...requestedIds, ...due.ticketTypeIds]);

  if (requestedIds.some((id) => !locked.has(id))) {
    throw new ValidationError({ items: ["Jenis tiket tidak ditemukan untuk event ini"] });
  }
  for (const orderId of due.orderIds) await expireOrderIfDue(tx, { eventId, orderId, now });

  // Kondisi setelah sweep (baris masih terkunci oleh transaksi ini).
  const snapshot = await lockTicketTypes(tx, eventId, requestedIds);
  const allocated = new Map<string, TicketTypeRow>();
  let insufficient = false;
  for (const { ticketTypeId, quantity } of [...requested].sort((a, b) =>
    a.ticketTypeId.localeCompare(b.ticketTypeId),
  )) {
    const [row] = await tx
      .update(ticketTypes)
      .set({ allocatedCount: sql`${ticketTypes.allocatedCount} + ${quantity}` })
      .where(
        and(
          eq(ticketTypes.eventId, eventId),
          eq(ticketTypes.id, ticketTypeId),
          eq(ticketTypes.isActive, true),
          sql`${ticketTypes.allocatedCount} + ${quantity} <= ${ticketTypes.quota}`,
        ),
      )
      .returning();
    if (row) allocated.set(ticketTypeId, row);
    else insufficient = true;
  }

  if (insufficient) {
    throw new QuotaInsufficientError(
      requestedIds.map((id) => {
        const row = snapshot.get(id);
        return {
          ticketTypeId: id,
          name: row?.name ?? "",
          remaining: row?.isActive ? row.quota - row.allocatedCount : 0,
        };
      }),
    );
  }
  return allocated;
}
