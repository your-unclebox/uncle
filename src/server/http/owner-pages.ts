import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { listTicketTypes } from "@/server/modules/catalog";
import { listAdminAccess } from "@/server/modules/identity";
import {
  getOwnerSummary,
  getPublishChecklist,
  listOwnerEvents,
  toEventForm,
} from "@/server/modules/tenancy";
import { withTenant } from "@/server/tenancy";

// Loader data untuk Server Component Owner (dipanggil setelah requireOwnerPage).

export async function loadOwnerDashboard() {
  const db = getDb();
  const [summary, events] = await Promise.all([getOwnerSummary(db), listOwnerEvents(db)]);
  return {
    summary: { ...summary, revenue: Number(summary.revenue) },
    events: events.map((event) => ({
      ...event,
      startsAt: event.startsAt?.toISOString() ?? null,
      endsAt: event.endsAt?.toISOString() ?? null,
    })),
  };
}

export type OwnerDashboardData = Awaited<ReturnType<typeof loadOwnerDashboard>>;

export async function loadEventEditor(eventId: string, actorUserId: string) {
  if (!z.uuid().safeParse(eventId).success) return null;
  return withTenant(getDb(), { eventId, actorUserId }, async (repo) => {
    const event = await repo.getEvent();
    if (!event) return null;
    const [ticketTypes, checklist, access] = await Promise.all([
      listTicketTypes(repo),
      getPublishChecklist(repo),
      listAdminAccess(repo),
    ]);
    return {
      baseDomain: getServerEnv().APP_BASE_DOMAIN.replace(/:\d+$/, ""),
      event: toEventForm(event),
      ticketTypes: ticketTypes.map((type) => ({
        id: type.id,
        name: type.name,
        price: Number(type.price),
        quota: type.quota,
        allocated: type.allocatedCount,
        isActive: type.isActive,
      })),
      checklist,
      access,
    };
  });
}

export type EventEditorData = NonNullable<Awaited<ReturnType<typeof loadEventEditor>>>;
