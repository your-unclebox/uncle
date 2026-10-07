import "server-only";

import { and, eq } from "drizzle-orm";

import { generateToken, sha256 } from "@/lib/crypto/tokens";
import { toLocalDateKey } from "@/lib/datetime";
import { isUniqueViolation } from "@/server/db/pg-error";
import { auditLogs, emailOutbox, events, orderItems, orders, tickets } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { issueTicket, rebuildTicketQrPayload } from "@/server/modules/ticketing";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  ActorRequiredError,
  AlreadyReissuedError,
  EventNotFoundError,
  EventNotOperationalError,
  OrderNotExpiredError,
  OrderNotFoundError,
  PriceChangedError,
} from "./errors";
import { insertOrderWithUniqueCode } from "./insert-order";
import { initialOrderStatus } from "./order-state-machine";
import { computeOrderTotal } from "./pricing";
import { allocateQuota } from "./quota";
import { reissueExpiredOrderInputSchema } from "./schemas";

export interface ReissueDeps {
  readonly qrSigningKey: Buffer;
  readonly now?: Date;
}

export interface ReissueResult {
  readonly order: typeof orders.$inferSelect;
  readonly items: ReadonlyArray<typeof orderItems.$inferSelect>;
  readonly ticket: typeof tickets.$inferSelect;
  readonly qrPayload: string;
  readonly replayed: boolean;
}

// Scanner boleh dipakai sampai akhir hari event (PRD BR-EVT-08, DRD §Database 5.2a).
function isEventOperational(event: typeof events.$inferSelect, now: Date): boolean {
  if (event.status === "ACTIVE") return true;
  if (event.status !== "FINISHED" || !event.endsAt) return false;
  return toLocalDateKey(now, event.timezone) <= toLocalDateKey(event.endsAt, event.timezone);
}

/**
 * Buat pesanan baru berstatus PAID dari reservasi Cash yang kedaluwarsa
 * (SCN-08, BR-TKT-07, keputusan D7, DRD §Database 5.2a). Memakai ulang
 * allocateQuota (sweep-on-write ikut meng-EXPIRED-kan order lama bila
 * belum disapu cron). Semua item harus muat (semua-atau-tidak).
 */
export async function reissueExpiredOrder(
  repo: TenantScopedRepository,
  rawInput: unknown,
  deps: ReissueDeps,
): Promise<ReissueResult> {
  const input = parseInput(reissueExpiredOrderInputSchema, rawInput);
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  const now = deps.now ?? new Date();
  const { tx, eventId } = repo;

  if (input.idempotencyKey) {
    const replay = await repo.findFirst(
      orders,
      and(
        eq(orders.idempotencyKey, input.idempotencyKey),
        eq(orders.reissuedFromOrderId, input.orderId),
      ),
    );
    if (replay) return loadResult(repo, replay, deps.qrSigningKey, true);
  }

  const event = await repo.getEvent();
  if (!event) throw new EventNotFoundError();
  if (!isEventOperational(event, now)) throw new EventNotOperationalError();

  const oldOrder = await repo.findFirst(orders, eq(orders.id, input.orderId));
  if (!oldOrder) throw new OrderNotFoundError();
  assertExpiredCashReservation(oldOrder, now);
  await assertNotReissued(repo, oldOrder.id);

  const oldItems = await repo.findMany(orderItems, eq(orderItems.orderId, oldOrder.id));
  const ticketTypeRows = await allocateQuota(tx, eventId, oldItems, now);

  // Kunci order lama setelah ticket_types (urutan kunci konsisten), lalu cek
  // ulang: admin lain mungkin baru saja membuat order baru untuk reservasi ini.
  const [lockedOld] = await tx
    .select()
    .from(orders)
    .where(repo.scope(orders, eq(orders.id, oldOrder.id)))
    .for("update");
  if (!lockedOld || lockedOld.status !== "EXPIRED") throw new OrderNotExpiredError();
  await assertNotReissued(repo, oldOrder.id);

  // Harga mengikuti harga saat ini (BR-EVT-07; PRD Q19 masih terbuka).
  const lines = oldItems.map((item) => {
    const ticketType = ticketTypeRows.get(item.ticketTypeId);
    if (!ticketType) throw new Error("Jenis tiket hilang setelah alokasi kuota.");
    return {
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: ticketType.price,
      ticketTypeName: ticketType.name,
    };
  });
  const totalAmount = computeOrderTotal(lines);
  if (totalAmount !== BigInt(input.expectedTotal)) throw new PriceChangedError(totalAmount);

  let newOrder: typeof orders.$inferSelect;
  try {
    newOrder = await insertOrderWithUniqueCode(tx, {
      eventId,
      customerName: oldOrder.customerName,
      customerPhone: oldOrder.customerPhone,
      customerEmail: oldOrder.customerEmail,
      paymentMethod: "CASH",
      status: initialOrderStatus("CASH", { reissue: true }),
      totalAmount,
      expiresAt: null,
      paidAt: now,
      paidVia: "CASH_MANUAL",
      cashConfirmedBy: actorUserId,
      reissuedFromOrderId: oldOrder.id,
      // Token tidak dikembalikan ke admin; customer memakai Cek Pesanan (T23).
      accessTokenHash: sha256(generateToken()),
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    if (isUniqueViolation(error, "uq_orders_event_id_reissued_from")) {
      await assertNotReissued(repo, oldOrder.id);
    }
    throw error;
  }

  const items = await tx
    .insert(orderItems)
    .values(lines.map((line) => ({ ...line, eventId, orderId: newOrder.id })))
    .returning();
  const { ticket, qrPayload } = await issueTicket(tx, {
    eventId,
    orderId: newOrder.id,
    qrSigningKey: deps.qrSigningKey,
    now,
  });
  await tx.insert(emailOutbox).values({
    eventId,
    orderId: newOrder.id,
    type: "TICKET_ISSUED",
    toEmail: newOrder.customerEmail,
    payload: { orderCode: newOrder.orderCode },
  });
  await repo.insert(auditLogs, {
    actorUserId,
    action: "ORDER_REISSUED",
    entityType: "order",
    entityId: newOrder.id,
    before: { orderId: oldOrder.id, orderCode: oldOrder.orderCode, status: lockedOld.status },
    after: {
      orderId: newOrder.id,
      orderCode: newOrder.orderCode,
      status: newOrder.status,
      totalAmount: totalAmount.toString(),
    },
  });

  return { order: newOrder, items, ticket, qrPayload, replayed: false };
}

function assertExpiredCashReservation(order: typeof orders.$inferSelect, now: Date): void {
  if (order.paymentMethod !== "CASH") throw new OrderNotExpiredError();
  if (order.status === "EXPIRED") return;
  // RESERVED yang sudah lewat batas tapi belum disapu cron tetap dianggap kedaluwarsa.
  const pastDeadline = order.expiresAt !== null && order.expiresAt < now;
  if (order.status !== "RESERVED" || !pastDeadline) throw new OrderNotExpiredError();
}

async function assertNotReissued(repo: TenantScopedRepository, oldOrderId: string): Promise<void> {
  const existing = await repo.findFirst(orders, eq(orders.reissuedFromOrderId, oldOrderId));
  if (existing) throw new AlreadyReissuedError(existing.orderCode);
}

async function loadResult(
  repo: TenantScopedRepository,
  order: typeof orders.$inferSelect,
  qrSigningKey: Buffer,
  replayed: boolean,
): Promise<ReissueResult> {
  const ticket = await repo.findFirst(tickets, eq(tickets.orderId, order.id));
  if (!ticket) throw new Error("Order hasil reissue tanpa QR Tiket.");
  const items = await repo.findMany(orderItems, eq(orderItems.orderId, order.id));
  return {
    order,
    items,
    ticket,
    qrPayload: rebuildTicketQrPayload(ticket, qrSigningKey),
    replayed,
  };
}
