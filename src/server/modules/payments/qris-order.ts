import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { generateToken, sha256 } from "@/lib/crypto/tokens";
import { logger } from "@/lib/logger";
import type { PaymentProvider } from "@/integrations/payment-gateway/payment-provider";
import type { Database } from "@/server/db/client";
import { orderItems, orders, paymentConfigs, paymentTransactions } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import {
  allocateOrderLines,
  assertEventSellable,
  computeOrderTotal,
  createCashOrderInputSchema,
  expireOrder,
  initialOrderStatus,
  insertOrderWithUniqueCode,
  lockTicketTypes,
  PaymentMethodUnavailableError,
} from "@/server/modules/ordering";
import { withTenant, type TenantContext, type TenantScopedRepository } from "@/server/tenancy";

import type { EncryptionKey } from "./credential-crypto";
import { PaymentGatewayError } from "./errors";
import { decryptCredentials, findPaymentConfig, webhookUrlFor } from "./payment-config";

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;
type PaymentConfigRow = typeof paymentConfigs.$inferSelect;
type PaymentTransactionRow = typeof paymentTransactions.$inferSelect;

export interface QrisOrderDeps {
  readonly provider: PaymentProvider;
  readonly kek: EncryptionKey;
  readonly appUrl: string;
  readonly now?: Date;
  readonly createdIp?: string;
}

export interface QrisOrderResult {
  readonly order: OrderRow;
  readonly items: readonly OrderItemRow[];
  readonly payment: PaymentTransactionRow | null;
  readonly accessToken: string;
  readonly replayed: boolean;
}

interface PendingOrder {
  readonly order: OrderRow;
  readonly items: readonly OrderItemRow[];
  readonly config: PaymentConfigRow;
  readonly accessToken: string;
  readonly attempt: number;
  readonly payment: PaymentTransactionRow | null;
  readonly replayed: boolean;
}

const MINUTE_MS = 60_000;

// Hanya field non-sensitif dari respons gateway yang disimpan (DRD §3.4).
function safeRaw(raw: unknown): Record<string, unknown> {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const keep = ["reference", "merchant_ref", "payment_method", "status", "amount", "total_fee"];
  return Object.fromEntries(keep.filter((key) => key in data).map((key) => [key, data[key]]));
}

async function latestTransaction(repo: TenantScopedRepository, orderId: string) {
  const [row] = await repo.tx
    .select()
    .from(paymentTransactions)
    .where(repo.scope(paymentTransactions, eq(paymentTransactions.orderId, orderId)))
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);
  return row;
}

async function countTransactions(repo: TenantScopedRepository, orderId: string) {
  const [row] = await repo.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentTransactions)
    .where(repo.scope(paymentTransactions, eq(paymentTransactions.orderId, orderId)));
  return row?.count ?? 0;
}

/** Fase A (satu transaksi DB): validasi, alokasi kuota, order PENDING_PAYMENT. */
async function reserveQrisOrder(
  repo: TenantScopedRepository,
  rawInput: unknown,
  deps: QrisOrderDeps,
  now: Date,
): Promise<PendingOrder> {
  const input = parseInput(createCashOrderInputSchema, rawInput);
  const { tx, eventId } = repo;
  const config = await findPaymentConfig(repo);
  if (config?.status !== "CONNECTED") throw new PaymentMethodUnavailableError("QRIS");

  if (input.idempotencyKey) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${eventId}:${input.idempotencyKey}`}, 0))`,
    );
    const existing = await repo.findFirst(orders, eq(orders.idempotencyKey, input.idempotencyKey));
    if (existing) {
      // Replay: order yang sama + token akses baru.
      const accessToken = generateToken();
      const [order] = await repo.update(
        orders,
        { accessTokenHash: sha256(accessToken) },
        eq(orders.id, existing.id),
      );
      const items = await repo.findMany(orderItems, eq(orderItems.orderId, existing.id));
      const payment = (await latestTransaction(repo, existing.id)) ?? null;
      return {
        order: order ?? existing,
        items,
        config,
        accessToken,
        attempt: (await countTransactions(repo, existing.id)) + 1,
        payment,
        replayed: true,
      };
    }
  }

  const event = assertEventSellable(await repo.getEvent(), now);
  const lines = await allocateOrderLines(tx, event, input.items, now);
  // BR-PAY-07: batas bayar QRIS (default 15 menit), tidak melewati jam selesai.
  const paymentDeadline = new Date(now.getTime() + event.qrisExpiryMinutes * MINUTE_MS);
  const expiresAt = event.endsAt && event.endsAt < paymentDeadline ? event.endsAt : paymentDeadline;

  const accessToken = generateToken();
  const order = await insertOrderWithUniqueCode(tx, {
    eventId,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    customerEmail: input.customer.email,
    paymentMethod: "QRIS",
    status: initialOrderStatus("QRIS"),
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
  return { order, items, config, accessToken, attempt: 1, payment: null, replayed: false };
}

/** Kompensasi bila gateway gagal: order → EXPIRED + kuota dilepas (DRD §1.3 langkah 6). */
async function releaseFailedOrder(repo: TenantScopedRepository, pending: PendingOrder, now: Date) {
  await lockTicketTypes(
    repo.tx,
    repo.eventId,
    pending.items.map((item) => item.ticketTypeId),
  );
  const [order] = await repo.tx
    .select()
    .from(orders)
    .where(repo.scope(orders, eq(orders.id, pending.order.id)))
    .for("update");
  if (order?.status === "PENDING_PAYMENT") await expireOrder(repo.tx, order, now, "GATEWAY_ERROR");
}

/**
 * Checkout QRIS (DRD Architecture §5.1, LP-09): order + kuota di-commit dulu,
 * lalu QR pembayaran dibuat di gateway milik client (di luar transaksi DB),
 * lalu payment_transactions UNPAID disimpan.
 */
export async function createQrisOrder(
  db: Database,
  context: TenantContext,
  rawInput: unknown,
  deps: QrisOrderDeps,
): Promise<QrisOrderResult> {
  const now = deps.now ?? new Date();
  const pending = await withTenant(db, context, (repo) =>
    reserveQrisOrder(repo, rawInput, deps, now),
  );
  const done = (payment: PaymentTransactionRow | null): QrisOrderResult => ({
    order: pending.order,
    items: pending.items,
    payment,
    accessToken: pending.accessToken,
    replayed: pending.replayed,
  });

  // Replay: QR aktif sudah ada, atau order sudah selesai/kedaluwarsa.
  if (pending.payment?.status === "UNPAID" || pending.order.status !== "PENDING_PAYMENT") {
    return done(pending.payment);
  }

  const { order, config } = pending;
  let created;
  try {
    created = await deps.provider.createQrisPayment(decryptCredentials(config, deps.kek), {
      merchantRef: `${order.orderCode}-${pending.attempt}`,
      amount: Number(order.totalAmount),
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      items: pending.items.map((item) => ({
        sku: item.ticketTypeId,
        name: item.ticketTypeName,
        price: Number(item.unitPrice),
        quantity: item.quantity,
      })),
      expiresAt: order.expiresAt ?? now,
      callbackUrl: webhookUrlFor(deps.appUrl, config.webhookKey),
    });
  } catch (error) {
    // Tanpa secret: hanya pesan dari adapter.
    logger.warn("Gagal membuat QRIS", {
      eventId: context.eventId,
      orderCode: order.orderCode,
      error: error instanceof Error ? error.message : String(error),
    });
    await withTenant(db, context, (repo) => releaseFailedOrder(repo, pending, now));
    throw new PaymentGatewayError();
  }

  const payment = await withTenant(db, context, (repo) =>
    repo.insert(paymentTransactions, {
      orderId: order.id,
      paymentConfigId: config.id,
      provider: config.provider,
      merchantRef: `${order.orderCode}-${pending.attempt}`,
      providerReference: created.providerReference,
      channel: created.channel,
      amount: order.totalAmount,
      feeAmount: created.feeAmount === null ? null : BigInt(Math.round(created.feeAmount)),
      status: "UNPAID",
      qrString: created.qrString,
      qrImageUrl: created.qrImageUrl,
      expiresAt: order.expiresAt,
      rawCreateResponse: safeRaw(created.raw),
    }),
  );
  return done(payment);
}

/** QR pembayaran aktif sebuah order (Step 4, halaman pesanan). */
export async function findActivePayment(
  repo: TenantScopedRepository,
  orderId: string,
): Promise<PaymentTransactionRow | undefined> {
  return repo.findFirst(
    paymentTransactions,
    and(eq(paymentTransactions.orderId, orderId), eq(paymentTransactions.status, "UNPAID")),
  );
}
