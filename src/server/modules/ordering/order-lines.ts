import "server-only";

import type { DatabaseTransaction } from "@/server/db/client";
import type { events } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";

import { EventNotFoundError, SalesClosedError } from "./errors";
import { allocateQuota, type RequestedQuantity } from "./quota";

type EventRow = typeof events.$inferSelect;

export interface OrderLine {
  readonly ticketTypeId: string;
  readonly quantity: number;
  readonly unitPrice: bigint;
  readonly ticketTypeName: string;
}

/** BR-EVT-03: hanya event ACTIVE dengan penjualan terbuka yang menerima order. */
export function assertEventSellable(event: EventRow | undefined, now: Date): EventRow {
  if (!event || event.status === "DRAFT") throw new EventNotFoundError();
  if (event.status !== "ACTIVE" || !event.salesOpen) throw new SalesClosedError();
  if (!event.endsAt || event.endsAt <= now) throw new SalesClosedError();
  return event;
}

/**
 * BR-TRX-01/05 + alokasi kuota atomik (DRD §Database 5.1). Harga diambil
 * dari ticket_types yang terkunci (BR-TRX-04), bukan dari input.
 */
export async function allocateOrderLines(
  tx: DatabaseTransaction,
  event: EventRow,
  items: readonly RequestedQuantity[],
  now: Date,
): Promise<OrderLine[]> {
  const requested = items.filter((item) => item.quantity > 0);
  const totalQuantity = requested.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity < 1) throw new ValidationError({ items: ["Pilih minimal 1 tiket"] });
  if (totalQuantity > event.maxTicketsPerOrder) {
    throw new ValidationError({
      items: [`Maksimal ${event.maxTicketsPerOrder} tiket per transaksi`],
    });
  }
  const ticketTypeRows = await allocateQuota(tx, event.id, requested, now);
  return requested.map((item) => {
    const ticketType = ticketTypeRows.get(item.ticketTypeId);
    if (!ticketType) throw new Error("Jenis tiket hilang setelah alokasi kuota.");
    return {
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: ticketType.price,
      ticketTypeName: ticketType.name,
    };
  });
}
