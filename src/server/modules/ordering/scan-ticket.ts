import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, orderItems, orders, tickets, ticketTypes } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { parseTicketQrPayload, verifyTicketQrMac } from "@/server/modules/ticketing";
import type { TenantScopedRepository } from "@/server/tenancy";

import { loadUserNames } from "./admin-orders";
import {
  ActorRequiredError,
  AlreadyCheckedInError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderNotPaidError,
  ReservationExpiredError,
  TicketNotFoundError,
} from "./errors";
import { EXPIRABLE_STATUSES, type OrderStatus, type PaymentMethod } from "./order-state-machine";
import { expireOrderIfDue, transitionOrderStatus } from "./order-transitions";
import { lockTicketTypes } from "./quota";
import { confirmCashInputSchema, scanInputSchema } from "./schemas";

// Scan Tiket (SCN-02..08, DRD API §5 & Arsitektur §5.3, Security §6).

type OrderRow = typeof orders.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;
type TicketStatus = TicketRow["status"];

export type ScanResult =
  | "READY_PICKUP"
  | "CASH_UNPAID"
  | "ALREADY_CHECKED_IN"
  | "RESERVATION_EXPIRED"
  | "CANCELLED"
  | "OTHER_EVENT"
  | "INVALID";

/** Alasan INVALID — untuk pesan "Ini QR pembayaran, bukan QR tiket" (DRD Security §6). */
export type InvalidReason = "PAYMENT_QR" | "UNKNOWN";

export interface ScanOrderView {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly paymentMethod: PaymentMethod;
  readonly status: OrderStatus;
  readonly totalAmount: bigint;
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  /** Admin yang Konfirmasi Lunas Cash (UI-UX Scan (e)); null untuk QRIS. */
  readonly paidBy: string | null;
  readonly reissuedFromOrderCode: string | null;
  readonly items: ReadonlyArray<{ readonly name: string; readonly quantity: number }>;
}

export interface ReissueSnapshot {
  readonly available: boolean;
  readonly totalAmount: bigint;
  readonly items: ReadonlyArray<{
    readonly ticketTypeId: string;
    readonly name: string;
    readonly quantity: number;
    readonly unitPrice: bigint;
    readonly remaining: number;
  }>;
  readonly reissuedOrder: {
    readonly id: string;
    readonly code: string;
    readonly createdAt: Date;
    readonly createdBy: string | null;
    readonly ticketStatus: TicketStatus | null;
  } | null;
}

export interface ScanView {
  readonly result: ScanResult;
  readonly reason?: InvalidReason;
  readonly ticket?: {
    readonly id: string;
    readonly status: TicketStatus;
    readonly checkedInAt: Date | null;
    readonly checkedInBy: string | null;
  };
  readonly order?: ScanOrderView;
  readonly reissue?: ReissueSnapshot;
  readonly actions: {
    readonly canConfirmCash: boolean;
    readonly canCheckIn: boolean;
    readonly canReissue: boolean;
  };
}

const NO_ACTIONS = { canConfirmCash: false, canCheckIn: false, canReissue: false } as const;

// QRIS EMVCo dimulai "000201" (Payload Format Indicator).
const isPaymentQr = (payload: string) => /^000201/.test(payload);

function resultOf(order: OrderRow, ticket: TicketRow): ScanResult {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return "CANCELLED";
  if (ticket.status === "CHECKED_IN") return "ALREADY_CHECKED_IN";
  if (order.status === "EXPIRED" && order.paymentMethod === "CASH") return "RESERVATION_EXPIRED";
  if (order.status === "RESERVED" && ticket.status === "ISSUED") return "CASH_UNPAID";
  if (order.status === "PAID" && ticket.status === "ISSUED") return "READY_PICKUP";
  return "INVALID";
}

/** Panel hasil untuk satu order + QR Tiket-nya (dipakai scan, Konfirmasi Lunas, check-in). */
export async function buildScanView(
  repo: TenantScopedRepository,
  order: OrderRow,
  ticket: TicketRow,
): Promise<ScanView> {
  const result = resultOf(order, ticket);
  if (result === "INVALID") return { result, reason: "UNKNOWN", actions: NO_ACTIONS };

  const items = await repo.tx
    .select()
    .from(orderItems)
    .where(repo.scope(orderItems, eq(orderItems.orderId, order.id)))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.ticketTypeName));
  const reissuedFrom = order.reissuedFromOrderId
    ? await repo.findFirst(orders, eq(orders.id, order.reissuedFromOrderId))
    : undefined;
  const reissue =
    result === "RESERVATION_EXPIRED" ? await reissueSnapshot(repo, order, items) : undefined;
  const names = await loadUserNames(repo, [order.cashConfirmedBy, ticket.checkedInBy]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

  return {
    result,
    ticket: {
      id: ticket.id,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      checkedInBy: nameOf(ticket.checkedInBy),
    },
    order: {
      id: order.id,
      code: order.orderCode,
      customerName: order.customerName,
      paymentMethod: order.paymentMethod,
      status: order.status,
      totalAmount: order.totalAmount,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      paidBy: nameOf(order.cashConfirmedBy),
      reissuedFromOrderCode: reissuedFrom?.orderCode ?? null,
      items: items.map((item) => ({ name: item.ticketTypeName, quantity: item.quantity })),
    },
    ...(reissue ? { reissue } : {}),
    actions: {
      canConfirmCash: result === "CASH_UNPAID",
      canCheckIn: result === "READY_PICKUP",
      canReissue: reissue?.available ?? false,
    },
  };
}

/**
 * Snapshot kuota SAAT INI untuk "Buat Pesanan Baru dengan Data Ini" (SCN-08,
 * UI-UX (k1)–(k3)). Final dicek ulang atomik di reissueExpiredOrder.
 */
async function reissueSnapshot(
  repo: TenantScopedRepository,
  order: OrderRow,
  items: ReadonlyArray<typeof orderItems.$inferSelect>,
): Promise<ReissueSnapshot> {
  const existing = await repo.findFirst(orders, eq(orders.reissuedFromOrderId, order.id));
  let reissuedOrder: ReissueSnapshot["reissuedOrder"] = null;
  if (existing) {
    const ticket = await repo.findFirst(tickets, eq(tickets.orderId, existing.id));
    const names = await loadUserNames(repo, [existing.cashConfirmedBy]);
    reissuedOrder = {
      id: existing.id,
      code: existing.orderCode,
      createdAt: existing.createdAt,
      createdBy: existing.cashConfirmedBy ? (names.get(existing.cashConfirmedBy) ?? null) : null,
      ticketStatus: ticket?.status ?? null,
    };
  }

  const ids = items.map((item) => item.ticketTypeId);
  const types =
    ids.length === 0
      ? []
      : await repo.tx
          .select()
          .from(ticketTypes)
          .where(repo.scope(ticketTypes, inArray(ticketTypes.id, ids)));
  const typeById = new Map(types.map((type) => [type.id, type]));
  const lines = items.map((item) => {
    const type = typeById.get(item.ticketTypeId);
    return {
      ticketTypeId: item.ticketTypeId,
      name: type?.name ?? item.ticketTypeName,
      quantity: item.quantity,
      // Harga saat ini (BR-EVT-07; PRD Q19 masih terbuka) — sama dengan reissue.
      unitPrice: type?.price ?? item.unitPrice,
      remaining: type?.isActive ? type.quota - type.allocatedCount : 0,
    };
  });
  return {
    available:
      reissuedOrder === null &&
      lines.length > 0 &&
      lines.every((line) => line.remaining >= line.quantity),
    totalAmount: lines.reduce((sum, line) => sum + line.unitPrice * BigInt(line.quantity), 0n),
    items: lines,
    reissuedOrder,
  };
}

export interface ScanDeps {
  readonly qrSigningKey: Buffer;
  /** event_id QR lintas tenant (findTicketEventId) — untuk OTHER_EVENT. */
  readonly lookupTicketEventId: (ticketId: string) => Promise<string | null>;
  readonly now?: Date;
}

/**
 * POST …/scan: validasi QR Tiket (atau kode pesanan manual) untuk event ini.
 * Reservasi lewat batas yang belum disapu cron di-EXPIRED-kan dulu (DRD API §5).
 * Setiap hasil dicatat di audit_logs.
 */
export async function scanTicket(
  repo: TenantScopedRepository,
  rawInput: unknown,
  deps: ScanDeps,
): Promise<ScanView> {
  const input = parseInput(scanInputSchema, rawInput);
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  const now = deps.now ?? new Date();

  const found = await locate(repo, input, deps);
  let view: ScanView;
  if ("result" in found) {
    view = found;
  } else {
    const { order, ticket } = await expireIfDue(repo, found.order, found.ticket, now);
    view = await buildScanView(repo, order, ticket);
  }

  await repo.insert(auditLogs, {
    actorUserId,
    action: "TICKET_SCANNED",
    entityType: "ticket",
    entityId: view.ticket?.id ?? null,
    after: {
      result: view.result,
      via: input.payload !== undefined ? "QR" : "MANUAL_CODE",
      ...(view.order ? { orderCode: view.order.code } : {}),
    },
  });
  return view;
}

async function locate(
  repo: TenantScopedRepository,
  input: z.output<typeof scanInputSchema>,
  deps: ScanDeps,
): Promise<{ order: OrderRow; ticket: TicketRow } | ScanView> {
  const invalid = (reason: InvalidReason = "UNKNOWN"): ScanView => ({
    result: "INVALID",
    reason,
    actions: NO_ACTIONS,
  });

  if (input.orderCode !== undefined) {
    const order = await repo.findFirst(orders, eq(orders.orderCode, input.orderCode));
    const ticket = order ? await repo.findFirst(tickets, eq(tickets.orderId, order.id)) : undefined;
    return order && ticket ? { order, ticket } : invalid();
  }

  const payload = input.payload ?? "";
  const parsed = parseTicketQrPayload(payload);
  if (!parsed) return invalid(isPaymentQr(payload) ? "PAYMENT_QR" : "UNKNOWN");

  if (!verifyTicketQrMac(deps.qrSigningKey, parsed, repo.eventId)) {
    // MAC mengikat event_id: valid untuk event pemilik tiket → QR event lain (tanpa data).
    const ownerEventId = await deps.lookupTicketEventId(parsed.ticketId);
    const otherEvent =
      ownerEventId !== null &&
      ownerEventId !== repo.eventId &&
      verifyTicketQrMac(deps.qrSigningKey, parsed, ownerEventId);
    return otherEvent ? { result: "OTHER_EVENT", actions: NO_ACTIONS } : invalid();
  }

  const ticket = await repo.findFirst(tickets, eq(tickets.id, parsed.ticketId));
  // qr_version naik = QR lama tidak berlaku (DRD Security §6).
  if (!ticket || ticket.qrVersion !== parsed.qrVersion) return invalid();
  const order = await repo.findFirst(orders, eq(orders.id, ticket.orderId));
  return order ? { order, ticket } : invalid();
}

async function expireIfDue(
  repo: TenantScopedRepository,
  order: OrderRow,
  ticket: TicketRow,
  now: Date,
): Promise<{ order: OrderRow; ticket: TicketRow }> {
  const due =
    (EXPIRABLE_STATUSES as readonly OrderStatus[]).includes(order.status) &&
    order.expiresAt !== null &&
    order.expiresAt < now;
  if (!due) return { order, ticket };
  // Urutan kunci ticket_types → orders (lihat expireOrderIfDue).
  const items = await repo.findMany(orderItems, eq(orderItems.orderId, order.id));
  await lockTicketTypes(
    repo.tx,
    repo.eventId,
    items.map((item) => item.ticketTypeId),
  );
  await expireOrderIfDue(repo.tx, { eventId: repo.eventId, orderId: order.id, now });
  const [freshOrder, freshTicket] = await Promise.all([
    repo.findFirst(orders, eq(orders.id, order.id)),
    repo.findFirst(tickets, eq(tickets.id, ticket.id)),
  ]);
  return { order: freshOrder ?? order, ticket: freshTicket ?? ticket };
}

const uuid = z.uuid();

/**
 * POST …/orders/{orderId}/confirm-cash (SCN-04): RESERVED → PAID oleh admin
 * setelah centang "Sudah terima uang". Hanya Cash (I-6: QRIS hanya dari gateway).
 */
export async function confirmCashPayment(
  repo: TenantScopedRepository,
  orderId: string,
  rawInput: unknown,
  deps: { readonly now?: Date } = {},
): Promise<ScanView> {
  parseInput(confirmCashInputSchema, rawInput);
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  const now = deps.now ?? new Date();
  if (!uuid.safeParse(orderId).success) throw new OrderNotFoundError();

  const [order] = await repo.tx
    .select()
    .from(orders)
    .where(repo.scope(orders, eq(orders.id, orderId)))
    .for("update");
  if (!order) throw new OrderNotFoundError();
  if (order.paymentMethod !== "CASH" || order.status !== "RESERVED") {
    throw new InvalidOrderTransitionError(order.status, "PAID");
  }
  if (order.expiresAt !== null && order.expiresAt < now) throw new ReservationExpiredError();

  const paid = await transitionOrderStatus(repo.tx, order, "PAID", {
    paidAt: now,
    paidVia: "CASH_MANUAL",
    cashConfirmedBy: actorUserId,
  });
  await repo.insert(auditLogs, {
    actorUserId,
    action: "CASH_PAYMENT_CONFIRMED",
    entityType: "order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: paid.status, paidVia: "CASH_MANUAL" },
  });
  const ticket = await repo.findFirst(tickets, eq(tickets.orderId, order.id));
  if (!ticket) throw new Error("Order Cash tanpa QR Tiket.");
  return buildScanView(repo, paid, ticket);
}

/**
 * POST …/tickets/{ticketId}/check-in (SCN-03/07, I-9): atomik — hanya satu
 * dari beberapa HP yang menang; sisanya 409 ALREADY_CHECKED_IN.
 */
export async function checkInTicket(
  repo: TenantScopedRepository,
  ticketId: string,
  deps: { readonly now?: Date } = {},
): Promise<ScanView> {
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  const now = deps.now ?? new Date();
  if (!uuid.safeParse(ticketId).success) throw new TicketNotFoundError();

  const [updated] = await repo.tx
    .update(tickets)
    .set({ status: "CHECKED_IN", checkedInAt: now, checkedInBy: actorUserId })
    .where(
      repo.scope(
        tickets,
        eq(tickets.id, ticketId),
        eq(tickets.status, "ISSUED"),
        sql`exists (select 1 from ${orders} where ${orders.eventId} = ${tickets.eventId} and ${orders.id} = ${tickets.orderId} and ${orders.status} = 'PAID')`,
      ),
    )
    .returning();

  if (!updated) {
    const ticket = await repo.findFirst(tickets, eq(tickets.id, ticketId));
    if (!ticket) throw new TicketNotFoundError();
    if (ticket.status === "CHECKED_IN") {
      const names = await loadUserNames(repo, [ticket.checkedInBy]);
      throw new AlreadyCheckedInError(
        ticket.checkedInAt,
        ticket.checkedInBy ? (names.get(ticket.checkedInBy) ?? null) : null,
      );
    }
    throw new OrderNotPaidError();
  }

  await repo.insert(auditLogs, {
    actorUserId,
    action: "TICKET_CHECKED_IN",
    entityType: "ticket",
    entityId: updated.id,
    before: { status: "ISSUED" },
    after: { status: "CHECKED_IN" },
  });
  const order = await repo.findFirst(orders, eq(orders.id, updated.orderId));
  if (!order) throw new OrderNotFoundError();
  return buildScanView(repo, order, updated);
}
