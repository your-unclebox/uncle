import { sql } from "drizzle-orm";
import { pgTable, smallint, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { roleScope, userStatus } from "./enums";
import { events } from "./tenancy";
import { bytea, citext, createdAt, id, inet, timestamptz, updatedAt } from "./types";

// DRD §Database 3.1 — Identity & Akses.

export const users = pgTable("users", {
  id: id(),
  email: citext("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  totpSecretEnc: bytea("totp_secret_enc"),
  status: userStatus("status").notNull().default("ACTIVE"),
  lastLoginAt: timestamptz("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Data referensi (OWNER, EVENT_ADMIN) diisi di migrasi, tidak diubah lewat UI.
export const roles = pgTable("roles", {
  id: smallint("id").primaryKey(),
  code: text("code").notNull().unique(),
  scope: roleScope("scope").notNull(),
});

// event_id NULL untuk OWNER, wajib untuk EVENT_ADMIN — ditegakkan trigger
// check_membership_scope() (migrasi 0002).
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: smallint("role_id")
      .notNull()
      .references(() => roles.id),
    eventId: uuid("event_id").references(() => events.id),
    revokedAt: timestamptz("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_memberships_user_role_event").on(t.userId, t.roleId, t.eventId).nullsNotDistinct(),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    email: citext("email").notNull(),
    name: text("name").notNull(),
    roleId: smallint("role_id")
      .notNull()
      .references(() => roles.id),
    tokenHash: bytea("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    // BR-ACC-05: berlaku 7 hari.
    expiresAt: timestamptz("expires_at")
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedAt: timestamptz("accepted_at"),
    revokedAt: timestamptz("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_invitations_event_id_id").on(t.eventId, t.id),
    uniqueIndex("uq_invitations_active_event_email")
      .on(t.eventId, t.email)
      .where(sql`${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  ],
);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  lastSeenAt: timestamptz("last_seen_at"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  revokedAt: timestamptz("revoked_at"),
  createdAt: createdAt(),
});
