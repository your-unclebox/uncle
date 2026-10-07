import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { events, orders, tickets } from "@/server/db/schema";
import {
  ActorRequiredError,
  confirmCashPayment,
  getAdminOrderDetail,
  OrderNotFoundError,
  OrderNotReservedError,
} from "@/server/modules/ordering";
import { AlreadyCheckedInError, checkInTicket, scanTicket } from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { cashOrderFor, paidQrisOrder } from "../../fixtures/admin";
import {
  createEvent,
  createOrder,
  createTicketType,
  createUser,
  useTestDatabase,
} from "../../fixtures/db";
import {
  BEFORE_EVENT,
  EVENT_ENDS_AT,
  EVENT_STARTS_AT,
  qrSigningKey,
  reissue,
} from "../../fixtures/ordering";

const AT_VENUE = new Date("2026-12-20T19:20:00+07:00");

// Cabang tepi Admin Dashboard & Scanner: aktor wajib, ID tidak valid, riwayat
// lengkap, balapan konfirmasi Cash, dan varian hasil scan yang jarang.
describe("Admin & Scanner: kasus tepi", () => {
  const db = useTestDatabase();
  let eventId: string;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let reguler: Awaited<ReturnType<typeof createTicketType>>;
  let phoneSeq = 20_000_000;

  const asAdmin = <T>(work: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, { eventId, actorUserId: admin.id }, work);
  const scan = (input: unknown, now = BEFORE_EVENT, tenantEventId = eventId) =>
    scanTicket(db, { eventId: tenantEventId, actorUserId: admin.id }, input, { qrSigningKey, now });
  const cash = (targetEventId = eventId, now = BEFORE_EVENT) =>
    cashOrderFor(
      db,
      targetEventId,
      [{ ticketTypeId: reguler.id, quantity: 1 }],
      { name: "Tepi Kasus", phone: `0813${(phoneSeq += 1)}`, email: "tepi@example.com" },
      now,
    );

  beforeAll(async () => {
    admin = await createUser(db, { name: "Rina" });
    eventId = (
      await createEvent(db, {
        startsAt: EVENT_STARTS_AT,
        endsAt: EVENT_ENDS_AT,
        cashReservationMode: "UNTIL_EVENT_START",
      })
    ).id;
    reguler = await createTicketType(db, eventId, { name: "Reguler", quota: 50 });
  });

  it("aksi admin tanpa actorUserId ditolak (bug pemanggil, bukan input klien)", async () => {
    const order = await cash();
    await expect(
      withTenant(db, { eventId }, (repo) =>
        confirmCashPayment(repo, order.order.id, { cashReceived: true }),
      ),
    ).rejects.toBeInstanceOf(ActorRequiredError);
    await expect(
      withTenant(db, { eventId }, (repo) => checkInTicket(repo, order.ticket.id)),
    ).rejects.toBeInstanceOf(ActorRequiredError);
  });

  it("ID bukan UUID / tidak ada → OrderNotFound", async () => {
    await expect(asAdmin((repo) => getAdminOrderDetail(repo, "bukan-uuid"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    await expect(
      asAdmin((repo) => confirmCashPayment(repo, "bukan-uuid", { cashReceived: true })),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(
      asAdmin((repo) => confirmCashPayment(repo, randomUUID(), { cashReceived: true })),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(asAdmin((repo) => getAdminOrderDetail(repo, randomUUID()))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it("konfirmasi Cash kalah balapan dengan transaksi lain → 409 ORDER_NOT_RESERVED", async () => {
    const order = await cash();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const hasLock = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Transaksi lain (mis. cron expire) mengunci & mengubah order lebih dulu.
    const other = db.transaction(async (tx) => {
      await tx.select().from(orders).where(eq(orders.id, order.order.id)).for("update");
      await tx
        .update(orders)
        .set({ status: "CANCELLED", cancelledAt: BEFORE_EVENT })
        .where(eq(orders.id, order.order.id));
      locked();
      await gate;
    });
    await hasLock;
    const confirming = asAdmin((repo) =>
      confirmCashPayment(repo, order.order.id, { cashReceived: true }),
    );
    // Beri waktu confirm membaca RESERVED lalu menunggu kunci baris.
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await other;
    await expect(confirming).rejects.toMatchObject({
      code: "ORDER_NOT_RESERVED",
      orderStatus: "CANCELLED",
    });
    await expect(confirming).rejects.toBeInstanceOf(OrderNotReservedError);
  });

  it("riwayat detail: dibatalkan, refund, diambil tanpa nama admin, pesanan baru dari reservasi", async () => {
    const cancelled = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    await db
      .update(orders)
      .set({
        status: "REFUNDED",
        cancelledAt: AT_VENUE,
        cancelledBy: admin.id,
        refundMarkedAt: AT_VENUE,
        refundMarkedBy: admin.id,
      })
      .where(eq(orders.id, cancelled.order.id));
    await db
      .update(tickets)
      .set({ status: "CHECKED_IN", checkedInAt: BEFORE_EVENT, checkedInBy: null })
      .where(eq(tickets.id, cancelled.ticket.id));
    const detail = await asAdmin((repo) => getAdminOrderDetail(repo, cancelled.order.id));
    expect(detail.history.map((h) => h.label)).toEqual(
      expect.arrayContaining([
        "Tiket diambil",
        "Dibatalkan, oleh Rina",
        "Ditandai refund, oleh Rina",
      ]),
    );
    expect(detail.ticket?.checkedInBy).toBeNull();

    // Diambil tanpa nama admin → AlreadyCheckedIn dengan checkedInBy null.
    await db.update(orders).set({ status: "PAID" }).where(eq(orders.id, cancelled.order.id));
    await expect(asAdmin((repo) => checkInTicket(repo, cancelled.ticket.id))).rejects.toMatchObject(
      { checkedInBy: null },
    );
    await expect(
      asAdmin((repo) => checkInTicket(repo, cancelled.ticket.id)),
    ).rejects.toBeInstanceOf(AlreadyCheckedInError);

    // Reservasi kedaluwarsa → pesanan baru: riwayat dua arah.
    const old = await cash();
    await scan({ orderCode: old.order.orderCode }, AT_VENUE);
    const created = await reissue(
      db,
      eventId,
      admin.id,
      { orderId: old.order.id, expectedTotal: 75_000 },
      AT_VENUE,
    );
    const oldDetail = await asAdmin((repo) => getAdminOrderDetail(repo, old.order.id, AT_VENUE));
    expect(oldDetail.reissuedTo?.code).toBe(created.order.orderCode);
    expect(oldDetail.history.map((h) => h.label)).toContain(
      `Dibuatkan pesanan baru ${created.order.orderCode}`,
    );
    const newDetail = await asAdmin((repo) =>
      getAdminOrderDetail(repo, created.order.id, AT_VENUE),
    );
    expect(newDetail.reissuedFrom?.code).toBe(old.order.orderCode);
    expect(newDetail.history[0]?.label).toBe(
      `Pesanan dibuat dari reservasi kedaluwarsa ${old.order.orderCode}, oleh Rina`,
    );
  });

  it("scan: QRIS kedaluwarsa → QRIS_NOT_PAID; PAID dengan tiket VOID → CANCELLED", async () => {
    const expiredQris = await createOrder(db, eventId, {
      paymentMethod: "QRIS",
      status: "EXPIRED",
      expiresAt: BEFORE_EVENT,
    });
    expect(await scan({ orderCode: expiredQris.orderCode })).toMatchObject({
      result: "QRIS_NOT_PAID",
      order: { status: "EXPIRED" },
    });

    const paid = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    await db.update(tickets).set({ status: "VOID" }).where(eq(tickets.id, paid.ticket.id));
    expect(await scan({ payload: paid.qrPayload })).toMatchObject({
      result: "CANCELLED",
      actions: { canCheckIn: false },
    });
  });

  it("reservasi kedaluwarsa di event yang sudah lewat harinya → kuota ada tapi tidak bisa reissue", async () => {
    const finished = await createEvent(db, {
      status: "ACTIVE",
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
    });
    const type = await createTicketType(db, finished.id, { quota: 10 });
    const order = await cashOrderFor(db, finished.id, [{ ticketTypeId: type.id, quantity: 1 }], {
      name: "Telat Sehari",
      phone: "081355556666",
      email: "telat@example.com",
    });
    await db.update(events).set({ status: "FINISHED" }).where(eq(events.id, finished.id));
    const nextDay = new Date("2026-12-21T12:00:00+07:00");
    const view = await scanTicket(
      db,
      { eventId: finished.id, actorUserId: admin.id },
      { orderCode: order.order.orderCode },
      { qrSigningKey, now: nextDay },
    );
    expect(view).toMatchObject({
      result: "RESERVATION_EXPIRED",
      reissue: { available: true, reissuedOrder: null },
      actions: { canReissue: false },
    });
  });
});
