import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  foreignKey,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  paymentConfigStatus,
  paymentMode,
  paymentProvider,
  paymentTransactionStatus,
  webhookResult,
} from "./enums";
import { users } from "./identity";
import { orders } from "./ordering";
import { events } from "./tenancy";
import { bytea, createdAt, id, timestamptz, updatedAt } from "./types";

// DRD §Database 3.4 — Pembayaran.

// Kredensial QRIS per tenant (D3). API key & private key hanya tersimpan
// terenkripsi (AI-CODING-RULES §6) — tidak pernah plaintext.
export const paymentConfigs = pgTable(
  "payment_configs",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .unique()
      .references(() => events.id),
    provider: paymentProvider("provider").notNull().default("TRIPAY"),
    mode: paymentMode("mode").notNull(),
    merchantCode: text("merchant_code").notNull(),
    apiKeyEnc: bytea("api_key_enc"),
    privateKeyEnc: bytea("private_key_enc"),
    encKeyId: text("enc_key_id"),
    apiKeyLast4: char("api_key_last4", { length: 4 }),
    webhookKey: text("webhook_key").notNull().unique(),
    status: paymentConfigStatus("status").notNull().default("NOT_SET"),
    lastTestedAt: timestamptz("last_tested_at"),
    lastError: text("last_error"),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("uq_payment_configs_event_id_id").on(t.eventId, t.id)],
);

// QR pembayaran & status menurut gateway.
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: id(),
    eventId: uuid("event_id").notNull(),
    orderId: uuid("order_id").notNull(),
    paymentConfigId: uuid("payment_config_id")
      .notNull()
      .references(() => paymentConfigs.id),
    provider: paymentProvider("provider").notNull(),
    merchantRef: text("merchant_ref").notNull().unique(),
    providerReference: text("provider_reference"),
    channel: text("channel"),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    feeAmount: bigint("fee_amount", { mode: "bigint" }),
    status: paymentTransactionStatus("status").notNull().default("UNPAID"),
    qrString: text("qr_string"),
    qrImageUrl: text("qr_image_url"),
    expiresAt: timestamptz("expires_at"),
    paidAt: timestamptz("paid_at"),
    rawCreateResponse: jsonb("raw_create_response"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_payment_transactions_event_id_id").on(t.eventId, t.id),
    unique("uq_payment_transactions_provider_reference").on(t.provider, t.providerReference),
    // Maksimal satu QR pembayaran aktif per order.
    uniqueIndex("uq_payment_transactions_one_unpaid_per_order")
      .on(t.orderId)
      .where(sql`${t.status} = 'UNPAID'`),
    foreignKey({
      name: "fk_payment_transactions_order_same_event",
      columns: [t.eventId, t.orderId],
      foreignColumns: [orders.eventId, orders.id],
    }),
  ],
);

// Inbox webhook — audit + idempotensi (BR-PAY-05): dedupe_key UNIQUE membuat
// notifikasi ganda tidak bisa diproses dua kali.
export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  provider: paymentProvider("provider").notNull(),
  paymentConfigId: uuid("payment_config_id").references(() => paymentConfigs.id),
  eventId: uuid("event_id").references(() => events.id),
  receivedAt: timestamptz("received_at").notNull().defaultNow(),
  signatureValid: boolean("signature_valid").notNull(),
  headers: jsonb("headers"),
  rawBody: text("raw_body").notNull(),
  providerReference: text("provider_reference"),
  reportedStatus: text("reported_status"),
  // provider:provider_reference:reported_status
  dedupeKey: text("dedupe_key").unique(),
  processedAt: timestamptz("processed_at"),
  result: webhookResult("result"),
  error: text("error"),
});
