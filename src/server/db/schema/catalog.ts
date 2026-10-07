import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./tenancy";
import { createdAt, id, updatedAt } from "./types";

// DRD §Database 3.3 — Katalog & Kuota.
export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    // Rupiah utuh (AI-CODING-RULES I-3).
    price: bigint("price", { mode: "bigint" }).notNull(),
    quota: integer("quota").notNull(),
    // Tiket yang sedang dipegang order aktif: PENDING_PAYMENT + RESERVED + PAID.
    allocatedCount: integer("allocated_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_ticket_types_event_id_id").on(t.eventId, t.id),
    unique("uq_ticket_types_event_id_name").on(t.eventId, t.name),
    // BR-EVT-05 / PRD Q16: tiket gratis belum didukung.
    check("ck_ticket_types_price_positive", sql`${t.price} > 0`),
    check("ck_ticket_types_quota_positive", sql`${t.quota} > 0`),
    // BR-TRX-06 / AC-PLT-04.1: kuota tidak pernah minus atau oversell.
    check(
      "ck_ticket_types_allocated_within_quota",
      sql`${t.allocatedCount} >= 0 AND ${t.allocatedCount} <= ${t.quota}`,
    ),
  ],
);
