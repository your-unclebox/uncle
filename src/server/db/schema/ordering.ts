import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ticketTypes } from "./catalog";
import { orderStatus, paidVia, paymentMethod, ticketStatus } from "./enums";
import { users } from "./identity";
import { events } from "./tenancy";
import { bytea, citext, createdAt, id, inet, timestamptz, updatedAt } from "./types";

// DRD §Database 3.4 — Order & Tiket. State machine: DRD §4.1.

export const orders = pgTable(
  "orders",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    orderCode: text("order_code").notNull().unique(),
    customerName: text("customer_name").notNull(),
    // E.164, dinormalisasi aplikasi (BR-TRX-02).
    customerPhone: text("customer_phone").notNull(),
    // D1 / BR-TRX-03: email wajib, bukan untuk login.
    customerEmail: citext("customer_email").notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    status: orderStatus("status").notNull(),
    totalAmount: bigint("total_amount", { mode: "bigint" }).notNull(),
    expiresAt: timestamptz("expires_at"),
    paidAt: timestamptz("paid_at"),
    paidVia: paidVia("paid_via"),
    cashConfirmedBy: uuid("cash_confirmed_by").references(() => users.id),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    refundMarkedAt: timestamptz("refund_marked_at"),
    refundMarkedBy: uuid("refund_marked_by").references(() => users.id),
    refundNote: text("refund_note"),
    needsReview: boolean("needs_review").notNull().default(false),
    // D7 / BR-TKT-07: order baru dari reservasi Cash yang kedaluwarsa.
    reissuedFromOrderId: uuid("reissued_from_order_id"),
    accessTokenHash: bytea("access_token_hash"),
    idempotencyKey: text("idempotency_key"),
    createdIp: inet("created_ip"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_orders_event_id_id").on(t.eventId, t.id),
    unique("uq_orders_event_id_idempotency_key").on(t.eventId, t.idempotencyKey),
    // Satu reservasi kedaluwarsa maksimal dibuatkan satu order baru.
    uniqueIndex("uq_orders_event_id_reissued_from")
      .on(t.eventId, t.reissuedFromOrderId)
      .where(sql`${t.reissuedFromOrderId} IS NOT NULL`),
    foreignKey({
      name: "fk_orders_reissued_from_same_event",
      columns: [t.eventId, t.reissuedFromOrderId],
      foreignColumns: [t.eventId, t.id],
    }),
    check("ck_orders_customer_name_length", sql`char_length(${t.customerName}) BETWEEN 2 AND 100`),
    check("ck_orders_total_amount_positive", sql`${t.totalAmount} > 0`),
    check(
      "ck_orders_status_matches_method",
      sql`(${t.paymentMethod} = 'QRIS' AND ${t.status} <> 'RESERVED') OR (${t.paymentMethod} = 'CASH' AND ${t.status} <> 'PENDING_PAYMENT')`,
    ),
    // Hold aktif wajib punya batas waktu.
    check(
      "ck_orders_active_hold_has_expiry",
      sql`${t.status} NOT IN ('PENDING_PAYMENT', 'RESERVED') OR ${t.expiresAt} IS NOT NULL`,
    ),
    index("ix_orders_event_id_status").on(t.eventId, t.status),
    index("ix_orders_event_id_created_at").on(t.eventId, t.createdAt.desc()),
    index("ix_orders_event_id_customer_phone").on(t.eventId, t.customerPhone),
    index("ix_orders_customer_name_trgm").using("gin", sql`${t.customerName} gin_trgm_ops`),
    index("ix_orders_active_hold_expires_at")
      .on(t.expiresAt)
      .where(sql`${t.status} IN ('PENDING_PAYMENT', 'RESERVED')`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    eventId: uuid("event_id").notNull(),
    orderId: uuid("order_id").notNull(),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    quantity: integer("quantity").notNull(),
    // Snapshot harga & nama saat order (BR-EVT-07).
    unitPrice: bigint("unit_price", { mode: "bigint" }).notNull(),
    ticketTypeName: text("ticket_type_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_order_items_event_id_id").on(t.eventId, t.id),
    unique("uq_order_items_order_id_ticket_type_id").on(t.orderId, t.ticketTypeId),
    // Composite FK: item tidak bisa menunjuk order / jenis tiket tenant lain.
    foreignKey({
      name: "fk_order_items_order_same_event",
      columns: [t.eventId, t.orderId],
      foreignColumns: [orders.eventId, orders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "fk_order_items_ticket_type_same_event",
      columns: [t.eventId, t.ticketTypeId],
      foreignColumns: [ticketTypes.eventId, ticketTypes.id],
    }),
    check("ck_order_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// QR Tiket (check-in), terpisah dari QR pembayaran (BR-TKT-01).
export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    eventId: uuid("event_id").notNull(),
    // BR-TKT-03: 1 QR Tiket per order.
    orderId: uuid("order_id").notNull().unique(),
    qrVersion: smallint("qr_version").notNull().default(1),
    // SHA-256 payload QR aktif — QR Tiket unik.
    qrFingerprint: bytea("qr_fingerprint").notNull().unique(),
    status: ticketStatus("status").notNull().default("ISSUED"),
    issuedAt: timestamptz("issued_at").notNull().defaultNow(),
    checkedInAt: timestamptz("checked_in_at"),
    checkedInBy: uuid("checked_in_by").references((): AnyPgColumn => users.id),
    voidedAt: timestamptz("voided_at"),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_tickets_event_id_id").on(t.eventId, t.id),
    foreignKey({
      name: "fk_tickets_order_same_event",
      columns: [t.eventId, t.orderId],
      foreignColumns: [orders.eventId, orders.id],
    }),
    check(
      "ck_tickets_checked_in_consistent",
      sql`(${t.status} = 'CHECKED_IN') = (${t.checkedInAt} IS NOT NULL)`,
    ),
  ],
);
