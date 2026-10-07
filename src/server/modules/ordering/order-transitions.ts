import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { DatabaseTransaction } from "@/server/db/client";
import { emailOutbox, orderItems, orders, tickets, ticketTypes } from "@/server/db/schema";

import { InvalidOrderTransitionError } from "./errors";
import { assertTransition, EXPIRABLE_STATUSES, type OrderStatus } from "./order-state-machine";

type Order = typeof orders.$inferSelect;
type OrderPatch = Partial<Omit<typeof orders.$inferInsert, "id" | "eventId" | "status">>;

/**
 * Satu-satunya tempat status order diubah (AI-CODING-RULES I-8). UPDATE
 * bersyarat pada status lama, sehingga perubahan bersamaan tidak saling timpa.
 */
export async function transitionOrderStatus(
  tx: DatabaseTransaction,
  order: Pick<Order, "id" | "eventId" | "status" | "paymentMethod">,
  to: OrderStatus,
  patch: OrderPatch = {},
): Promise<Order> {
  assertTransition(order.paymentMethod, order.status, to);
  const [updated] = await tx
    .update(orders)
    .set({ ...patch, status: to })
    .where(
      and(
        eq(orders.eventId, order.eventId),
        eq(orders.id, order.id),
        eq(orders.status, order.status),
      ),
    )
    .returning();
  if (!updated) throw new InvalidOrderTransitionError(order.status, to);
  return updated;
}

// Kembalikan kuota yang dipegang order (−qty per jenis tiket).
async function releaseQuota(
  tx: DatabaseTransaction,
  eventId: string,
  orderId: string,
): Promise<void> {
  const items = await tx
    .select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(and(eq(orderItems.eventId, eventId), eq(orderItems.orderId, orderId)));
  for (const item of items) {
    await tx
      .update(ticketTypes)
      .set({ allocatedCount: sql`${ticketTypes.allocatedCount} - ${item.quantity}` })
      .where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.id, item.ticketTypeId)));
  }
}

const isExpirable = (status: OrderStatus): boolean =>
  (EXPIRABLE_STATUSES as readonly OrderStatus[]).includes(status);

/**
 * PENDING_PAYMENT/RESERVED yang lewat expires_at → EXPIRED, kuota dilepas,
 * ticket VOID, email RESERVATION_EXPIRED untuk Cash (DRD §Database 4.1).
 *
 * Urutan kunci: pemanggil WAJIB sudah mengunci ticket_types milik order ini
 * (urut id) sebelum memanggil, supaya urutan kunci selalu ticket_types → orders.
 * Order yang sedang dikunci transaksi lain dilewati (SKIP LOCKED).
 */
export async function expireOrderIfDue(
  tx: DatabaseTransaction,
  params: { eventId: string; orderId: string; now: Date },
): Promise<boolean> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.eventId, params.eventId), eq(orders.id, params.orderId)))
    .for("update", { skipLocked: true });
  // DRD §Database 5.1: hold kedaluwarsa bila expires_at < now.
  if (!order || !isExpirable(order.status) || !order.expiresAt || order.expiresAt >= params.now) {
    return false;
  }

  await expireOrder(tx, order, params.now, "ORDER_EXPIRED");
  return true;
}

/**
 * Order aktif → EXPIRED sekarang: kuota dilepas, ticket VOID, email
 * RESERVATION_EXPIRED untuk Cash. Dipakai expire-on-due dan kompensasi gateway
 * (QRIS gagal dibuat / gateway melaporkan EXPIRED/FAILED). Pemanggil WAJIB
 * sudah mengunci ticket_types order ini lalu baris order-nya.
 */
export async function expireOrder(
  tx: DatabaseTransaction,
  order: Order,
  now: Date,
  reason: "ORDER_EXPIRED" | "GATEWAY_ERROR" | "GATEWAY_EXPIRED",
): Promise<Order> {
  const expired = await transitionOrderStatus(tx, order, "EXPIRED");
  await releaseQuota(tx, order.eventId, order.id);
  await tx
    .update(tickets)
    .set({ status: "VOID", voidedAt: now, voidReason: reason })
    .where(
      and(
        eq(tickets.eventId, order.eventId),
        eq(tickets.orderId, order.id),
        eq(tickets.status, "ISSUED"),
      ),
    );
  if (order.paymentMethod === "CASH") {
    await tx.insert(emailOutbox).values({
      eventId: order.eventId,
      orderId: order.id,
      type: "RESERVATION_EXPIRED",
      toEmail: order.customerEmail,
      payload: { orderCode: order.orderCode },
    });
  }
  return expired;
}
