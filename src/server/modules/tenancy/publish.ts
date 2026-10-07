import "server-only";

import { and, eq } from "drizzle-orm";

import { auditLogs, events, ticketTypes } from "@/server/db/schema";
import { EventNotFoundError } from "@/server/modules/ordering/errors";
import type { TenantScopedRepository } from "@/server/tenancy";

import { PublishChecklistIncompleteError, type ChecklistItem } from "./errors";

/** BR-EVT-04 / UI-UX PublishChecklist. */
export async function getPublishChecklist(repo: TenantScopedRepository): Promise<ChecklistItem[]> {
  const event = await repo.getEvent();
  if (!event) throw new EventNotFoundError();
  const activeTypes = await repo.findMany(ticketTypes, eq(ticketTypes.isActive, true));
  return [
    { key: "name", label: "Nama event", done: event.name.trim().length > 0 },
    {
      key: "schedule",
      label: "Tanggal, jam mulai & jam selesai",
      done: Boolean(event.startsAt && event.endsAt),
    },
    { key: "venue", label: "Lokasi", done: Boolean(event.venueName || event.venueAddress) },
    { key: "ticketTypes", label: "≥ 1 jenis tiket", done: activeTypes.length > 0 },
    { key: "slug", label: "Subdomain", done: Boolean(event.slug) },
  ];
}

/**
 * OWN-09: Draft → Aktif. Pendaftaran host {slug}.uncle.id ke Vercel
 * (DRD Deployment §3) belum dipasang — butuh kredensial Vercel.
 */
export async function publishEvent(
  repo: TenantScopedRepository,
  options: { actorUserId: string; now?: Date },
): Promise<typeof events.$inferSelect> {
  const now = options.now ?? new Date();
  const event = await repo.getEvent();
  if (!event) throw new EventNotFoundError();
  if (event.status === "ACTIVE") return event;

  const checklist = await getPublishChecklist(repo);
  if (event.status !== "DRAFT" || checklist.some((item) => !item.done)) {
    throw new PublishChecklistIncompleteError(checklist);
  }
  const [published] = await repo.tx
    .update(events)
    .set({ status: "ACTIVE", publishedAt: now, version: event.version + 1 })
    .where(and(eq(events.id, repo.eventId), eq(events.status, "DRAFT")))
    .returning();
  if (!published) throw new EventNotFoundError();
  await repo.insert(auditLogs, {
    actorUserId: options.actorUserId,
    action: "EVENT_PUBLISHED",
    entityType: "event",
    entityId: event.id,
    before: { status: event.status },
    after: { status: published.status, slug: published.slug },
  });
  return published;
}
