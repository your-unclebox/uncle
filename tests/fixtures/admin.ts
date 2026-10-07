import type { Database } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema";
import { createCashOrder } from "@/server/modules/ordering";
import { issueTicket } from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { createOrder } from "./db";
import { BEFORE_EVENT, qrSigningKey } from "./ordering";

type Line = { ticketTypeId: string; name: string; quantity: number; unitPrice?: bigint };

/** Order QRIS yang sudah Lunas + QR Tiket asli (tanpa gateway). */
export async function paidQrisOrder(
  db: Database,
  eventId: string,
  lines: Line[],
  overrides: Partial<typeof orders.$inferInsert> = {},
) {
  const total = lines.reduce((sum, l) => sum + (l.unitPrice ?? 75_000n) * BigInt(l.quantity), 0n);
  const order = await createOrder(db, eventId, {
    paymentMethod: "QRIS",
    status: "PAID",
    totalAmount: total,
    expiresAt: null,
    paidAt: BEFORE_EVENT,
    paidVia: "GATEWAY_WEBHOOK",
    customerName: "Budi Santoso",
    customerPhone: "+6281234567890",
    customerEmail: "budi@mail.com",
    ...overrides,
  });
  await db.insert(orderItems).values(
    lines.map((line) => ({
      eventId,
      orderId: order.id,
      ticketTypeId: line.ticketTypeId,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? 75_000n,
      ticketTypeName: line.name,
    })),
  );
  const { ticket, qrPayload } = await db.transaction((tx) =>
    issueTicket(tx, { eventId, orderId: order.id, qrSigningKey, now: BEFORE_EVENT }),
  );
  return { order, ticket, qrPayload };
}

/** Checkout Cash dengan data pembeli tertentu (fixture `checkout` memakai Siti R.). */
export function cashOrderFor(
  db: Database,
  eventId: string,
  items: Array<{ ticketTypeId: string; quantity: number }>,
  customer: { name: string; phone: string; email: string },
  now = BEFORE_EVENT,
) {
  return withTenant(db, { eventId }, (repo) =>
    createCashOrder(repo, { items, customer }, { qrSigningKey, now }),
  );
}
