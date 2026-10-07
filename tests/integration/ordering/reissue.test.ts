import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLogs, emailOutbox, events, orders, tickets, ticketTypes } from "@/server/db/schema";
import { expireDueOrders } from "@/server/jobs/expire-orders";
import { ValidationError } from "@/server/http/validation-error";
import {
  ActorRequiredError,
  AlreadyReissuedError,
  EventNotOperationalError,
  OrderNotExpiredError,
  OrderNotFoundError,
  PriceChangedError,
  QuotaInsufficientError,
} from "@/server/modules/ordering";

import { createEvent, createTicketType, createUser, useTestDatabase } from "../../fixtures/db";
import { checkout, EVENT_ENDS_AT, EVENT_STARTS_AT, reissue } from "../../fixtures/ordering";

// SCN-08 / BR-TKT-07 / D7. Batas reservasi dipercepat ke jam mulai (19:00);
// pembeli datang pukul 19:20 saat event masih berlangsung.
const AT_VENUE = new Date("2026-12-20T19:20:00+07:00");

describe("reissueExpiredOrder (buat pesanan baru dari reservasi kedaluwarsa)", () => {
  const db = useTestDatabase();

  async function setup(
    options: { vipQuota?: number; eventOverrides?: Partial<typeof events.$inferInsert> } = {},
  ) {
    const admin = await createUser(db);
    const event = await createEvent(db, {
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
      cashReservationMode: "UNTIL_EVENT_START",
      ...options.eventOverrides,
    });
    const reguler = await createTicketType(db, event.id, {
      name: "Reguler",
      price: 75_000n,
      quota: 10,
    });
    const vip = await createTicketType(db, event.id, {
      name: "VIP",
      price: 150_000n,
      quota: options.vipQuota ?? 5,
    });
    return { admin, event, reguler, vip };
  }

  async function expiredReservation(
    eventId: string,
    items: { ticketTypeId: string; quantity: number }[],
  ) {
    const created = await checkout(db, eventId, items);
    await expireDueOrders(db, { now: AT_VENUE });
    return created;
  }

  const allocatedOf = async (id: string) =>
    (await db.select().from(ticketTypes).where(eq(ticketTypes.id, id)))[0]?.allocatedCount;

  it("AC-SCN-08.2: order baru PAID dengan data sama, kode & QR baru, kuota dipakai lagi", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    expect(await allocatedOf(vip.id)).toBe(0);

    const result = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      AT_VENUE,
    );

    expect(result.order).toMatchObject({
      status: "PAID",
      paymentMethod: "CASH",
      paidVia: "CASH_MANUAL",
      cashConfirmedBy: admin.id,
      reissuedFromOrderId: old.order.id,
      customerName: old.order.customerName,
      customerPhone: old.order.customerPhone,
      customerEmail: old.order.customerEmail,
      totalAmount: 150_000n,
      expiresAt: null,
    });
    expect(result.order.paidAt).toEqual(AT_VENUE);
    expect(result.order.orderCode).not.toBe(old.order.orderCode);
    expect(result.qrPayload).not.toBe(old.qrPayload);
    expect(result.ticket.status).toBe("ISSUED");
    expect(await allocatedOf(vip.id)).toBe(1);

    const [oldTicket] = await db.select().from(tickets).where(eq(tickets.orderId, old.order.id));
    expect(oldTicket?.status).toBe("VOID");
    const emails = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, result.order.id));
    expect(emails.map((e) => e.type)).toEqual(["TICKET_ISSUED"]);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, result.order.id));
    expect(audit).toMatchObject({ action: "ORDER_REISSUED", actorUserId: admin.id });
  });

  it("reservasi RESERVED yang lewat batas tapi belum disapu cron tetap bisa di-reissue", async () => {
    const { admin, event, vip } = await setup();
    const old = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    const result = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      AT_VENUE,
    );

    expect(result.order.status).toBe("PAID");
    const [oldOrder] = await db.select().from(orders).where(eq(orders.id, old.order.id));
    expect(oldOrder?.status).toBe("EXPIRED");
    expect(await allocatedOf(vip.id)).toBe(1);
  });

  it("AC-SCN-08.3: kuota habis → QUOTA_INSUFFICIENT, tidak ada order baru", async () => {
    const { admin, event, vip } = await setup({ vipQuota: 1 });
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    // Kuota yang dilepas sudah dibeli orang lain.
    await db.update(ticketTypes).set({ allocatedCount: 1 }).where(eq(ticketTypes.id, vip.id));

    await expect(
      reissue(db, event.id, admin.id, { orderId: old.order.id, expectedTotal: 150_000 }, AT_VENUE),
    ).rejects.toBeInstanceOf(QuotaInsufficientError);
    expect(
      await db.select().from(orders).where(eq(orders.reissuedFromOrderId, old.order.id)),
    ).toHaveLength(0);
  });

  it("AC-SCN-08.6: multi-jenis dengan satu jenis habis → ditolak seluruhnya", async () => {
    const { admin, event, reguler, vip } = await setup({ vipQuota: 1 });
    const old = await expiredReservation(event.id, [
      { ticketTypeId: reguler.id, quantity: 2 },
      { ticketTypeId: vip.id, quantity: 1 },
    ]);
    await db.update(ticketTypes).set({ allocatedCount: 1 }).where(eq(ticketTypes.id, vip.id));

    const error = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 300_000 },
      AT_VENUE,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaInsufficientError);
    expect((error as QuotaInsufficientError).remaining).toContainEqual({
      ticketTypeId: vip.id,
      name: "VIP",
      remaining: 0,
    });
    expect(await allocatedOf(reguler.id)).toBe(0);
  });

  it("AC-SCN-08.5: reservasi yang sama tidak bisa dibuatkan order baru dua kali", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    const first = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      AT_VENUE,
    );

    const error = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      AT_VENUE,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyReissuedError);
    expect((error as AlreadyReissuedError).newOrderCode).toBe(first.order.orderCode);
  });

  it("dua admin menekan tombol bersamaan → tepat satu order baru", async () => {
    const { admin, event, vip } = await setup();
    const otherAdmin = await createUser(db);
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    const results = await Promise.allSettled(
      [admin.id, otherAdmin.id].map((actor) =>
        reissue(db, event.id, actor, { orderId: old.order.id, expectedTotal: 150_000 }, AT_VENUE),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(AlreadyReissuedError);
    expect(await allocatedOf(vip.id)).toBe(1);
  });

  it("Idempotency-Key sama mengembalikan order yang sama", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    const input = { orderId: old.order.id, expectedTotal: 150_000, idempotencyKey: "scan-1" };

    const first = await reissue(db, event.id, admin.id, input, AT_VENUE);
    const second = await reissue(db, event.id, admin.id, input, AT_VENUE);
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.qrPayload).toBe(first.qrPayload);
  });

  it("PRICE_CHANGED bila harga berubah sejak scan", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    await db.update(ticketTypes).set({ price: 175_000n }).where(eq(ticketTypes.id, vip.id));

    const error = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      AT_VENUE,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PriceChangedError);
    expect((error as PriceChangedError).totalAmount).toBe(175_000n);
    expect(await allocatedOf(vip.id)).toBe(0);
  });

  it("ORDER_NOT_EXPIRED untuk reservasi yang masih berlaku", async () => {
    const { admin, event, vip } = await setup({
      eventOverrides: { cashReservationMode: "UNTIL_EVENT_END" },
    });
    const active = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    await expect(
      reissue(
        db,
        event.id,
        admin.id,
        { orderId: active.order.id, expectedTotal: 150_000 },
        AT_VENUE,
      ),
    ).rejects.toBeInstanceOf(OrderNotExpiredError);
  });

  it("order milik event lain → ORDER_NOT_FOUND (404)", async () => {
    const a = await setup();
    const b = await setup();
    const oldB = await expiredReservation(b.event.id, [{ ticketTypeId: b.vip.id, quantity: 1 }]);
    await expect(
      reissue(
        db,
        a.event.id,
        a.admin.id,
        { orderId: oldB.order.id, expectedTotal: 150_000 },
        AT_VENUE,
      ),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("event FINISHED: boleh di hari yang sama, ditolak keesokan harinya", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    await db.update(events).set({ status: "FINISHED" }).where(eq(events.id, event.id));

    await expect(
      reissue(
        db,
        event.id,
        admin.id,
        { orderId: old.order.id, expectedTotal: 150_000 },
        new Date("2026-12-21T08:00:00+07:00"),
      ),
    ).rejects.toBeInstanceOf(EventNotOperationalError);

    const sameDay = await reissue(
      db,
      event.id,
      admin.id,
      { orderId: old.order.id, expectedTotal: 150_000 },
      new Date("2026-12-20T23:30:00+07:00"),
    );
    expect(sameDay.order.status).toBe("PAID");
  });

  it("wajib actor admin dan konfirmasi terima uang", async () => {
    const { admin, event, vip } = await setup();
    const old = await expiredReservation(event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    await expect(
      reissue(db, event.id, undefined, { orderId: old.order.id, expectedTotal: 150_000 }, AT_VENUE),
    ).rejects.toBeInstanceOf(ActorRequiredError);
    await expect(
      reissue(
        db,
        event.id,
        admin.id,
        { orderId: old.order.id, expectedTotal: 150_000, cashReceived: false },
        AT_VENUE,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
