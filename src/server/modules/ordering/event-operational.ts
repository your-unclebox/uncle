import { toLocalDateKey } from "@/lib/datetime";
import type { events } from "@/server/db/schema";

// Scanner boleh dipakai sampai akhir hari event (PRD BR-EVT-08, DRD §Database 5.2a).
export function isEventOperational(event: typeof events.$inferSelect, now: Date): boolean {
  if (event.status === "ACTIVE") return true;
  if (event.status !== "FINISHED" || !event.endsAt) return false;
  return toLocalDateKey(now, event.timezone) <= toLocalDateKey(event.endsAt, event.timezone);
}
