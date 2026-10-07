import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { assetStatus, cashReservationMode, eventMediaKind, eventStatus } from "./enums";
import { users } from "./identity";
import { bytea, citext, createdAt, id, timestamptz, updatedAt } from "./types";

// DRD §Database 3.2 — Tenant & Konten. 1 event = 1 tenant.

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const events = pgTable(
  "events",
  {
    id: id(),
    clientId: uuid("client_id").references(() => clients.id),
    slug: citext("slug").notNull().unique(),
    status: eventStatus("status").notNull().default("DRAFT"),
    salesOpen: boolean("sales_open").notNull().default(true),
    name: text("name").notNull(),
    descriptionHtml: text("description_html"),
    category: text("category"),
    eventType: text("event_type"),
    startsAt: timestamptz("starts_at").notNull(),
    // BR-EVT-09: Jam Selesai wajib; default +3 jam diisi di form, bukan di DB.
    endsAt: timestamptz("ends_at").notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    mapsUrl: text("maps_url"),
    venueLat: numeric("venue_lat", { precision: 9, scale: 6 }),
    venueLng: numeric("venue_lng", { precision: 9, scale: 6 }),
    logoAssetId: uuid("logo_asset_id").references((): AnyPgColumn => assets.id),
    coverAssetId: uuid("cover_asset_id").references((): AnyPgColumn => assets.id),
    primaryColor: char("primary_color", { length: 7 }),
    secondaryColor: char("secondary_color", { length: 7 }),
    contactInfo: text("contact_info"),
    termsHtml: text("terms_html"),
    refundPolicyHtml: text("refund_policy_html"),
    maxTicketsPerOrder: smallint("max_tickets_per_order").notNull().default(10),
    qrisExpiryMinutes: smallint("qris_expiry_minutes").notNull().default(15),
    cashEnabled: boolean("cash_enabled").notNull().default(true),
    cashReservationMode: cashReservationMode("cash_reservation_mode")
      .notNull()
      .default("UNTIL_EVENT_END"),
    cashReservationOffsetMinutes: smallint("cash_reservation_offset_minutes"),
    publishedAt: timestamptz("published_at"),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_events_ends_after_starts", sql`${t.endsAt} > ${t.startsAt}`),
    check("ck_events_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'`),
    check(
      "ck_events_primary_color",
      sql`${t.primaryColor} IS NULL OR ${t.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    check(
      "ck_events_secondary_color",
      sql`${t.secondaryColor} IS NULL OR ${t.secondaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    check(
      "ck_events_cash_offset_required",
      sql`${t.cashReservationMode} <> 'AFTER_START_MINUTES' OR ${t.cashReservationOffsetMinutes} IS NOT NULL`,
    ),
    check(
      "ck_events_cash_offset_positive",
      sql`${t.cashReservationOffsetMinutes} IS NULL OR ${t.cashReservationOffsetMinutes} > 0`,
    ),
  ],
);

export const assets = pgTable("assets", {
  id: id(),
  eventId: uuid("event_id").references((): AnyPgColumn => events.id),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  checksumSha256: bytea("checksum_sha256"),
  uploadedBy: uuid("uploaded_by").references((): AnyPgColumn => users.id),
  status: assetStatus("status").notNull().default("PENDING"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const eventMedia = pgTable(
  "event_media",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    assetId: uuid("asset_id").references(() => assets.id),
    kind: eventMediaKind("kind").notNull(),
    embedUrl: text("embed_url"),
    sortOrder: smallint("sort_order").notNull().default(0),
    caption: text("caption"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_event_media_event_id_id").on(t.eventId, t.id),
    check(
      "ck_event_media_embed_url",
      sql`(${t.kind} = 'VIDEO_EMBED') = (${t.embedUrl} IS NOT NULL)`,
    ),
  ],
);

// Subdomain cadangan (DRD Architecture §2) — diisi di migrasi 0002 dan dicek
// trigger check_event_slug_not_reserved().
export const reservedSlugs = pgTable("reserved_slugs", {
  slug: citext("slug").primaryKey(),
});
