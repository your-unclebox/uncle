import { pgEnum } from "drizzle-orm/pg-core";

// Nilai enum persis DRD §Database 3 & §4 (AI-CODING-RULES Naming §2).
export const userStatus = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

export const roleScope = pgEnum("role_scope", ["PLATFORM", "EVENT"]);

export const eventStatus = pgEnum("event_status", ["DRAFT", "ACTIVE", "FINISHED", "ARCHIVED"]);

// D6: default UNTIL_EVENT_END.
export const cashReservationMode = pgEnum("cash_reservation_mode", [
  "UNTIL_EVENT_END",
  "UNTIL_EVENT_START",
  "AFTER_START_MINUTES",
]);

export const assetStatus = pgEnum("asset_status", ["PENDING", "READY", "DELETED"]);

export const eventMediaKind = pgEnum("event_media_kind", ["PHOTO", "VIDEO", "VIDEO_EMBED"]);

export const paymentMethod = pgEnum("payment_method", ["QRIS", "CASH"]);

export const orderStatus = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "RESERVED",
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
]);

export const paidVia = pgEnum("paid_via", ["GATEWAY_WEBHOOK", "GATEWAY_RECONCILE", "CASH_MANUAL"]);

export const ticketStatus = pgEnum("ticket_status", ["ISSUED", "CHECKED_IN", "VOID"]);

export const paymentProvider = pgEnum("payment_provider", ["TRIPAY"]);

export const paymentMode = pgEnum("payment_mode", ["SANDBOX", "PRODUCTION"]);

export const paymentConfigStatus = pgEnum("payment_config_status", [
  "NOT_SET",
  "CONNECTED",
  "FAILED",
]);

export const paymentTransactionStatus = pgEnum("payment_transaction_status", [
  "UNPAID",
  "PAID",
  "EXPIRED",
  "FAILED",
  "REFUND",
]);

export const webhookResult = pgEnum("webhook_result", [
  "APPLIED",
  "DUPLICATE",
  "IGNORED",
  "NEEDS_REVIEW",
  "REJECTED",
]);

export const emailType = pgEnum("email_type", [
  "TICKET_ISSUED",
  "CASH_RESERVATION",
  "RESERVATION_EXPIRED",
  "ORDER_CANCELLED",
  "ADMIN_INVITE",
]);

export const emailStatus = pgEnum("email_status", [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
  "BOUNCED",
]);
