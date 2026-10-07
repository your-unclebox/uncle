import "server-only";

import { and, desc, eq, gte, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { phoneSearchDigits, toNationalPhone } from "@/lib/phone";
import { auditLogs, emailOutbox, orderItems, orders, tickets } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { findUserNames } from "@/server/modules/identity/user-names";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  ActorRequiredError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderNotReservedError,
  ReservationExpiredError,
} from "./errors";
import type { OrderStatus } from "./order-state-machine";
import { transitionOrderStatus } from "./order-transitions";
import { adminOrderListQuerySchema, confirmCashInputSchema } from "./schemas";

type Order = typeof orders.$inferSelect;

// ID di path yang bukan UUID = pesanan tidak ada (404), bukan error query.
const isUuid = (value: string) => z.uuid().safeParse(value).success;
type Ticket = typeof tickets.$inferSelect;

// --- ADM-03 Ringkasan ---------------------------------------------------------

export interface EventSummary {
  /** Tiket (bukan transaksi) — BR-RPT-02: Lunas + Reserved yang belum lewat batas. */
  readonly sold: number;
  readonly paid: number;
  readonly unpaid: number;
  readonly pickedUp: number;
}

export async function getEventSummary(
  repo: TenantScopedRepository,
  now = new Date(),
): Promise<EventSummary> {
  const activeReservation = and(eq(orders.status, "RESERVED"), gte(orders.expiresAt, now));
  const [row] = await repo.tx
    .select({
      paid: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orders.status} = 'PAID'), 0)::int`,
      unpaid: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${activeReservation}), 0)::int`,
      pickedUp: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${tickets.status} = 'CHECKED_IN'), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.eventId, orderItems.eventId), eq(orders.id, orderItems.orderId)),
    )
    .leftJoin(tickets, and(eq(tickets.eventId, orders.eventId), eq(tickets.orderId, orders.id)))
    .where(repo.scope(orderItems));
  const paid = row?.paid ?? 0;
  const unpaid = row?.unpaid ?? 0;
  return { sold: paid + unpaid, paid, unpaid, pickedUp: row?.pickedUp ?? 0 };
}

// --- ADM-04/05 Daftar, filter & cari -----------------------------------------

export interface AdminOrderRow {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly paymentMethod: Order["paymentMethod"];
  readonly status: OrderStatus;
  readonly ticketStatus: Ticket["status"] | null;
  readonly items: ReadonlyArray<{ name: string; quantity: number }>;
  readonly totalAmount: bigint;
  readonly expiresAt: Date | null;
  readonly needsReview: boolean;
  readonly createdAt: Date;
}

export interface AdminOrderList {
  readonly orders: AdminOrderRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const UNFINISHED: OrderStatus[] = ["PENDING_PAYMENT", "EXPIRED"];
const escapeLike = (value: string) => value.replace(/[%_\\]/g, "\\$&");

function searchCondition(q: string): SQL | undefined {
  const pattern = `%${escapeLike(q)}%`;
  const digits = phoneSearchDigits(q);
  return or(
    ilike(orders.customerName, pattern),
    ilike(orders.orderCode, pattern),
    digits ? ilike(orders.customerPhone, `%${digits}%`) : undefined,
  );
}

export async function listAdminOrders(
  repo: TenantScopedRepository,
  rawQuery: unknown,
): Promise<AdminOrderList> {
  const query = parseInput(adminOrderListQuerySchema, rawQuery);
  const conditions: Array<SQL | undefined> = [
    query.status ? eq(orders.status, query.status) : undefined,
    // Filter status eksplisit selalu menang atas default "sembunyikan belum selesai".
    !query.status && !query.includeUnfinished ? notInArray(orders.status, UNFINISHED) : undefined,
    query.method ? eq(orders.paymentMethod, query.method) : undefined,
    query.pickup === "done" ? eq(tickets.status, "CHECKED_IN") : undefined,
    query.pickup === "pending" ? eq(tickets.status, "ISSUED") : undefined,
    query.q ? searchCondition(query.q) : undefined,
  ];

  const rows = await repo.tx
    .select({
      order: orders,
      ticketStatus: tickets.status,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(orders)
    .leftJoin(tickets, and(eq(tickets.eventId, orders.eventId), eq(tickets.orderId, orders.id)))
    .where(repo.scope(orders, ...conditions))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const itemsByOrder = await loadItems(
    repo,
    rows.map((row) => row.order.id),
  );
  return {
    orders: rows.map(({ order, ticketStatus }) => ({
      id: order.id,
      code: order.orderCode,
      customerName: order.customerName,
      customerPhone: toNationalPhone(order.customerPhone),
      paymentMethod: order.paymentMethod,
      status: order.status,
      ticketStatus,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        name: item.ticketTypeName,
        quantity: item.quantity,
      })),
      totalAmount: order.totalAmount,
      expiresAt: order.expiresAt,
      needsReview: order.needsReview,
      createdAt: order.createdAt,
    })),
    total: rows[0]?.total ?? (query.page > 1 ? await countOrders(repo, conditions) : 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

// Halaman di luar jangkauan tidak punya baris untuk count(*) over ().
async function countOrders(repo: TenantScopedRepository, conditions: Array<SQL | undefined>) {
  const [row] = await repo.tx
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(tickets, and(eq(tickets.eventId, orders.eventId), eq(tickets.orderId, orders.id)))
    .where(repo.scope(orders, ...conditions));
  return row?.total ?? 0;
}

async function loadItems(repo: TenantScopedRepository, orderIds: string[]) {
  const map = new Map<string, Array<typeof orderItems.$inferSelect>>();
  if (orderIds.length === 0) return map;
  const items = await repo.findMany(orderItems, inArray(orderItems.orderId, orderIds));
  for (const item of items.sort((a, b) => a.ticketTypeName.localeCompare(b.ticketTypeName))) {
    map.set(item.orderId, [...(map.get(item.orderId) ?? []), item]);
  }
  return map;
}

// --- ADM-06 Detail -----------------------------------------------------------

export interface AdminOrderHistoryEntry {
  readonly at: Date;
  readonly label: string;
}

export interface AdminOrderDetail {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly paymentMethod: Order["paymentMethod"];
  readonly customer: { name: string; phone: string; email: string };
  readonly items: ReadonlyArray<{ name: string; quantity: number; unitPrice: bigint }>;
  readonly totalAmount: bigint;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly paidVia: Order["paidVia"];
  readonly cashConfirmedBy: string | null;
  readonly needsReview: boolean;
  readonly ticket: {
    id: string;
    status: Ticket["status"];
    checkedInAt: Date | null;
    checkedInBy: string | null;
  } | null;
  readonly emailStatus: string | null;
  readonly reissuedFrom: { id: string; code: string } | null;
  readonly reissuedTo: { id: string; code: string } | null;
  readonly history: AdminOrderHistoryEntry[];
}

const PAID_VIA_LABEL: Record<NonNullable<Order["paidVia"]>, string> = {
  GATEWAY_WEBHOOK: "Lunas (QRIS, webhook)",
  GATEWAY_RECONCILE: "Lunas (QRIS, cek status)",
  CASH_MANUAL: "Lunas (Cash)",
};

export async function getAdminOrderDetail(
  repo: TenantScopedRepository,
  orderId: string,
): Promise<AdminOrderDetail> {
  if (!isUuid(orderId)) throw new OrderNotFoundError();
  const order = await repo.findFirst(orders, eq(orders.id, orderId));
  if (!order) throw new OrderNotFoundError();
  const [items, ticket, reissuedTo, reissuedFrom, emails] = await Promise.all([
    repo.findMany(orderItems, eq(orderItems.orderId, order.id)),
    repo.findFirst(tickets, eq(tickets.orderId, order.id)),
    repo.findFirst(orders, eq(orders.reissuedFromOrderId, order.id)),
    order.reissuedFromOrderId
      ? repo.findFirst(orders, eq(orders.id, order.reissuedFromOrderId))
      : Promise.resolve(undefined),
    repo.findMany(
      emailOutbox,
      and(
        eq(emailOutbox.orderId, order.id),
        inArray(emailOutbox.type, ["TICKET_ISSUED", "CASH_RESERVATION"]),
      ),
    ),
  ]);
  const names = await findUserNames(repo.tx, [
    order.cashConfirmedBy,
    order.cancelledBy,
    order.refundMarkedBy,
    ticket?.checkedInBy,
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
  const by = (id: string | null | undefined) => (nameOf(id) ? `, oleh ${nameOf(id)}` : "");

  const history: AdminOrderHistoryEntry[] = [
    {
      at: order.createdAt,
      label: reissuedFrom
        ? `Pesanan dibuat dari reservasi kedaluwarsa ${reissuedFrom.orderCode}${by(order.cashConfirmedBy)}`
        : "Pesanan dibuat",
    },
  ];
  if (order.paidAt && order.paidVia) {
    history.push({
      at: order.paidAt,
      label: `${PAID_VIA_LABEL[order.paidVia]}${by(order.cashConfirmedBy)}`,
    });
  }
  if (order.status === "EXPIRED") {
    history.push({
      at: ticket?.voidedAt ?? order.expiresAt ?? order.updatedAt,
      label: "Kedaluwarsa",
    });
  }
  if (order.cancelledAt) {
    history.push({ at: order.cancelledAt, label: `Dibatalkan${by(order.cancelledBy)}` });
  }
  if (order.refundMarkedAt) {
    history.push({ at: order.refundMarkedAt, label: `Ditandai refund${by(order.refundMarkedBy)}` });
  }
  if (ticket?.checkedInAt) {
    history.push({ at: ticket.checkedInAt, label: `Tiket diambil${by(ticket.checkedInBy)}` });
  }
  if (reissuedTo) {
    history.push({
      at: reissuedTo.createdAt,
      label: `Dibuatkan pesanan baru ${reissuedTo.orderCode}`,
    });
  }
  history.sort((a, b) => a.at.getTime() - b.at.getTime());

  const email = emails[0];
  return {
    id: order.id,
    code: order.orderCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    customer: {
      name: order.customerName,
      phone: toNationalPhone(order.customerPhone),
      email: order.customerEmail,
    },
    items: items
      .sort((a, b) => a.ticketTypeName.localeCompare(b.ticketTypeName))
      .map((item) => ({
        name: item.ticketTypeName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    paidVia: order.paidVia,
    cashConfirmedBy: nameOf(order.cashConfirmedBy),
    needsReview: order.needsReview,
    ticket: ticket
      ? {
          id: ticket.id,
          status: ticket.status,
          checkedInAt: ticket.checkedInAt,
          checkedInBy: nameOf(ticket.checkedInBy),
        }
      : null,
    emailStatus: email?.status ?? null,
    reissuedFrom: reissuedFrom ? { id: reissuedFrom.id, code: reissuedFrom.orderCode } : null,
    reissuedTo: reissuedTo ? { id: reissuedTo.id, code: reissuedTo.orderCode } : null,
    history,
  };
}

// --- SCN-04 Konfirmasi Lunas (Cash) ------------------------------------------

/**
 * RESERVED → PAID oleh admin setelah menerima uang (BR-PAY-04). QRIS tidak
 * bisa ditandai Lunas manual (BR-PAY-03). Reservasi yang sudah lewat batas
 * ditolak tanpa mengubah apa pun — pelepasan kuota dilakukan scan/cron.
 */
export async function confirmCashPayment(
  repo: TenantScopedRepository,
  orderId: string,
  rawInput: unknown,
  deps: { now?: Date } = {},
): Promise<Order> {
  parseInput(confirmCashInputSchema, rawInput);
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  const now = deps.now ?? new Date();

  if (!isUuid(orderId)) throw new OrderNotFoundError();
  const order = await repo.findFirst(orders, eq(orders.id, orderId));
  if (!order) throw new OrderNotFoundError();
  if (order.paymentMethod !== "CASH" || order.status !== "RESERVED") {
    throw new OrderNotReservedError(order.status);
  }
  if (order.expiresAt && order.expiresAt < now) throw new ReservationExpiredError();

  let paid: Order;
  try {
    // Bersyarat status lama: admin lain / cron yang lebih dulu → 409, bukan timpa.
    paid = await transitionOrderStatus(repo.tx, order, "PAID", {
      paidAt: now,
      paidVia: "CASH_MANUAL",
      cashConfirmedBy: actorUserId,
    });
  } catch (error) {
    if (!(error instanceof InvalidOrderTransitionError)) throw error;
    const current = await repo.findFirst(orders, eq(orders.id, orderId));
    throw new OrderNotReservedError(current?.status ?? order.status);
  }
  await repo.insert(auditLogs, {
    actorUserId,
    action: "ORDER_CASH_CONFIRMED",
    entityType: "order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: paid.status, paidVia: paid.paidVia },
  });
  return paid;
}
