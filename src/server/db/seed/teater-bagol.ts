import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../schema";

// Data contoh development sesuai uncle-overview.md §4 (event Teater Bagol).
export const TEATER_BAGOL_SLUG = "teaterbagol";

export const TEATER_BAGOL_TICKET_TYPES = [
  { name: "Reguler", price: 75_000n, quota: 150, sortOrder: 0 },
  { name: "VIP", price: 150_000n, quota: 50, sortOrder: 1 },
] as const;

export type SeedResult = { status: "created" | "skipped"; eventId: string };

// Idempoten: bila slug sudah ada, seed tidak mengubah apa pun.
export async function seedTeaterBagol(db: PostgresJsDatabase<typeof schema>): Promise<SeedResult> {
  const [existing] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.slug, TEATER_BAGOL_SLUG))
    .limit(1);
  if (existing) return { status: "skipped", eventId: existing.id };

  return db.transaction(async (tx) => {
    const [client] = await tx
      .insert(schema.clients)
      .values({ name: "Komunitas Teater Bagol", contactEmail: "admin@teaterbagol.com" })
      .returning({ id: schema.clients.id });

    const [event] = await tx
      .insert(schema.events)
      .values({
        clientId: client?.id,
        slug: TEATER_BAGOL_SLUG,
        status: "ACTIVE",
        publishedAt: new Date(),
        name: 'Teater Bagol — "Nama Lakon"',
        descriptionHtml: "<p>Paragraf deskripsi lengkap event ...</p>",
        category: "Teater",
        eventType: "Di lokasi",
        // Sabtu, 20 Des 2026 · 19:00–22:00 WIB (UTC+7).
        startsAt: new Date("2026-12-20T19:00:00+07:00"),
        endsAt: new Date("2026-12-20T22:00:00+07:00"),
        venueName: "Gedung Kesenian",
        venueAddress: "Jl. Contoh No. 1, Jakarta",
        // Contoh warna branding di UI-UX.md (Tab Branding).
        primaryColor: "#8B1E3F",
        secondaryColor: "#F2C14E",
      })
      .returning({ id: schema.events.id });
    if (!event) throw new Error("Gagal membuat event Teater Bagol.");

    await tx
      .insert(schema.ticketTypes)
      .values(
        TEATER_BAGOL_TICKET_TYPES.map((ticketType) => ({ ...ticketType, eventId: event.id })),
      );

    return { status: "created", eventId: event.id };
  });
}
