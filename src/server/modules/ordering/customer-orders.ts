import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { maskPhone, normalizeIndonesianPhone } from "@/lib/phone";
import { emailOutbox, orderItems, orders, paymentTransactions, tickets } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { rebuildTicketQrPayload } from "@/server/modules/ticketing";
import type { TenantScopedRepository } from "@/server/tenancy";

import { OrderNotFoundError } from "./errors";
import { signLookupToken, verifyOrderAccessToken } from "./order-access";
import { EXPIRABLE_STATUSES, type OrderStatus } from "./order-state-machine";
import { expireOrderIfDue } from "./order-transitions";
import { lockTicketTypes } from "./quota";

type OrderRow = typeof orders.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;

export interface CustomerOrderDeps {
  readonly qrSigningKey: Buffer;
  readonly now: Date;
}

const normalizeOrderCode = (code: string) => code.trim().toUpperCase();

async function findOrderByCode(
  repo: TenantScopedRepository,
  orderCode: string,
): Promise<OrderRow | undefined> {
  return repo.findFirst(orders, eq(orders.orderCode, normalizeOrderCode(orderCode)));
}

/**
 * Status yang dilihat customer harus akurat walau job expire-orders belum
 * jalan: hold yang lewat batas dikedaluwarsakan di sini (kunci ticket_types
 * dulu, sesuai urutan kunci di expireOrderIfDue).
 */
async function expireIfDue(
  repo: TenantScopedRepository,
  order: OrderRow,
  now: Date,
): Promise<OrderRow> {
  const expirable = (EXPIRABLE_STATUSES as readonly OrderStatus[]).includes(order.status);
  if (!expirable || !order.expiresAt || order.expiresAt >= now) return order;
  const items = await repo.findMany(orderItems, eq(orderItems.orderId, order.id));
  await lockTicketTypes(
    repo.tx,
    repo.eventId,
    items.map((item) => item.ticketTypeId),
  );
  await expireOrderIfDue(repo.tx, { eventId: repo.eventId, orderId: order.id, now });
  return (await repo.findFirst(orders, eq(orders.id, order.id))) ?? order;
}

// QR Tiket hanya tampil untuk order RESERVED (Cash) / PAID dengan tiket aktif
// (BR-TKT-02, AC-LP-10.4).
function ticketQrPayload(order: OrderRow, ticket: TicketRow | undefined, key: Buffer) {
  if (!ticket || ticket.status === "VOID") return null;
  if (order.status !== "RESERVED" && order.status !== "PAID") return null;
  return rebuildTicketQrPayload(ticket, key);
}

/** Order milik pemegang token akses (kode salah / event lain / token salah → 404 sama). */
export async function authorizeCustomerOrder(
  repo: TenantScopedRepository,
  params: { orderCode: string; accessToken: string | null | undefined },
  deps: CustomerOrderDeps,
): Promise<OrderRow> {
  const found = await findOrderByCode(repo, params.orderCode);
  if (!found || !verifyOrderAccessToken(deps.qrSigningKey, found, params.accessToken, deps.now)) {
    throw new OrderNotFoundError();
  }
  return found;
}

// QR pembayaran aktif (Step 4) — hanya selama order menunggu pembayaran QRIS.
async function activePayment(repo: TenantScopedRepository, order: OrderRow) {
  if (order.status !== "PENDING_PAYMENT") return null;
  const [payment] = await repo.tx
    .select()
    .from(paymentTransactions)
    .where(
      repo.scope(
        paymentTransactions,
        and(eq(paymentTransactions.orderId, order.id), eq(paymentTransactions.status, "UNPAID")),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);
  return payment?.qrString
    ? {
        method: "QRIS" as const,
        qrString: payment.qrString,
        expiresAt: (order.expiresAt ?? payment.expiresAt)?.toISOString() ?? null,
      }
    : null;
}

// Status email QR Tiket (UI-UX States: klaim "sudah dikirim" hanya bila SENT).
async function ticketEmailStatus(repo: TenantScopedRepository, orderId: string) {
  const [row] = await repo.tx
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(
      repo.scope(
        emailOutbox,
        and(
          eq(emailOutbox.orderId, orderId),
          inArray(emailOutbox.type, ["TICKET_ISSUED", "CASH_RESERVATION"]),
        ),
      ),
    )
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  return row?.status ?? null;
}

/** Order + QR Tiket untuk customer (Step 5, halaman pesanan, Cek Pesanan). */
export async function getCustomerOrder(
  repo: TenantScopedRepository,
  params: { orderCode: string; accessToken: string | null | undefined },
  deps: CustomerOrderDeps,
) {
  const found = await authorizeCustomerOrder(repo, params, deps);
  const order = await expireIfDue(repo, found, deps.now);
  const [items, ticket, payment, emailStatus] = await Promise.all([
    repo.findMany(orderItems, eq(orderItems.orderId, order.id)),
    repo.findFirst(tickets, eq(tickets.orderId, order.id)),
    activePayment(repo, order),
    ticketEmailStatus(repo, order.id),
  ]);
  return {
    code: order.orderCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalAmount: Number(order.totalAmount),
    expiresAt: order.expiresAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    customer: { name: order.customerName, phoneMasked: maskPhone(order.customerPhone) },
    items: items.map((item) => ({
      name: item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
    payment,
    emailStatus,
    ticket: ticket
      ? {
          status: ticket.status,
          checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
          qrPayload: ticketQrPayload(order, ticket, deps.qrSigningKey),
        }
      : null,
  };
}

export type CustomerOrder = Awaited<ReturnType<typeof getCustomerOrder>>;

export const orderLookupInputSchema = z
  .object({
    orderCode: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(32),
    phone: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(32),
  })
  .strict();

/**
 * Cek Pesanan (LP-11, DRD API §2): kode pesanan + no HP cocok → token akses
 * baru. Gagal → "Pesanan tidak ditemukan" tanpa menyebut field yang salah.
 */
export async function lookupCustomerOrder(
  repo: TenantScopedRepository,
  rawInput: unknown,
  deps: CustomerOrderDeps,
): Promise<{ orderCode: string; accessToken: string }> {
  const input = parseInput(orderLookupInputSchema, rawInput);
  const phone = normalizeIndonesianPhone(input.phone);
  const order = await findOrderByCode(repo, input.orderCode);
  if (!order || !phone || order.customerPhone !== phone) throw new OrderNotFoundError();
  const event = await repo.getEvent();
  return {
    orderCode: order.orderCode,
    accessToken: signLookupToken(deps.qrSigningKey, order, {
      eventEndsAt: event?.endsAt ?? null,
      now: deps.now,
    }),
  };
}
