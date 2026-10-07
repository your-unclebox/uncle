import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./identity";
import { events } from "./tenancy";
import { createdAt, id, inet } from "./types";

// Append-only: role aplikasi hanya punya SELECT & INSERT (migrasi 0002).
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  eventId: uuid("event_id").references(() => events.id),
  // NULL = sistem / webhook.
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});
