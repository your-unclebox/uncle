import { describe, expect, it } from "vitest";

import { computeCashExpiresAt } from "./cash-reservation";

// Teater Bagol: 20 Des 2026 19:00–22:00 WIB.
const startsAt = new Date("2026-12-20T19:00:00+07:00");
const endsAt = new Date("2026-12-20T22:00:00+07:00");
const base = { startsAt, endsAt, cashReservationOffsetMinutes: null };

describe("computeCashExpiresAt (BR-TRX-08, DRD §Database 5.2)", () => {
  it("default UNTIL_EVENT_END → jam selesai event (bukan H-1)", () => {
    expect(computeCashExpiresAt({ ...base, cashReservationMode: "UNTIL_EVENT_END" })).toEqual(
      endsAt,
    );
  });

  it("AC-LP-08.3: dipercepat ke jam mulai event", () => {
    expect(computeCashExpiresAt({ ...base, cashReservationMode: "UNTIL_EVENT_START" })).toEqual(
      startsAt,
    );
  });

  it("AFTER_START_MINUTES → mulai + offset", () => {
    expect(
      computeCashExpiresAt({
        ...base,
        cashReservationMode: "AFTER_START_MINUTES",
        cashReservationOffsetMinutes: 30,
      }),
    ).toEqual(new Date("2026-12-20T19:30:00+07:00"));
  });

  it("AFTER_START_MINUTES tidak pernah melewati jam selesai", () => {
    expect(
      computeCashExpiresAt({
        ...base,
        cashReservationMode: "AFTER_START_MINUTES",
        cashReservationOffsetMinutes: 600,
      }),
    ).toEqual(endsAt);
  });

  it("menolak event tanpa jadwal atau offset", () => {
    expect(() =>
      computeCashExpiresAt({ ...base, endsAt: null, cashReservationMode: "UNTIL_EVENT_END" }),
    ).toThrow();
    expect(() =>
      computeCashExpiresAt({ ...base, cashReservationMode: "AFTER_START_MINUTES" }),
    ).toThrow();
  });
});
