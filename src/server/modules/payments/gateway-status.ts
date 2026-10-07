import "server-only";

import { eq } from "drizzle-orm";

import type { GatewayPaymentStatus } from "@/integrations/payment-gateway/payment-provider";
import { emailOutbox, orderItems, orders, paymentTransactions } from "@/server/db/schema";
import {
  allocateQuota,
  expireOrder,
  lockTicketTypes,
  QuotaInsufficientError,
  transitionOrderStatus,
} from "@/server/modules/ordering";
import { issueTicket } from "@/server/modules/ticketing";
import type { TenantScopedRepository } from "@/server/tenancy";

type OrderRow = typeof orders.$inferSelect;

export type ApplyResult = "APPLIED" | "IGNORED" | "NEEDS_REVIEW";

export interface ApplyGatewayStatusDeps {
  readonly qrSigningKey: Buffer;
  readonly now: Date;
  readonly via: "GATEWAY_WEBHOOK" | "GATEWAY_RECONCILE";
}

/**
 * Terapkan status dari gateway ke order QRIS (DRD Integrations §1.4 langkah 7;
 * dipakai webhook, rekonsiliasi, dan tombol "Cek Status"). Idempoten:
 * order yang sudah PAID tidak berubah lagi (BR-PAY-05).
 * Urutan kunci: ticket_types → orders → payment_transactions.
 */
export async function applyGatewayStatus(
  repo: TenantScopedRepository,
  transactionId: string,
  report: GatewayPaymentStatus,
  deps: ApplyGatewayStatusDeps,
): Promise<ApplyResult> {
  const { tx } = repo;
  const transaction = await repo.findFirst(
    paymentTransactions,
    eq(paymentTransactions.id, transactionId),
  );
  if (!transaction) return "IGNORED";
  const items = await repo.findMany(orderItems, eq(orderItems.orderId, transaction.orderId));
  await lockTicketTypes(
    tx,
    repo.eventId,
    items.map((item) => item.ticketTypeId),
  );
  const [order] = await tx
    .select()
    .from(orders)
    .where(repo.scope(orders, eq(orders.id, transaction.orderId)))
    .for("update");
  if (!order) return "IGNORED";
  await tx
    .select({ id: paymentTransactions.id })
    .from(paymentTransactions)
    .where(repo.scope(paymentTransactions, eq(paymentTransactions.id, transaction.id)))
    .for("update");

  await repo.update(
    paymentTransactions,
    { status: report.status, paidAt: report.paidAt },
    eq(paymentTransactions.id, transaction.id),
  );

  const flagForReview = async () => {
    await repo.update(orders, { needsReview: true }, eq(orders.id, order.id));
    return "NEEDS_REVIEW" as const;
  };

  if (report.status === "PAID") {
    // BR-PAY-06: nominal berbeda → tidak ditandai Lunas, perlu ditinjau.
    if (report.amount !== Number(order.totalAmount)) return flagForReview();
    if (order.status === "PAID") return "IGNORED";
    if (order.status === "PENDING_PAYMENT") {
      await markPaid(repo, order, report, deps);
      return "APPLIED";
    }
    if (order.status === "EXPIRED") {
      // BR-PAY-08: bayar setelah kedaluwarsa → alokasi ulang bila kuota masih ada.
      try {
        await tx.transaction((savepoint) =>
          allocateQuota(
            savepoint,
            repo.eventId,
            items.map((item) => ({ ticketTypeId: item.ticketTypeId, quantity: item.quantity })),
            deps.now,
          ),
        );
      } catch (error) {
        if (error instanceof QuotaInsufficientError) return flagForReview();
        throw error;
      }
      await markPaid(repo, order, report, deps);
      return "APPLIED";
    }
    return flagForReview();
  }

  if (
    (report.status === "EXPIRED" || report.status === "FAILED") &&
    order.status === "PENDING_PAYMENT"
  ) {
    await expireOrder(tx, order, deps.now, "GATEWAY_EXPIRED");
    return "APPLIED";
  }
  return "IGNORED";
}

async function markPaid(
  repo: TenantScopedRepository,
  order: OrderRow,
  report: GatewayPaymentStatus,
  deps: ApplyGatewayStatusDeps,
): Promise<void> {
  await transitionOrderStatus(repo.tx, order, "PAID", {
    paidAt: report.paidAt ?? deps.now,
    paidVia: deps.via,
  });
  await issueTicket(repo.tx, {
    eventId: repo.eventId,
    orderId: order.id,
    qrSigningKey: deps.qrSigningKey,
    now: deps.now,
  });
  await repo.insert(emailOutbox, {
    orderId: order.id,
    type: "TICKET_ISSUED",
    toEmail: order.customerEmail,
    payload: { orderCode: order.orderCode },
  });
}
