import type { events } from "@/server/db/schema";

type EventSchedule = Pick<
  typeof events.$inferSelect,
  "startsAt" | "endsAt" | "cashReservationMode" | "cashReservationOffsetMinutes"
>;

const MINUTE_MS = 60_000;

/**
 * Batas reservasi Cash (BR-TRX-08, DRD §Database 5.2, keputusan D6).
 * Default UNTIL_EVENT_END = jam selesai event. Owner hanya bisa mempercepat,
 * jadi hasil tidak pernah melewati ends_at.
 */
export function computeCashExpiresAt(event: EventSchedule): Date {
  const { startsAt, endsAt } = event;
  if (!startsAt || !endsAt) {
    throw new Error("Event tanpa jadwal tidak bisa menerima reservasi Cash (BR-EVT-04).");
  }
  switch (event.cashReservationMode) {
    case "UNTIL_EVENT_END":
      return endsAt;
    case "UNTIL_EVENT_START":
      return startsAt;
    case "AFTER_START_MINUTES": {
      const offset = event.cashReservationOffsetMinutes;
      if (!offset)
        throw new Error("cash_reservation_offset_minutes wajib untuk AFTER_START_MINUTES.");
      const afterStart = new Date(startsAt.getTime() + offset * MINUTE_MS);
      return afterStart < endsAt ? afterStart : endsAt;
    }
  }
}
