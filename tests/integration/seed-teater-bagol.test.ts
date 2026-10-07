import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { seedTeaterBagol, TEATER_BAGOL_SLUG } from "@/server/db/seed/teater-bagol";

import { useTestDatabase } from "../fixtures/db";

// Data contoh uncle-overview.md: Reguler Rp 75.000 kuota 150, VIP Rp 150.000 kuota 50.
describe("seed Teater Bagol", () => {
  const db = useTestDatabase();

  it("membuat event & jenis tiket sesuai overview, dan idempoten", async () => {
    const first = await seedTeaterBagol(db);
    const second = await seedTeaterBagol(db);
    expect(first.status).toBe("created");
    expect(second).toEqual({ status: "skipped", eventId: first.eventId });

    const [event] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, TEATER_BAGOL_SLUG));
    expect(event?.status).toBe("ACTIVE");
    expect(event?.startsAt.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-12-20T15:00:00.000Z");

    const types = await db
      .select({
        name: schema.ticketTypes.name,
        price: schema.ticketTypes.price,
        quota: schema.ticketTypes.quota,
        allocatedCount: schema.ticketTypes.allocatedCount,
      })
      .from(schema.ticketTypes)
      .where(eq(schema.ticketTypes.eventId, first.eventId))
      .orderBy(asc(schema.ticketTypes.sortOrder));
    expect(types).toEqual([
      { name: "Reguler", price: 75_000n, quota: 150, allocatedCount: 0 },
      { name: "VIP", price: 150_000n, quota: 50, allocatedCount: 0 },
    ]);
  });
});
