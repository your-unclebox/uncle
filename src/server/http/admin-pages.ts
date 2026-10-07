import "server-only";

import { z } from "zod";

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
    return {
      eventName: event.name,
      paymentConfig: toPaymentConfigView(await findPaymentConfig(repo), getAppUrl()),
    };
  });
}

export type AdminEventData = NonNullable<Awaited<ReturnType<typeof loadAdminEvent>>>;
