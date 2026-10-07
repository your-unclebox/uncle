import { sql } from "drizzle-orm";
import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { emailStatus, emailType } from "./enums";
import { orders } from "./ordering";
import { events } from "./tenancy";
import { citext, createdAt, id, timestamptz, updatedAt } from "./types";

// DRD §Database 3.5 — transactional outbox email.
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    orderId: uuid("order_id"),
    type: emailType("type").notNull(),
    toEmail: citext("to_email").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: emailStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamptz("next_attempt_at").notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: timestamptz("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_email_outbox_event_id_id").on(t.eventId, t.id),
    foreignKey({
      name: "fk_email_outbox_order_same_event",
      columns: [t.eventId, t.orderId],
      foreignColumns: [orders.eventId, orders.id],
    }),
    // Email tiket tidak terkirim ganda karena webhook duplikat.
    uniqueIndex("uq_email_outbox_ticket_email_per_order")
      .on(t.orderId, t.type)
      .where(sql`${t.type} IN ('TICKET_ISSUED', 'CASH_RESERVATION')`),
  ],
);
