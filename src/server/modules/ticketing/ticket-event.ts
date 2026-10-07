import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { tickets } from "@/server/db/schema";

/**
 * event_id sebuah QR Tiket lintas tenant — HANYA untuk membedakan hasil scan
 * OTHER_EVENT dari INVALID (DRD Security §6). Tidak mengembalikan data order;
 * MAC tetap diverifikasi pemanggil terhadap event_id ini.
 */
export async function findTicketEventId(db: Database, ticketId: string): Promise<string | null> {
  const [row] = await db
    .select({ eventId: tickets.eventId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  return row?.eventId ?? null;
}
