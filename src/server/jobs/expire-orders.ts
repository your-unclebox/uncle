import "server-only";

import { and, asc, eq, inArray, lt } from "drizzle-orm";

import { logger } from "@/lib/logger";
import type { Database } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema";
import { EXPIRABLE_STATUSES, expireOrderIfDue, lockTicketTypes } from "@/server/modules/ordering";

const DEFAULT_BATCH_SIZE = 100;

/**
 * Job `expire-orders` (DRD Architecture §6, tiap 1 menit): hold
 * PENDING_PAYMENT/RESERVED yang lewat expires_at → EXPIRED, kuota dilepas.
 * Job sistem lintas tenant → memakai koneksi owner (melewati RLS), dengan
 * setiap query tetap difilter event_id milik order yang diproses.
 * Satu transaksi per order supaya satu kegagalan tidak menahan batch.
 */
export async function expireDueOrders(
  db: Database,
  options: { now?: Date; batchSize?: number } = {},
): Promise<{ expired: number; scanned: number }> {
  const now = options.now ?? new Date();
  const due = await db
    .select({ id: orders.id, eventId: orders.eventId })
    .from(orders)
    .where(and(inArray(orders.status, [...EXPIRABLE_STATUSES]), lt(orders.expiresAt, now)))
    .orderBy(asc(orders.expiresAt))
    .limit(options.batchSize ?? DEFAULT_BATCH_SIZE);

  let expired = 0;
  for (const order of due) {
    const done = await db.transaction(async (tx) => {
      const items = await tx
        .select({ ticketTypeId: orderItems.ticketTypeId })
        .from(orderItems)
        .where(and(eq(orderItems.eventId, order.eventId), eq(orderItems.orderId, order.id)));
      await lockTicketTypes(
        tx,
        order.eventId,
        items.map((item) => item.ticketTypeId),
      );
      return expireOrderIfDue(tx, { eventId: order.eventId, orderId: order.id, now });
    });
    if (done) expired += 1;
  }

  logger.info("expire-orders selesai", { scanned: due.length, expired });
  return { expired, scanned: due.length };
}
