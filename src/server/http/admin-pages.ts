import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/config/env";
import { siteOrigin } from "@/lib/host";
import { getDb } from "@/server/db/client";
import { findPaymentConfig, toPaymentConfigView } from "@/server/modules/payments";
import { withTenant } from "@/server/tenancy";

import { getAppUrl } from "./app-url";

// Loader Server Component Admin (dipanggil setelah requireAdminPage).

export async function loadAdminEvent(eventId: string, actorUserId: string) {
  if (!z.uuid().safeParse(eventId).success) return null;
  return withTenant(getDb(), { eventId, actorUserId }, async (repo) => {
    const event = await repo.getEvent();
    if (!event) return null;
    const baseDomain = getServerEnv().APP_BASE_DOMAIN;
    const protocol = baseDomain.replace(/:\d+$/, "").endsWith("localhost") ? "http" : "https";
    return {
      eventName: event.name,
      timezone: event.timezone,
      // "Salin Link Event" di empty state Daftar Transaksi (UI-UX §States 3).
      siteUrl: event.slug ? siteOrigin(event.slug, baseDomain, protocol) : null,
      paymentConfig: toPaymentConfigView(await findPaymentConfig(repo), getAppUrl()),
    };
  });
}

export type AdminEventData = NonNullable<Awaited<ReturnType<typeof loadAdminEvent>>>;
