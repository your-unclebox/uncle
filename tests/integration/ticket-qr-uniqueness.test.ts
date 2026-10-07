import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, it } from "vitest";

import { tickets } from "@/server/db/schema";

import { createEvent, createOrder, createTicket, useTestDatabase } from "../fixtures/db";
import { expectPgError, PG } from "../fixtures/pg-error";

// BR-TKT-01 & BR-TKT-03: QR Tiket unik, satu QR Tiket per order.
describe("keunikan QR Tiket", () => {
  const db = useTestDatabase();

  it("menolak dua tiket dengan qr_fingerprint yang sama", async () => {
    const event = await createEvent(db);
    const fingerprint = randomBytes(32);
    await createTicket(db, event.id, (await createOrder(db, event.id)).id, {
      qrFingerprint: fingerprint,
    });

    const otherOrder = await createOrder(db, event.id);
    await expectPgError(createTicket(db, event.id, otherOrder.id, { qrFingerprint: fingerprint }), {
      code: PG.UNIQUE,
      constraint: "tickets_qr_fingerprint_unique",
    });
  });

  it("menolak QR Tiket kedua untuk order yang sama", async () => {
    const event = await createEvent(db);
    const order = await createOrder(db, event.id);
    await createTicket(db, event.id, order.id);

    await expectPgError(createTicket(db, event.id, order.id), {
      code: PG.UNIQUE,
      constraint: "tickets_order_id_unique",
    });
  });

  it("menolak tiket yang menunjuk order milik event lain", async () => {
    const eventA = await createEvent(db);
    const eventB = await createEvent(db);
    const orderB = await createOrder(db, eventB.id);

    await expectPgError(createTicket(db, eventA.id, orderB.id), {
      code: PG.FOREIGN_KEY,
      constraint: "fk_tickets_order_same_event",
    });
  });

  it("menolak status CHECKED_IN tanpa checked_in_at", async () => {
    const event = await createEvent(db);
    const ticket = await createTicket(db, event.id, (await createOrder(db, event.id)).id);

    await expectPgError(
      db.update(tickets).set({ status: "CHECKED_IN" }).where(eq(tickets.id, ticket.id)),
      { code: PG.CHECK, constraint: "ck_tickets_checked_in_consistent" },
    );
  });
});
