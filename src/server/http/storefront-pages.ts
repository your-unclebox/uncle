import "server-only";

import { cache } from "react";

import { getDb } from "@/server/db/client";
import { listPublicTicketTypes } from "@/server/modules/catalog";
import { getCustomerOrder, OrderNotFoundError } from "@/server/modules/ordering";
import { isQrisConnected } from "@/server/modules/payments";
import { getQrSigningKey } from "@/server/modules/ticketing";
import { findPublicEventBySlug, toPublicEvent } from "@/server/modules/tenancy";
import { withTenant } from "@/server/tenancy";

// Loader Server Component landing page (sites/[slug]). Slug datang dari
// rewrite proxy.ts (Host), sehingga tenant tetap ditentukan oleh Host.

const findEvent = cache((slug: string) => findPublicEventBySlug(getDb(), slug));

/** Nama event untuk <title>; null bila tidak tampil publik. */
export async function loadStorefrontTitle(slug: string): Promise<string | null> {
  return (await findEvent(slug))?.name ?? null;
}

export async function loadStorefront(slug: string) {
  const event = await findEvent(slug);
  if (!event) return null;
  const { ticketTypes, qrisConnected } = await withTenant(
    getDb(),
    { eventId: event.id },
    async (repo) => ({
      ticketTypes: await listPublicTicketTypes(repo),
      qrisConnected: await isQrisConnected(repo),
    }),
  );
  return { event: toPublicEvent(event, new Date(), { qrisConnected }), ticketTypes };
}

export type StorefrontData = NonNullable<Awaited<ReturnType<typeof loadStorefront>>>;

/** Halaman pesanan (link email / Cek Pesanan). Token salah → order null. */
export async function loadOrderPage(slug: string, orderCode: string, accessToken: string | null) {
  const event = await findEvent(slug);
  if (!event) return null;
  const order = await withTenant(getDb(), { eventId: event.id }, async (repo) => {
    try {
      return await getCustomerOrder(
        repo,
        { orderCode, accessToken },
        { qrSigningKey: getQrSigningKey(), now: new Date() },
      );
    } catch (error) {
      if (error instanceof OrderNotFoundError) return null;
      throw error;
    }
  });
  return { event: toPublicEvent(event, new Date()), order };
}
