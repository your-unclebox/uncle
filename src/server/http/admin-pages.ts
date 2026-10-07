import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/config/env";
import { siteOrigin } from "@/lib/host";
import { getDb } from "@/server/db/client";
import { getEventSummary, listAdminOrders } from "@/server/modules/ordering";
import { findPaymentConfig, toPaymentConfigView } from "@/server/modules/payments";
import { withTenant } from "@/server/tenancy";

import { getAppUrl } from "./app-url";

// Loader Server Component Admin (dipanggil setelah requireAdminPage).

function eventSiteUrl(slug: string | null): string | null {
  if (!slug) return null;
  const base = getServerEnv().APP_BASE_DOMAIN;
  const protocol = base.replace(/:\d+$/, "").endsWith("localhost") ? "http" : "https";
  return siteOrigin(slug, base, protocol);
}

export async function loadAdminEvent(eventId: string, actorUserId: string) {
  if (!z.uuid().safeParse(eventId).success) return null;
  return withTenant(getDb(), { eventId, actorUserId }, async (repo) => {
    const event = await repo.getEvent();
    if (!event) return null;
    return {
      eventName: event.name,
      siteUrl: event.status === "DRAFT" ? null : eventSiteUrl(event.slug),
      paymentConfig: toPaymentConfigView(await findPaymentConfig(repo), getAppUrl()),
    };
  });
}

export type AdminEventData = NonNullable<Awaited<ReturnType<typeof loadAdminEvent>>>;

/** Data awal halaman Transaksi & Scanner (ADM-03/04); pembaruan lewat Admin API. */
export async function loadAdminOverview(eventId: string, actorUserId: string) {
  if (!z.uuid().safeParse(eventId).success) return null;
  return withTenant(getDb(), { eventId, actorUserId }, async (repo) => {
    if (!(await repo.getEvent())) return null;
    return {
      summary: await getEventSummary(repo),
      orders: await listAdminOrders(repo, {}),
    };
  });
}
