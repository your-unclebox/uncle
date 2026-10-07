import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { emailOutbox, orders, tickets, ticketTypes } from "@/server/db/schema";
import { expireDueOrders } from "@/server/jobs/expire-orders";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { checkout, EVENT_ENDS_AT, EVENT_STARTS_AT } from "../../fixtures/ordering";

describe("kedaluwarsa reservasi Cash (BR-TRX-08)", () => {
  const db = useTestDatabase();
  const AFTER_EVENT = new Date("2026-12-20T22:01:00+07:00");

  async function setup(quota = 5) {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const vip = await createTicketType(db, event.id, { name: "VIP", quota });
    return { event, vip };
  }

  const orderById = async (id: string) =>
    (await db.select().from(orders).where(eq(orders.id, id)))[0];
  const ticketTypeById = async (id: string) =>
    (await db.select().from(ticketTypes).where(eq(ticketTypes.id, id)))[0];

  it("AC-LP-08.2: job expire-orders → EXPIRED, kuota kembali, QR Tiket VOID, email RESERVATION_EXPIRED", async () => {
    const { event, vip } = await setup();
    const { order } = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 2 }]);

    await expireDueOrders(db, { now: AFTER_EVENT });

    expect((await orderById(order.id))?.status).toBe("EXPIRED");
    expect((await ticketTypeById(vip.id))?.allocatedCount).toBe(0);
    const [ticket] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    expect(ticket).toMatchObject({ status: "VOID", voidReason: "ORDER_EXPIRED" });
    const emails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(emails.map((e) => e.type).sort()).toEqual(["CASH_RESERVATION", "RESERVATION_EXPIRED"]);
  });

  it("AC-LP-08.4: sebelum dan tepat di jam selesai event, reservasi tetap Reserved", async () => {
    const { event, vip } = await setup();
    const { order } = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    for (const now of [
      new Date("2026-12-19T19:00:00+07:00"), // H-1
      EVENT_STARTS_AT,
      EVENT_ENDS_AT,
    ]) {
      await expireDueOrders(db, { now });
      expect((await orderById(order.id))?.status).toBe("RESERVED");
    }
    expect((await ticketTypeById(vip.id))?.allocatedCount).toBe(1);
  });

  it("job idempoten: menjalankan dua kali tidak melepas kuota dua kali", async () => {
    const { event, vip } = await setup();
    await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    await expireDueOrders(db, { now: AFTER_EVENT });
    await expireDueOrders(db, { now: AFTER_EVENT });

    expect((await ticketTypeById(vip.id))?.allocatedCount).toBe(0);
  });

  it("sweep-on-write: kuota dari reservasi kedaluwarsa langsung bisa dibeli sebelum cron jalan", async () => {
    const { event, vip } = await setup(1);
    const { order: old } = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    // Event dengan Cash dipercepat ke jam mulai: reservasi lama lewat batas pukul 19:00.
    await db.update(orders).set({ expiresAt: EVENT_STARTS_AT }).where(eq(orders.id, old.id));
    const fresh = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
      now: new Date("2026-12-20T18:00:00+07:00"),
    }).catch((e: unknown) => e);
    expect(fresh).toBeInstanceOf(Error); // belum lewat batas → kuota masih dipegang

    const later = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
      now: new Date("2026-12-20T19:10:00+07:00"),
    });
    expect(later.order.status).toBe("RESERVED");
    expect((await orderById(old.id))?.status).toBe("EXPIRED");
    expect((await ticketTypeById(vip.id))?.allocatedCount).toBe(1);
  });
});
