import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { formatPhoneNational, maskPhone } from "@/lib/phone";
import { orderItems, orders, tickets, users } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  decodeOrderCursor,
  effectiveOrderStatus,
  encodeOrderCursor,
  phoneSearchDigits,
  pickupStatus,
  type PickupStatus,
} from "./admin-order-status";
import { OrderNotFoundError } from "./errors";
import type { OrderStatus, PaymentMethod } from "./order-state-machine";
import { adminOrderListQuerySchema } from "./schemas";

// Read model Admin Dashboard (ADM-03..06, DRD API §5). Semua query lewat
// repo.scope() → selalu WHERE event_id = tenant (AI-CODING-RULES I-1).

type OrderRow = typeof orders.$inferSelect;
type PaidVia = NonNullable<OrderRow["paidVia"]>;

const ticketJoin = and(eq(tickets.eventId, orders.eventId), eq(tickets.orderId, orders.id));

// Hold yang masih berlaku: belum lewat expires_at (DRD §Database 5.1).
const activeHold = (status: "PENDING_PAYMENT" | "RESERVED", now: Date) =>
  and(eq(orders.status, status), gte(orders.expiresAt, now));

const dueHold = (now: Date) =>
  and(inArray(orders.status, ["PENDING_PAYMENT", "RESERVED"]), lt(orders.expiresAt, now));

/** Filter status bayar memakai status efektif (lihat effectiveOrderStatus). */
function statusCondition(status: OrderStatus, now: Date): SQL | undefined {
  switch (status) {
    case "PENDING_PAYMENT":
    case "RESERVED":
      return activeHold(status, now);
    case "EXPIRED":
      return or(eq(orders.status, "EXPIRED"), dueHold(now));
    default:
      return eq(orders.status, status);
  }
}

// Default daftar: sembunyikan PENDING_PAYMENT/EXPIRED (DRD API §5, UI-UX §3.1 Rekomendasi).
const finishedCondition = (now: Date) =>
  or(inArray(orders.status, ["PAID", "CANCELLED", "REFUNDED"]), activeHold("RESERVED", now));

const escapeLike = (value: string) => value.replace(/[%_\\]/g, "\\$&");

function searchCondition(query: string): SQL | undefined {
  const pattern = `%${escapeLike(query)}%`;
  const digits = phoneSearchDigits(query);
  return or(
    ilike(orders.customerName, pattern),
    ilike(orders.orderCode, pattern),
    digits ? like(orders.customerPhone, `%${digits}%`) : undefined,
  );
}

// --- ADM-03: Ringkasan --------------------------------------------------------

export interface AdminSummary {
  /** Tiket di order Lunas + reservasi Cash yang masih berlaku (BR-RPT-02, asumsi). */
  readonly sold: number;
  readonly paid: number;
  /** Tiket reservasi Cash yang belum dibayar dan belum lewat batas. */
  readonly unpaid: number;
  readonly pickedUp: number;
}

/** Kartu Terjual / Lunas / Belum / Diambil — satuan tiket (AC-ADM-03.1). */
export async function getAdminSummary(
  repo: TenantScopedRepository,
  now = new Date(),
): Promise<AdminSummary> {
  const quantity = (condition: SQL | undefined) =>
    sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${condition}), 0)::int`;
  const [row] = await repo.tx
    .select({
      paid: quantity(eq(orders.status, "PAID")),
      unpaid: quantity(activeHold("RESERVED", now)),
      pickedUp: quantity(and(eq(orders.status, "PAID"), eq(tickets.status, "CHECKED_IN"))),
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.eventId, orderItems.eventId), eq(orders.id, orderItems.orderId)),
    )
    .leftJoin(tickets, ticketJoin)
    .where(repo.scope(orderItems));
  const paid = row?.paid ?? 0;
  const unpaid = row?.unpaid ?? 0;
  return { sold: paid + unpaid, paid, unpaid, pickedUp: row?.pickedUp ?? 0 };
}

// --- ADM-04/05: Daftar Transaksi ------------------------------------------------

export interface AdminOrderListItem {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  /** Dimasking di daftar; lengkap hanya di Detail (UI-UX Responsive §4). */
  readonly customerPhoneMasked: string;
  readonly items: ReadonlyArray<{ readonly name: string; readonly quantity: number }>;
  readonly paymentMethod: PaymentMethod;
  readonly status: OrderStatus;
  readonly expiresAt: Date | null;
  readonly pickup: PickupStatus | null;
  readonly totalAmount: bigint;
  readonly createdAt: Date;
}

export interface AdminOrderList {
  readonly data: readonly AdminOrderListItem[];
  readonly nextCursor: string | null;
  /** Jumlah hasil sesuai filter (AC-ADM-05.1), tanpa memperhitungkan cursor. */
  readonly total: number;
}

export async function listAdminOrders(
  repo: TenantScopedRepository,
  rawQuery: unknown,
  now = new Date(),
): Promise<AdminOrderList> {
  const query = parseInput(adminOrderListQuerySchema, rawQuery);
  const cursor = query.cursor ? decodeOrderCursor(query.cursor) : null;

  const filters: Array<SQL | undefined> = [
    query.status
      ? statusCondition(query.status, now)
      : query.includeUnfinished
        ? undefined
        : finishedCondition(now),
    query.method ? eq(orders.paymentMethod, query.method) : undefined,
    query.pickup === "done" ? eq(tickets.status, "CHECKED_IN") : undefined,
    query.pickup === "pending"
      ? and(
          eq(tickets.status, "ISSUED"),
          or(eq(orders.status, "PAID"), activeHold("RESERVED", now)),
        )
      : undefined,
    query.q ? searchCondition(query.q) : undefined,
  ];

  const createdAtIso = sql<string>`to_char(${orders.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const rows = await repo.tx
    .select({ order: orders, ticketStatus: tickets.status, createdAtIso })
    .from(orders)
    .leftJoin(tickets, ticketJoin)
    .where(
      repo.scope(
        orders,
        ...filters,
        cursor
          ? sql`(${orders.createdAt}, ${orders.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(query.limit + 1);

  const [countRow] = await repo.tx
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(tickets, ticketJoin)
    .where(repo.scope(orders, ...filters));

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const itemsByOrder = await loadItemNames(
    repo,
    page.map((row) => row.order.id),
  );

  return {
    data: page.map(({ order, ticketStatus }) => {
      const status = effectiveOrderStatus(order, now);
      return {
        id: order.id,
        code: order.orderCode,
        customerName: order.customerName,
        customerPhoneMasked: maskPhone(order.customerPhone),
        items: itemsByOrder.get(order.id) ?? [],
        paymentMethod: order.paymentMethod,
        status,
        expiresAt: order.expiresAt,
        pickup: pickupStatus(ticketStatus, status),
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
      };
    }),
    nextCursor:
      rows.length > query.limit && last
        ? encodeOrderCursor({ createdAt: last.createdAtIso, id: last.order.id })
        : null,
    total: countRow?.total ?? 0,
  };
}

async function loadItemNames(repo: TenantScopedRepository, orderIds: readonly string[]) {
  const byOrder = new Map<string, Array<{ name: string; quantity: number }>>();
  if (orderIds.length === 0) return byOrder;
  const rows = await repo.tx
    .select({
      orderId: orderItems.orderId,
      name: orderItems.ticketTypeName,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(repo.scope(orderItems, inArray(orderItems.orderId, [...orderIds])))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.ticketTypeName));
  for (const row of rows) {
    const list = byOrder.get(row.orderId) ?? [];
    list.push({ name: row.name, quantity: row.quantity });
    byOrder.set(row.orderId, list);
  }
  return byOrder;
}

// --- ADM-06: Detail Transaksi ---------------------------------------------------

export type AdminOrderHistoryKind =
  "CREATED" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "CHECKED_IN" | "REISSUED";

export interface AdminOrderHistoryEntry {
  readonly kind: AdminOrderHistoryKind;
  readonly at: Date;
  /** Nama admin yang melakukan aksi; null = pembeli / sistem / gateway. */
  readonly actorName: string | null;
  readonly paidVia?: PaidVia;
  /** Kode pesanan terkait (reissue) atau alasan/catatan (batal/refund). */
  readonly note?: string;
}

export interface AdminOrderDetail {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly paymentMethod: PaymentMethod;
  readonly totalAmount: bigint;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly paidVia: PaidVia | null;
  readonly needsReview: boolean;
  readonly customer: { readonly name: string; readonly phone: string; readonly email: string };
  readonly items: ReadonlyArray<{
    readonly name: string;
    readonly quantity: number;
    readonly unitPrice: bigint;
  }>;
  readonly pickup: PickupStatus | null;
  readonly ticket: {
    readonly status: "ISSUED" | "CHECKED_IN" | "VOID";
    readonly checkedInAt: Date | null;
    readonly checkedInBy: string | null;
  } | null;
  readonly reissuedFrom: { readonly id: string; readonly code: string } | null;
  readonly reissuedTo: { readonly id: string; readonly code: string } | null;
  readonly history: readonly AdminOrderHistoryEntry[];
}

const uuid = z.uuid();

export async function getAdminOrderDetail(
  repo: TenantScopedRepository,
  orderId: string,
  now = new Date(),
): Promise<AdminOrderDetail> {
  // ID bukan UUID / milik tenant lain → 404 yang sama (AI-CODING-RULES I-2).
  if (!uuid.safeParse(orderId).success) throw new OrderNotFoundError();
  const order = await repo.findFirst(orders, eq(orders.id, orderId));
  if (!order) throw new OrderNotFoundError();

  const items = await repo.tx
    .select()
    .from(orderItems)
    .where(repo.scope(orderItems, eq(orderItems.orderId, order.id)))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.ticketTypeName));
  const ticket = await repo.findFirst(tickets, eq(tickets.orderId, order.id));
  const reissuedTo = await repo.findFirst(orders, eq(orders.reissuedFromOrderId, order.id));
  const reissuedFrom = order.reissuedFromOrderId
    ? await repo.findFirst(orders, eq(orders.id, order.reissuedFromOrderId))
    : undefined;

  const names = await loadUserNames(repo, [
    order.cashConfirmedBy,
    order.cancelledBy,
    order.refundMarkedBy,
    ticket?.checkedInBy ?? null,
    reissuedTo?.cashConfirmedBy ?? null,
  ]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

  const status = effectiveOrderStatus(order, now);
  const history: AdminOrderHistoryEntry[] = [
    {
      kind: "CREATED",
      at: order.createdAt,
      actorName: null,
      ...(reissuedFrom ? { note: reissuedFrom.orderCode } : {}),
    },
  ];
  if (order.paidAt) {
    history.push({
      kind: "PAID",
      at: order.paidAt,
      actorName: nameOf(order.cashConfirmedBy),
      ...(order.paidVia ? { paidVia: order.paidVia } : {}),
    });
  }
  if (status === "EXPIRED" && order.expiresAt) {
    history.push({ kind: "EXPIRED", at: order.expiresAt, actorName: null });
  }
  if (order.cancelledAt) {
    history.push({
      kind: "CANCELLED",
      at: order.cancelledAt,
      actorName: nameOf(order.cancelledBy),
      ...(order.cancelReason ? { note: order.cancelReason } : {}),
    });
  }
  if (order.refundMarkedAt) {
    history.push({
      kind: "REFUNDED",
      at: order.refundMarkedAt,
      actorName: nameOf(order.refundMarkedBy),
      ...(order.refundNote ? { note: order.refundNote } : {}),
    });
  }
  if (ticket?.checkedInAt) {
    history.push({
      kind: "CHECKED_IN",
      at: ticket.checkedInAt,
      actorName: nameOf(ticket.checkedInBy),
    });
  }
  if (reissuedTo) {
    history.push({
      kind: "REISSUED",
      at: reissuedTo.createdAt,
      actorName: nameOf(reissuedTo.cashConfirmedBy),
      note: reissuedTo.orderCode,
    });
  }
  history.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    id: order.id,
    code: order.orderCode,
    status,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    paidVia: order.paidVia,
    needsReview: order.needsReview,
    customer: {
      name: order.customerName,
      phone: formatPhoneNational(order.customerPhone),
      email: order.customerEmail,
    },
    items: items.map((item) => ({
      name: item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    pickup: pickupStatus(ticket?.status ?? null, status),
    ticket: ticket
      ? {
          status: ticket.status,
          checkedInAt: ticket.checkedInAt,
          checkedInBy: nameOf(ticket.checkedInBy),
        }
      : null,
    reissuedFrom: reissuedFrom ? { id: reissuedFrom.id, code: reissuedFrom.orderCode } : null,
    reissuedTo: reissuedTo ? { id: reissuedTo.id, code: reissuedTo.orderCode } : null,
    history,
  };
}

// Nama admin untuk riwayat (users bukan tabel tenant; hanya id yang dirujuk order ini).
async function loadUserNames(
  repo: TenantScopedRepository,
  ids: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const rows = await repo.tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}
