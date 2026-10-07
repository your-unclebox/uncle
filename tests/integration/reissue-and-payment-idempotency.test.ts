import { describe, expect, it } from "vitest";

import { emailOutbox, webhookEvents } from "@/server/db/schema";

import { createEvent, createOrder, useTestDatabase } from "../fixtures/db";
import { expectPgError, PG } from "../fixtures/pg-error";

describe("UNIQUE reissued_from_order_id (D7 / BR-TKT-07)", () => {
  const db = useTestDatabase();

  it("hanya satu order baru per reservasi kedaluwarsa", async () => {
    const event = await createEvent(db);
    const expired = await createOrder(db, event.id, { status: "EXPIRED" });
    const paid = { status: "PAID" as const, expiresAt: null, reissuedFromOrderId: expired.id };

    const first = await createOrder(db, event.id, paid);
    expect(first.reissuedFromOrderId).toBe(expired.id);

    await expectPgError(createOrder(db, event.id, paid), {
      code: PG.UNIQUE,
      constraint: "uq_orders_event_id_reissued_from",
    });
  });

  it("menolak reissue dari order milik event lain", async () => {
    const eventA = await createEvent(db);
    const eventB = await createEvent(db);
    const expiredB = await createOrder(db, eventB.id, { status: "EXPIRED" });

    await expectPgError(
      createOrder(db, eventA.id, {
        status: "PAID",
        expiresAt: null,
        reissuedFromOrderId: expiredB.id,
      }),
      { code: PG.FOREIGN_KEY, constraint: "fk_orders_reissued_from_same_event" },
    );
  });
});

describe("idempotensi pembayaran (BR-PAY-05)", () => {
  const db = useTestDatabase();

  it("webhook dengan dedupe_key sama tidak bisa tercatat dua kali", async () => {
    const webhook = {
      provider: "TRIPAY" as const,
      signatureValid: true,
      rawBody: "{}",
      dedupeKey: `TRIPAY:T-${crypto.randomUUID()}:PAID`,
    };
    await db.insert(webhookEvents).values(webhook);

    await expectPgError(db.insert(webhookEvents).values(webhook), {
      code: PG.UNIQUE,
      constraint: "webhook_events_dedupe_key_unique",
    });
  });

  it("email TICKET_ISSUED tidak bisa diantrekan dua kali untuk order yang sama", async () => {
    const event = await createEvent(db);
    const order = await createOrder(db, event.id, { status: "PAID", expiresAt: null });
    const email = {
      eventId: event.id,
      orderId: order.id,
      type: "TICKET_ISSUED" as const,
      toEmail: order.customerEmail,
    };
    await db.insert(emailOutbox).values(email);

    await expectPgError(db.insert(emailOutbox).values(email), {
      code: PG.UNIQUE,
      constraint: "uq_email_outbox_ticket_email_per_order",
    });
  });

  it("order dengan Idempotency-Key sama di event yang sama ditolak", async () => {
    const event = await createEvent(db);
    await createOrder(db, event.id, { idempotencyKey: "key-1" });

    await expectPgError(createOrder(db, event.id, { idempotencyKey: "key-1" }), {
      code: PG.UNIQUE,
      constraint: "uq_orders_event_id_idempotency_key",
    });
  });
});
