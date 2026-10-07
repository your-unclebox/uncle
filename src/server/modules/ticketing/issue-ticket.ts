import "server-only";

import { randomUUID } from "node:crypto";

import type { DatabaseTransaction } from "@/server/db/client";
import { tickets } from "@/server/db/schema";

import { buildTicketQrPayload, ticketQrFingerprint } from "./ticket-qr";

export interface IssuedTicket {
  readonly ticket: typeof tickets.$inferSelect;
  readonly qrPayload: string;
}

// Satu QR Tiket per order (BR-TKT-03). QRIS: saat PAID; Cash: saat RESERVED.
export async function issueTicket(
  tx: DatabaseTransaction,
  params: { eventId: string; orderId: string; qrSigningKey: Buffer; now: Date },
): Promise<IssuedTicket> {
  const ticketId = randomUUID();
  const qrPayload = buildTicketQrPayload(params.qrSigningKey, {
    ticketId,
    eventId: params.eventId,
    qrVersion: 1,
  });
  const [ticket] = await tx
    .insert(tickets)
    .values({
      id: ticketId,
      eventId: params.eventId,
      orderId: params.orderId,
      qrVersion: 1,
      qrFingerprint: ticketQrFingerprint(qrPayload),
      issuedAt: params.now,
    })
    .returning();
  if (!ticket) throw new Error("Gagal menerbitkan QR Tiket.");
  return { ticket, qrPayload };
}

// Payload bisa dibangun ulang dari data tiket (mis. replay Idempotency-Key).
export function rebuildTicketQrPayload(
  ticket: Pick<typeof tickets.$inferSelect, "id" | "eventId" | "qrVersion">,
  qrSigningKey: Buffer,
): string {
  return buildTicketQrPayload(qrSigningKey, {
    ticketId: ticket.id,
    eventId: ticket.eventId,
    qrVersion: ticket.qrVersion,
  });
}
