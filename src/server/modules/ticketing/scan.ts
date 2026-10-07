import "server-only";

import { eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { auditLogs, orderItems, orders, tickets, ticketTypes } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { findUserNames } from "@/server/modules/identity/user-names";
import { isEventOperational } from "@/server/modules/ordering/event-operational";
import { expireOrderIfDue } from "@/server/modules/ordering/order-transitions";
import { lockTicketTypes } from "@/server/modules/ordering/quota";
import { withTenant, type TenantContext, type TenantScopedRepository } from "@/server/tenancy";

import { scanInputSchema } from "./schemas";
import { parseTicketQrPayload, ticketQrFingerprint, verifyTicketQrMac } from "./ticket-qr";

type Order = typeof orders.$inferSelect;
type Ticket = typeof tickets.$inferSelect;

/**
 * Hasil validasi scan (DRD API §5 `…/scan`, UI-UX §4 panel (c)–(k)).
 * `QRIS_NOT_PAID` tambahan di luar DRD: kode manual untuk pesanan QRIS yang
 * belum/tidak Lunas (PRD SCN-05 "QRIS belum lunas") — QR Tiket QRIS sendiri
 * baru terbit setelah Lunas.
 */
export type ScanResultCode =
  | "READY_PICKUP"
  | "CASH_UNPAID"
  | "ALREADY_CHECKED_IN"
  | "RESERVATION_EXPIRED"
  | "CANCELLED"
  | "QRIS_NOT_PAID"
  | "OTHER_EVENT"
  | "INVALID";

export interface ScanOrderView {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly paymentMethod: Order["paymentMethod"];
  readonly status: Order["status"];
  readonly totalAmount: bigint;
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly paidVia: Order["paidVia"];
  readonly cashConfirmedBy: string | null;
  readonly reissuedFromOrderCode: string | null;
  readonly items: ReadonlyArray<{ name: string; quantity: number }>;
}

export interface ScanTicketView {
  readonly id: string;
  readonly status: Ticket["status"];
  readonly checkedInAt: Date | null;
  readonly checkedInBy: string | null;
}

export interface ReissueSnapshot {
  readonly available: boolean;
  readonly totalAmount: bigint;
  readonly items: ReadonlyArray<{
    ticketTypeId: string;
    name: string;
    quantity: number;
    unitPrice: bigint;
    remaining: number;
  }>;
  readonly reissuedOrder: {
    id: string;
    code: string;
    createdAt: Date;
    createdBy: string | null;
    ticketStatus: Ticket["status"] | null;
  } | null;
}

export interface ScanView {
  readonly result: ScanResultCode;
  /** INVALID: kenapa ditolak, untuk microcopy (QR pembayaran / kode tidak ada). */
  readonly reason?: "PAYMENT_QR" | "UNKNOWN_QR" | "ORDER_CODE_NOT_FOUND";
  readonly ticket?: ScanTicketView;
  readonly order?: ScanOrderView;
  readonly reissue?: ReissueSnapshot;
  readonly actions: { canConfirmCash: boolean; canCheckIn: boolean; canReissue: boolean };
}

const NO_ACTIONS = { canConfirmCash: false, canCheckIn: false, canReissue: false } as const;

export interface ScanDeps {
  readonly qrSigningKey: Buffer;
  readonly now?: Date;
}

// String QRIS EMVCo (QR pembayaran) selalu diawali Payload Format Indicator "000201".
const isPaymentQr = (payload: string) => payload.startsWith("000201");

/**
 * Validasi QR Tiket / kode pesanan untuk Scanner (SCN-02, SCN-05, SCN-08,
 * DRD Architecture §5.3, Security §6). Setiap hasil dicatat di audit_logs
 * tanpa payload QR & PII (AI-CODING-RULES §8).
 */
export async function scanTicket(
  db: Database,
  tenant: TenantContext,
  rawInput: unknown,
  deps: ScanDeps,
): Promise<ScanView> {
  const input = parseInput(scanInputSchema, rawInput);
  const now = deps.now ?? new Date();
  const via = input.payload !== undefined ? "qr" : "manual";

  let ticketId: string | null = null;
  let outcome: ScanView | null = null;
  if (input.payload !== undefined) {
    const resolved = await resolveQrPayload(db, tenant.eventId, input.payload, deps.qrSigningKey);
    if (resolved.kind === "rejected") outcome = resolved.view;
    else ticketId = resolved.ticketId;
  }

  return withTenant(db, tenant, async (repo) => {
    let view = outcome;
    if (!view) {
      const order =
        ticketId !== null
          ? await findOrderByTicket(repo, ticketId)
          : await repo.findFirst(orders, eq(orders.orderCode, input.orderCode ?? ""));
      view = order
        ? await describeOrderForScanner(repo, order.id, now)
        : { result: "INVALID", reason: "ORDER_CODE_NOT_FOUND", actions: NO_ACTIONS };
    }
    await repo.insert(auditLogs, {
      actorUserId: repo.context.actorUserId ?? null,
      action: "TICKET_SCANNED",
      entityType: "ticket",
      entityId: view.ticket?.id ?? null,
      after: {
        result: view.result,
        via,
        ...(view.reason ? { reason: view.reason } : {}),
        ...(view.order ? { orderCode: view.order.code } : {}),
      },
    });
    return view;
  });
}

type ResolvedQr = { kind: "ticket"; ticketId: string } | { kind: "rejected"; view: ScanView };

/**
 * Cari tiket dari payload lintas tenant (hanya id & event_id) supaya QR event
 * lain bisa dibedakan dari QR palsu tanpa membocorkan datanya (BR-TKT-06,
 * AC-SCN-05.2). Lookup lewat fingerprint = hanya versi QR aktif yang dikenali.
 */
async function resolveQrPayload(
  db: Database,
  eventId: string,
  payload: string,
  key: Buffer,
): Promise<ResolvedQr> {
  const invalid = (reason: NonNullable<ScanView["reason"]>): ResolvedQr => ({
    kind: "rejected",
    view: { result: "INVALID", reason, actions: NO_ACTIONS },
  });
  const parsed = parseTicketQrPayload(payload);
  if (!parsed) return invalid(isPaymentQr(payload) ? "PAYMENT_QR" : "UNKNOWN_QR");

  const [owner] = await db
    .select({ id: tickets.id, eventId: tickets.eventId })
    .from(tickets)
    .where(eq(tickets.qrFingerprint, ticketQrFingerprint(payload)))
    .limit(1);
  if (!owner || owner.id !== parsed.ticketId) return invalid("UNKNOWN_QR");
  if (!verifyTicketQrMac(key, parsed, owner.eventId)) return invalid("UNKNOWN_QR");
  if (owner.eventId !== eventId) {
    return { kind: "rejected", view: { result: "OTHER_EVENT", actions: NO_ACTIONS } };
  }
  return { kind: "ticket", ticketId: owner.id };
}

async function findOrderByTicket(repo: TenantScopedRepository, ticketId: string) {
  const ticket = await repo.findFirst(tickets, eq(tickets.id, ticketId));
  return ticket ? repo.findFirst(orders, eq(orders.id, ticket.orderId)) : undefined;
}

/**
 * Status terkini satu pesanan dalam bentuk panel Scanner. Dipakai scan dan
 * sesudah aksi (Konfirmasi Lunas, Tandai Diambil, Buat Pesanan Baru).
 * Reservasi Cash yang lewat batas tapi belum disapu cron di-EXPIRED-kan dulu
 * (DRD API §5 — sweep-on-scan).
 */
export async function describeOrderForScanner(
  repo: TenantScopedRepository,
  orderId: string,
  now: Date,
): Promise<ScanView> {
  let order = await repo.findFirst(orders, eq(orders.id, orderId));
  if (!order) return { result: "INVALID", reason: "ORDER_CODE_NOT_FOUND", actions: NO_ACTIONS };
  let items = await repo.findMany(orderItems, eq(orderItems.orderId, order.id));

  if (order.status === "RESERVED" && order.expiresAt && order.expiresAt < now) {
    // Urutan kunci ticket_types → orders (lihat expireOrderIfDue).
    await lockTicketTypes(
      repo.tx,
      repo.eventId,
      items.map((item) => item.ticketTypeId),
    );
    await expireOrderIfDue(repo.tx, { eventId: repo.eventId, orderId: order.id, now });
    order = (await repo.findFirst(orders, eq(orders.id, orderId))) ?? order;
  }
  items = items.sort((a, b) => a.ticketTypeName.localeCompare(b.ticketTypeName));

  const ticket = await repo.findFirst(tickets, eq(tickets.orderId, order.id));
  const reissuedFrom = order.reissuedFromOrderId
    ? await repo.findFirst(orders, eq(orders.id, order.reissuedFromOrderId))
    : undefined;
  const names = await findUserNames(repo.tx, [order.cashConfirmedBy, ticket?.checkedInBy]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  const orderView: ScanOrderView = {
    id: order.id,
    code: order.orderCode,
    customerName: order.customerName,
    paymentMethod: order.paymentMethod,
    status: order.status,
    totalAmount: order.totalAmount,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    paidVia: order.paidVia,
    cashConfirmedBy: nameOf(order.cashConfirmedBy),
    reissuedFromOrderCode: reissuedFrom?.orderCode ?? null,
    items: items.map((item) => ({ name: item.ticketTypeName, quantity: item.quantity })),
  };
  const ticketView: ScanTicketView | undefined = ticket
    ? {
        id: ticket.id,
        status: ticket.status,
        checkedInAt: ticket.checkedInAt,
        checkedInBy: nameOf(ticket.checkedInBy),
      }
    : undefined;
  const base = { order: orderView, ...(ticketView ? { ticket: ticketView } : {}) };

  if (ticket?.status === "CHECKED_IN") {
    return { result: "ALREADY_CHECKED_IN", ...base, actions: NO_ACTIONS };
  }
  switch (order.status) {
    case "CANCELLED":
    case "REFUNDED":
      return { result: "CANCELLED", ...base, actions: NO_ACTIONS };
    case "RESERVED":
      return {
        result: "CASH_UNPAID",
        ...base,
        actions: { ...NO_ACTIONS, canConfirmCash: true },
      };
    case "PAID":
      return ticket?.status === "ISSUED"
        ? { result: "READY_PICKUP", ...base, actions: { ...NO_ACTIONS, canCheckIn: true } }
        : { result: "CANCELLED", ...base, actions: NO_ACTIONS };
    case "PENDING_PAYMENT":
      return { result: "QRIS_NOT_PAID", ...base, actions: NO_ACTIONS };
    case "EXPIRED": {
      if (order.paymentMethod !== "CASH") {
        return { result: "QRIS_NOT_PAID", ...base, actions: NO_ACTIONS };
      }
      const reissue = await reissueSnapshot(repo, order, items);
      const event = await repo.getEvent();
      const canReissue =
        reissue.available &&
        reissue.reissuedOrder === null &&
        event !== undefined &&
        isEventOperational(event, now);
      return {
        result: "RESERVATION_EXPIRED",
        ...base,
        reissue,
        actions: { ...NO_ACTIONS, canReissue },
      };
    }
  }
}

/**
 * Snapshot kuota & harga SAAT INI untuk SCN-08 (DRD API §5). Final dicek lagi
 * di `…/reissue`; semua jenis harus cukup (BR-TKT-07, AC-SCN-08.6).
 */
async function reissueSnapshot(
  repo: TenantScopedRepository,
  order: Order,
  items: ReadonlyArray<typeof orderItems.$inferSelect>,
): Promise<ReissueSnapshot> {
  const existing = await repo.findFirst(orders, eq(orders.reissuedFromOrderId, order.id));
  let reissuedOrder: ReissueSnapshot["reissuedOrder"] = null;
  if (existing) {
    const ticket = await repo.findFirst(tickets, eq(tickets.orderId, existing.id));
    const names = await findUserNames(repo.tx, [existing.cashConfirmedBy]);
    reissuedOrder = {
      id: existing.id,
      code: existing.orderCode,
      createdAt: existing.createdAt,
      createdBy: existing.cashConfirmedBy ? (names.get(existing.cashConfirmedBy) ?? null) : null,
      ticketStatus: ticket?.status ?? null,
    };
  }

  const types = new Map(
    (
      await repo.findMany(
        ticketTypes,
        inArray(
          ticketTypes.id,
          items.map((item) => item.ticketTypeId),
        ),
      )
    ).map((row) => [row.id, row]),
  );
  const lines = items.map((item) => {
    const type = types.get(item.ticketTypeId);
    const remaining = type?.isActive ? type.quota - type.allocatedCount : 0;
    return {
      ticketTypeId: item.ticketTypeId,
      name: type?.name ?? item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: type?.price ?? item.unitPrice,
      remaining: Math.max(remaining, 0),
    };
  });
  return {
    available: lines.every((line) => line.remaining >= line.quantity),
    totalAmount: lines.reduce((sum, line) => sum + line.unitPrice * BigInt(line.quantity), 0n),
    items: lines,
    reissuedOrder,
  };
}
