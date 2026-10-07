import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { sha256 } from "@/lib/crypto/tokens";
import { emailOutbox, events, orders, ticketTypes } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";
import {
  EventNotFoundError,
  PaymentMethodUnavailableError,
  QuotaInsufficientError,
  SalesClosedError,
} from "@/server/modules/ordering";
import { ticketQrFingerprint } from "@/server/modules/ticketing";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { BEFORE_EVENT, checkout, EVENT_ENDS_AT, EVENT_STARTS_AT } from "../../fixtures/ordering";

describe("createCashOrder (LP-08, BR-TRX-08)", () => {
  const db = useTestDatabase();

  async function setup(eventOverrides: Partial<typeof events.$inferInsert> = {}) {
    const event = await createEvent(db, {
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
      ...eventOverrides,
    });
    const reguler = await createTicketType(db, event.id, {
      name: "Reguler",
      price: 75_000n,
      quota: 150,
    });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n, quota: 50 });
    return { event, reguler, vip };
  }

  async function allocated(id: string) {
    const [row] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, id));
    return row?.allocatedCount;
  }

  it("AC-LP-08.1: order RESERVED, batas = jam selesai event, kuota ditahan, QR Tiket terbit", async () => {
    const { event, reguler, vip } = await setup();
    const result = await checkout(db, event.id, [
      { ticketTypeId: reguler.id, quantity: 2 },
      { ticketTypeId: vip.id, quantity: 1 },
    ]);

    expect(result.order).toMatchObject({
      status: "RESERVED",
      paymentMethod: "CASH",
      totalAmount: 300_000n,
      customerPhone: "+6281311221122",
      eventId: event.id,
    });
    expect(result.order.orderCode).toMatch(/^UNC-[0-9A-Z]{6}$/);
    expect(result.order.expiresAt).toEqual(EVENT_ENDS_AT);
    expect(result.order.accessTokenHash?.equals(sha256(result.accessToken))).toBe(true);
    expect(result.items.map((i) => [i.ticketTypeName, i.quantity, i.unitPrice])).toEqual(
      expect.arrayContaining([
        ["Reguler", 2, 75_000n],
        ["VIP", 1, 150_000n],
      ]),
    );
    expect(result.ticket.status).toBe("ISSUED");
    expect(result.ticket.qrFingerprint.equals(ticketQrFingerprint(result.qrPayload))).toBe(true);
    expect(await allocated(reguler.id)).toBe(2);
    expect(await allocated(vip.id)).toBe(1);

    const emails = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, result.order.id));
    expect(emails.map((e) => e.type)).toEqual(["CASH_RESERVATION"]);
  });

  it("AC-LP-08.3: batas dipercepat Owner ke jam mulai event", async () => {
    const { event, vip } = await setup({ cashReservationMode: "UNTIL_EVENT_START" });
    const result = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    expect(result.order.expiresAt).toEqual(EVENT_STARTS_AT);
  });

  it("menolak event Draft, penjualan ditutup, Cash nonaktif, dan batas yang sudah lewat", async () => {
    const draft = await setup({ status: "DRAFT" });
    await expect(
      checkout(db, draft.event.id, [{ ticketTypeId: draft.vip.id, quantity: 1 }]),
    ).rejects.toBeInstanceOf(EventNotFoundError);

    const closed = await setup({ salesOpen: false });
    await expect(
      checkout(db, closed.event.id, [{ ticketTypeId: closed.vip.id, quantity: 1 }]),
    ).rejects.toBeInstanceOf(SalesClosedError);

    const finished = await setup({ status: "FINISHED" });
    await expect(
      checkout(db, finished.event.id, [{ ticketTypeId: finished.vip.id, quantity: 1 }]),
    ).rejects.toBeInstanceOf(SalesClosedError);

    const noCash = await setup({ cashEnabled: false });
    await expect(
      checkout(db, noCash.event.id, [{ ticketTypeId: noCash.vip.id, quantity: 1 }]),
    ).rejects.toBeInstanceOf(PaymentMethodUnavailableError);

    const startMode = await setup({ cashReservationMode: "UNTIL_EVENT_START" });
    await expect(
      checkout(db, startMode.event.id, [{ ticketTypeId: startMode.vip.id, quantity: 1 }], {
        now: new Date("2026-12-20T19:05:00+07:00"),
      }),
    ).rejects.toBeInstanceOf(SalesClosedError);
  });

  it("AC-LP-06.7: maksimal 10 tiket per transaksi; total 0 ditolak", async () => {
    const { event, reguler, vip } = await setup();
    await expect(
      checkout(db, event.id, [
        { ticketTypeId: reguler.id, quantity: 6 },
        { ticketTypeId: vip.id, quantity: 5 },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      checkout(db, event.id, [{ ticketTypeId: reguler.id, quantity: 0 }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("menolak jenis tiket milik event lain", async () => {
    const { event } = await setup();
    const other = await setup();
    await expect(
      checkout(db, event.id, [{ ticketTypeId: other.vip.id, quantity: 1 }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("kuota tidak cukup → QUOTA_INSUFFICIENT dengan sisa kuota, tanpa efek samping", async () => {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const reguler = await createTicketType(db, event.id, { name: "Reguler", quota: 5 });
    const vip = await createTicketType(db, event.id, { name: "VIP", quota: 3, allocatedCount: 2 });

    const error = await checkout(db, event.id, [
      { ticketTypeId: reguler.id, quantity: 2 },
      { ticketTypeId: vip.id, quantity: 2 },
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QuotaInsufficientError);
    expect((error as QuotaInsufficientError).remaining).toEqual(
      expect.arrayContaining([
        { ticketTypeId: vip.id, name: "VIP", remaining: 1 },
        { ticketTypeId: reguler.id, name: "Reguler", remaining: 5 },
      ]),
    );
    expect(await allocated(reguler.id)).toBe(0);
    expect(await allocated(vip.id)).toBe(2);
    expect(await db.select().from(orders).where(eq(orders.eventId, event.id))).toHaveLength(0);
  });

  it("jenis tiket nonaktif dianggap kuota 0", async () => {
    const { event, vip } = await setup();
    await db.update(ticketTypes).set({ isActive: false }).where(eq(ticketTypes.id, vip.id));
    const error = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]).catch(
      (e: unknown) => e,
    );
    expect((error as QuotaInsufficientError).remaining).toEqual([
      { ticketTypeId: vip.id, name: "VIP", remaining: 0 },
    ]);
  });

  it("AC-LP-06.6: 10 checkout bersamaan untuk VIP sisa 3 → tepat 3 berhasil, 0 oversell", async () => {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const vip = await createTicketType(db, event.id, { name: "VIP", quota: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]),
      ),
    );
    const rejected = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(rejected.every((r) => r.reason instanceof QuotaInsufficientError)).toBe(true);
    expect(await allocated(vip.id)).toBe(3);
  });

  it("Idempotency-Key sama → satu order, respons ulang memakai token baru", async () => {
    const { event, vip } = await setup();
    const first = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
      idempotencyKey: "klik-ganda",
    });
    const second = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
      idempotencyKey: "klik-ganda",
    });

    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.qrPayload).toBe(first.qrPayload);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.order.accessTokenHash?.equals(sha256(second.accessToken))).toBe(true);
    expect(await allocated(vip.id)).toBe(1);
  });

  it("Idempotency-Key sama dikirim bersamaan → tetap satu order", async () => {
    const { event, vip } = await setup();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
          idempotencyKey: "paralel",
        }),
      ),
    );
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(
      await db
        .select()
        .from(orders)
        .where(and(eq(orders.eventId, event.id), eq(orders.idempotencyKey, "paralel"))),
    ).toHaveLength(1);
    expect(await allocated(vip.id)).toBe(1);
  });

  it("issued_at QR Tiket memakai waktu transaksi checkout", async () => {
    const { event, vip } = await setup();
    const result = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }], {
      now: BEFORE_EVENT,
    });
    expect(result.ticket.issuedAt).toEqual(BEFORE_EVENT);
  });
});
