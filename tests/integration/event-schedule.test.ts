import { describe, expect, it } from "vitest";

import { createEvent, useTestDatabase } from "../fixtures/db";
import { expectPgError, PG } from "../fixtures/pg-error";

// BR-EVT-09: Jam Selesai wajib dan harus setelah Jam Mulai (CHECK ends_at > starts_at).
describe("validasi ends_at event", () => {
  const db = useTestDatabase();
  const startsAt = new Date("2026-12-20T19:00:00+07:00");

  it("menerima ends_at setelah starts_at (default form: +3 jam)", async () => {
    const event = await createEvent(db, {
      startsAt,
      endsAt: new Date("2026-12-20T22:00:00+07:00"),
    });
    expect(event.endsAt.toISOString()).toBe("2026-12-20T15:00:00.000Z");
  });

  it("menolak ends_at sama dengan starts_at", async () => {
    await expectPgError(createEvent(db, { startsAt, endsAt: startsAt }), {
      code: PG.CHECK,
      constraint: "ck_events_ends_after_starts",
    });
  });

  it("menolak ends_at sebelum starts_at", async () => {
    await expectPgError(
      createEvent(db, { startsAt, endsAt: new Date("2026-12-20T18:00:00+07:00") }),
      { code: PG.CHECK, constraint: "ck_events_ends_after_starts" },
    );
  });

  it("menolak ends_at kosong", async () => {
    await expectPgError(
      // Melewati tipe dengan sengaja untuk menguji NOT NULL di DB.
      createEvent(db, { startsAt, endsAt: null as unknown as Date }),
      { code: PG.NOT_NULL },
    );
  });

  it("menolak mode AFTER_START_MINUTES tanpa offset (DRD §Database 5.2)", async () => {
    await expectPgError(createEvent(db, { cashReservationMode: "AFTER_START_MINUTES" }), {
      code: PG.CHECK,
      constraint: "ck_events_cash_offset_required",
    });
  });
});
