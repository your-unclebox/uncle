import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ticketTypes } from "@/server/db/schema";

import { createEvent, createTicketType, useTestDatabase } from "../fixtures/db";
import { expectPgError, PG } from "../fixtures/pg-error";

// BR-TRX-06, AC-PLT-04.1: kuota tidak pernah minus / oversell, dijamin DB.
describe("constraint kuota ticket_types", () => {
  const db = useTestDatabase();
  const QUOTA_CHECK = "ck_ticket_types_allocated_within_quota";

  it("menolak allocated_count melebihi quota (oversell)", async () => {
    const event = await createEvent(db);
    const ticketType = await createTicketType(db, event.id, { quota: 10, allocatedCount: 10 });

    await expectPgError(
      db
        .update(ticketTypes)
        .set({ allocatedCount: sql`${ticketTypes.allocatedCount} + 1` })
        .where(eq(ticketTypes.id, ticketType.id)),
      { code: PG.CHECK, constraint: QUOTA_CHECK },
    );
  });

  it("menolak allocated_count minus", async () => {
    const event = await createEvent(db);
    const ticketType = await createTicketType(db, event.id, { quota: 10 });

    await expectPgError(
      db.update(ticketTypes).set({ allocatedCount: -1 }).where(eq(ticketTypes.id, ticketType.id)),
      { code: PG.CHECK, constraint: QUOTA_CHECK },
    );
  });

  it("AC-OWN-07.3: menolak quota diturunkan di bawah tiket yang sudah dialokasikan", async () => {
    const event = await createEvent(db);
    const ticketType = await createTicketType(db, event.id, { quota: 150, allocatedCount: 120 });

    await expectPgError(
      db.update(ticketTypes).set({ quota: 100 }).where(eq(ticketTypes.id, ticketType.id)),
      { code: PG.CHECK, constraint: QUOTA_CHECK },
    );
  });

  it("menolak harga dan kuota yang tidak positif (BR-EVT-05)", async () => {
    const event = await createEvent(db);

    await expectPgError(createTicketType(db, event.id, { price: 0n }), {
      code: PG.CHECK,
      constraint: "ck_ticket_types_price_positive",
    });
    await expectPgError(createTicketType(db, event.id, { quota: 0 }), {
      code: PG.CHECK,
      constraint: "ck_ticket_types_quota_positive",
    });
  });

  it("AC-LP-06.6: 25 alokasi bersamaan pada kuota 10 → tepat 10 berhasil, 0 oversell", async () => {
    const event = await createEvent(db);
    const ticketType = await createTicketType(db, event.id, { quota: 10 });

    // Sengaja tanpa syarat `allocated_count + 1 <= quota` di aplikasi: yang
    // diuji adalah lapis pengaman terakhir di DB (DRD §Database 5.1).
    const attempts = Array.from({ length: 25 }, () =>
      db.transaction((tx) =>
        tx
          .update(ticketTypes)
          .set({ allocatedCount: sql`${ticketTypes.allocatedCount} + 1` })
          .where(eq(ticketTypes.id, ticketType.id)),
      ),
    );
    const results = await Promise.allSettled(attempts);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(15);
    const [row] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketType.id));
    expect(row?.allocatedCount).toBe(10);
  });
});
