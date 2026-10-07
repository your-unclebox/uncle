import "server-only";

import { eq, sql } from "drizzle-orm";

import { generateToken, sha256 } from "@/lib/crypto/tokens";
import { emailOutbox, orderItems, orders, tickets } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { issueTicket, rebuildTicketQrPayload } from "@/server/modules/ticketing";
import type { TenantScopedRepository } from "@/server/tenancy";

import { computeCashExpiresAt } from "./cash-reservation";
import { PaymentMethodUnavailableError, SalesClosedError } from "./errors";
import { insertOrderWithUniqueCode } from "./insert-order";
import { allocateOrderLines, assertEventSellable } from "./order-lines";
import { initialOrderStatus } from "./order-state-machine";
import { computeOrderTotal } from "./pricing";
import { createCashOrderInputSchema } from "./schemas";

export interface CreateCashOrderDeps {
  readonly qrSigningKey: Buffer;
  readonly now?: Date;
  readonly createdIp?: string;
}

export interface CashOrderResult {
  readonly order: typeof orders.$inferSelect;
  readonly items: ReadonlyArray<typeof orderItems.$inferSelect>;
  readonly ticket: typeof tickets.$inferSelect;
  readonly qrPayload: string;
  // Dikembalikan sekali ke klien; DB hanya menyimpan hash-nya.
  readonly accessToken: string;
  readonly replayed: boolean;
}

/**
 * Checkout Cash (LP-08, BR-TRX-08, DRD Architecture §5.2):
 * order RESERVED dengan batas reservasi, kuota ditahan, QR Tiket langsung
 * terbit, email CASH_RESERVATION masuk outbox. Harus dipanggil di dalam
 * withTenant (tenant dari Host header).
 */
export async function createCashOrder(
  repo: TenantScopedRepository,
  rawInput: unknown,
  deps: CreateCashOrderDeps,
): Promise<CashOrderResult> {
  const input = parseInput(createCashOrderInputSchema, rawInput);
  const now = deps.now ?? new Date();
  const { tx, eventId } = repo;

  if (input.idempotencyKey) {
    // Serialisasi request dengan Idempotency-Key yang sama (klik/jaringan ganda).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${eventId}:${input.idempotencyKey}`}, 0))`,
    );
    const existing = await repo.findFirst(orders, eq(orders.idempotencyKey, input.idempotencyKey));
    if (existing) return replayCashOrder(repo, existing, deps.qrSigningKey);
  }

  const event = assertEventSellable(await repo.getEvent(), now);
  if (!event.cashEnabled) throw new PaymentMethodUnavailableError("CASH");

  const expiresAt = computeCashExpiresAt(event);
  if (expiresAt <= now) throw new SalesClosedError();

  const lines = await allocateOrderLines(tx, event, input.items, now);

  const accessToken = generateToken();
  const order = await insertOrderWithUniqueCode(tx, {
    eventId,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    customerEmail: input.customer.email,
    paymentMethod: "CASH",
    status: initialOrderStatus("CASH"),
    totalAmount: computeOrderTotal(lines),
    expiresAt,
    accessTokenHash: sha256(accessToken),
    idempotencyKey: input.idempotencyKey ?? null,
    createdIp: deps.createdIp ?? null,
  });
  const items = await tx
    .insert(orderItems)
    .values(lines.map((line) => ({ ...line, eventId, orderId: order.id })))
    .returning();
  const { ticket, qrPayload } = await issueTicket(tx, {
    eventId,
    orderId: order.id,
    qrSigningKey: deps.qrSigningKey,
    now,
  });
  await tx.insert(emailOutbox).values({
    eventId,
    orderId: order.id,
    type: "CASH_RESERVATION",
    toEmail: order.customerEmail,
    payload: { orderCode: order.orderCode },
  });

  return { order, items, ticket, qrPayload, accessToken, replayed: false };
}

// Request ulang dengan Idempotency-Key sama → order yang sama, token akses baru.
async function replayCashOrder(
  repo: TenantScopedRepository,
  order: typeof orders.$inferSelect,
  qrSigningKey: Buffer,
): Promise<CashOrderResult> {
  const ticket = await repo.findFirst(tickets, eq(tickets.orderId, order.id));
  if (!ticket) throw new Error("Order Cash tanpa QR Tiket.");
  const items = await repo.findMany(orderItems, eq(orderItems.orderId, order.id));
  const accessToken = generateToken();
  const [updated] = await repo.update(
    orders,
    { accessTokenHash: sha256(accessToken) },
    eq(orders.id, order.id),
  );
  return {
    order: updated ?? order,
    items,
    ticket,
    qrPayload: rebuildTicketQrPayload(ticket, qrSigningKey),
    accessToken,
    replayed: true,
  };
}
