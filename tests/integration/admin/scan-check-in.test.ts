import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditLogs, orders, tickets, ticketTypes } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";
import { confirmCashPayment } from "@/server/modules/ordering";
import {
  AlreadyCheckedInError,
  buildTicketQrPayload,
  checkInTicket,
  describeOrderForScanner,
  OrderNotPaidError,
  scanTicket,
  TicketNotFoundError,
  TicketVoidError,
} from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { cashOrderFor, paidQrisOrder } from "../../fixtures/admin";
import {
  createEvent,
  createOrder,
  createTicketType,
  createUser,
  useTestDatabase,
} from "../../fixtures/db";
import { EVENT_ENDS_AT, EVENT_STARTS_AT, qrSigningKey, reissue } from "../../fixtures/ordering";

// Batas reservasi dipercepat ke jam mulai; admin scan pukul 19:20 (AC-SCN-08.1).
const AT_VENUE = new Date("2026-12-20T19:20:00+07:00");
const BEFORE_START = new Date("2026-12-20T18:40:00+07:00");

// SCN-02 … SCN-08, DRD API §5 `…/scan` & `…/check-in`, Security §6.
describe("Scanner: scan, Konfirmasi Lunas, Tandai Diambil", () => {
  const db = useTestDatabase();
  let eventId: string;
  let otherEventId: string;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let reguler: Awaited<ReturnType<typeof createTicketType>>;
  let vip: Awaited<ReturnType<typeof createTicketType>>;

  const tenant = () => ({ eventId, actorUserId: admin.id });
  const scan = (input: unknown, now = BEFORE_START, tenantId = eventId) =>
    scanTicket(db, { eventId: tenantId, actorUserId: admin.id }, input, { qrSigningKey, now });
  const checkIn = (ticketId: string, actorUserId = admin.id) =>
    withTenant(db, { eventId, actorUserId }, (repo) =>
      checkInTicket(repo, ticketId, { now: AT_VENUE }),
    );
  let phoneSeq = 10_000_000;
  const cash = (items: Array<{ ticketTypeId: string; quantity: number }>, name = "Siti R.") =>
    cashOrderFor(db, eventId, items, {
      name,
      phone: `0813${(phoneSeq += 1)}`,
      email: "siti@example.com",
    });

  beforeAll(async () => {
    admin = await createUser(db, { name: "Rina" });
    eventId = (
      await createEvent(db, {
        name: "Teater Bagol",
        startsAt: EVENT_STARTS_AT,
        endsAt: EVENT_ENDS_AT,
        cashReservationMode: "UNTIL_EVENT_START",
      })
    ).id;
    otherEventId = (await createEvent(db, { name: "Konser X" })).id;
    reguler = await createTicketType(db, eventId, { name: "Reguler", quota: 50 });
    vip = await createTicketType(db, eventId, { name: "VIP", price: 150_000n, quota: 5 });
  });

  it("QRIS Lunas → READY_PICKUP; Tandai Diambil; scan ulang → ALREADY_CHECKED_IN (AC-SCN-02.1/03.1/05.1)", async () => {
    const budi = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 2 },
    ]);
    const view = await scan({ payload: budi.qrPayload });
    expect(view).toMatchObject({
      result: "READY_PICKUP",
      ticket: { id: budi.ticket.id, status: "ISSUED" },
      order: {
        code: budi.order.orderCode,
        customerName: "Budi Santoso",
        paymentMethod: "QRIS",
        status: "PAID",
        items: [{ name: "Reguler", quantity: 2 }],
      },
      actions: { canConfirmCash: false, canCheckIn: true, canReissue: false },
    });

    const checked = await checkIn(budi.ticket.id);
    expect(checked).toMatchObject({
      status: "CHECKED_IN",
      checkedInBy: admin.id,
      checkedInAt: AT_VENUE,
    });

    const again = await scan({ payload: budi.qrPayload });
    expect(again).toMatchObject({
      result: "ALREADY_CHECKED_IN",
      ticket: { status: "CHECKED_IN", checkedInBy: "Rina", checkedInAt: AT_VENUE },
      actions: { canCheckIn: false },
    });
    await expect(checkIn(budi.ticket.id)).rejects.toMatchObject({
      code: "ALREADY_CHECKED_IN",
      checkedInBy: "Rina",
    });
  });

  it("dua HP menandai diambil bersamaan → tepat satu berhasil (AC-SCN-07.1)", async () => {
    const order = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    const dodi = await createUser(db, { name: "Dodi" });
    const results = await Promise.allSettled([
      checkIn(order.ticket.id),
      checkIn(order.ticket.id, dodi.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost?.status === "rejected" && lost.reason).toBeInstanceOf(AlreadyCheckedInError);
    const audits = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityId, order.ticket.id), eq(auditLogs.action, "TICKET_CHECKED_IN")),
      );
    expect(audits).toHaveLength(1);
  });

  it("Cash belum bayar → CASH_UNPAID; Diambil ditolak; Konfirmasi Lunas → READY_PICKUP (AC-SCN-04.1/04.2)", async () => {
    const siti = await cash([{ ticketTypeId: vip.id, quantity: 1 }]);
    const view = await scan({ payload: siti.qrPayload });
    expect(view).toMatchObject({
      result: "CASH_UNPAID",
      order: { paymentMethod: "CASH", status: "RESERVED", totalAmount: 150_000n },
      actions: { canConfirmCash: true, canCheckIn: false },
    });
    await expect(checkIn(siti.ticket.id)).rejects.toBeInstanceOf(OrderNotPaidError);

    const after = await withTenant(db, tenant(), async (repo) => {
      await confirmCashPayment(repo, siti.order.id, { cashReceived: true }, { now: BEFORE_START });
      return describeOrderForScanner(repo, siti.order.id, BEFORE_START);
    });
    expect(after).toMatchObject({
      result: "READY_PICKUP",
      order: { status: "PAID", paidVia: "CASH_MANUAL", cashConfirmedBy: "Rina" },
      actions: { canCheckIn: true, canConfirmCash: false },
    });
    await expect(checkIn(siti.ticket.id)).resolves.toMatchObject({ status: "CHECKED_IN" });
  });

  describe("Reservasi Kedaluwarsa (SCN-08, BR-TKT-07)", () => {
    it("RESERVED lewat batas belum disapu cron → di-EXPIRED-kan saat scan, kuota dilepas, blok reissue (AC-SCN-08.1)", async () => {
      const siti = await cash([{ ticketTypeId: vip.id, quantity: 1 }]);
      const allocated = async () =>
        (await db.select().from(ticketTypes).where(eq(ticketTypes.id, vip.id)))[0]
          ?.allocatedCount ?? -1;
      const before = await allocated();

      const view = await scan({ payload: siti.qrPayload }, AT_VENUE);
      expect(view).toMatchObject({
        result: "RESERVATION_EXPIRED",
        ticket: { status: "VOID" },
        order: { status: "EXPIRED", customerName: "Siti R." },
        reissue: {
          available: true,
          totalAmount: 150_000n,
          items: [{ ticketTypeId: vip.id, name: "VIP", quantity: 1, unitPrice: 150_000n }],
          reissuedOrder: null,
        },
        actions: { canReissue: true, canCheckIn: false, canConfirmCash: false },
      });
      expect(await allocated()).toBe(before - 1);
      const [row] = await db.select().from(orders).where(eq(orders.id, siti.order.id));
      expect(row?.status).toBe("EXPIRED");

      // Setelah dibuatkan pesanan baru → info kode baru, tanpa aksi (AC-SCN-08.5).
      const created = await reissue(
        db,
        eventId,
        admin.id,
        { orderId: siti.order.id, expectedTotal: 150_000 },
        AT_VENUE,
      );
      const rescanned = await scan({ payload: siti.qrPayload }, AT_VENUE);
      expect(rescanned).toMatchObject({
        result: "RESERVATION_EXPIRED",
        reissue: {
          reissuedOrder: {
            id: created.order.id,
            code: created.order.orderCode,
            createdBy: "Rina",
            ticketStatus: "ISSUED",
          },
        },
        actions: { canReissue: false },
      });
      const fresh = await scan({ payload: created.qrPayload }, AT_VENUE);
      expect(fresh).toMatchObject({
        result: "READY_PICKUP",
        order: { reissuedFromOrderCode: siti.order.orderCode, cashConfirmedBy: "Rina" },
      });
    });

    it("multi jenis, salah satu habis → available=false tanpa aksi (AC-SCN-08.3/08.6)", async () => {
      const tight = await createTicketType(db, eventId, { name: "Balkon", quota: 1 });
      const order = await cash([
        { ticketTypeId: reguler.id, quantity: 2 },
        { ticketTypeId: tight.id, quantity: 1 },
      ]);
      // Kuota Balkon terakhir dibeli orang lain setelah reservasi kedaluwarsa.
      await scan({ payload: order.qrPayload }, AT_VENUE);
      await db.update(ticketTypes).set({ allocatedCount: 1 }).where(eq(ticketTypes.id, tight.id));

      const view = await scan({ payload: order.qrPayload }, AT_VENUE);
      expect(view.result).toBe("RESERVATION_EXPIRED");
      expect(view.reissue?.available).toBe(false);
      expect(view.reissue?.items.find((i) => i.name === "Balkon")).toMatchObject({ remaining: 0 });
      expect(view.actions.canReissue).toBe(false);
    });
  });

  it("transaksi dibatalkan → CANCELLED tanpa aksi (AC-SCN-05.4); tiket VOID tidak bisa diambil", async () => {
    const order = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    await db
      .update(orders)
      .set({ status: "CANCELLED", cancelledAt: AT_VENUE })
      .where(eq(orders.id, order.order.id));
    await db
      .update(tickets)
      .set({ status: "VOID", voidedAt: AT_VENUE })
      .where(eq(tickets.id, order.ticket.id));
    const view = await scan({ payload: order.qrPayload });
    expect(view).toMatchObject({ result: "CANCELLED", actions: { canCheckIn: false } });
    await expect(checkIn(order.ticket.id)).rejects.toBeInstanceOf(TicketVoidError);
  });

  it("QR event lain → OTHER_EVENT tanpa data transaksi (AC-SCN-05.2)", async () => {
    const foreignType = await createTicketType(db, otherEventId);
    const foreign = await paidQrisOrder(db, otherEventId, [
      { ticketTypeId: foreignType.id, name: "X", quantity: 1 },
    ]);
    const view = await scan({ payload: foreign.qrPayload });
    expect(view).toEqual({
      result: "OTHER_EVENT",
      actions: { canConfirmCash: false, canCheckIn: false, canReissue: false },
    });
    // Check-in dengan ticketId event lain → tidak ditemukan (bukan 403).
    await expect(checkIn(foreign.ticket.id)).rejects.toBeInstanceOf(TicketNotFoundError);
    await expect(checkIn("bukan-uuid")).rejects.toBeInstanceOf(TicketNotFoundError);
  });

  it.each([
    ["QR acak", "https://contoh.com/promo", "UNKNOWN_QR"],
    ["QR pembayaran QRIS", "00020101021226670016COM.NOBUBANK.WWW", "PAYMENT_QR"],
    [
      "format U1 tapi tiket tidak ada",
      buildTicketQrPayload(qrSigningKey, {
        ticketId: randomUUID(),
        eventId: randomUUID(),
        qrVersion: 1,
      }),
      "UNKNOWN_QR",
    ],
  ])("%s → INVALID (AC-SCN-05.3)", async (_label, payload, reason) => {
    expect(await scan({ payload })).toEqual({
      result: "INVALID",
      reason,
      actions: { canConfirmCash: false, canCheckIn: false, canReissue: false },
    });
  });

  it("MAC palsu / versi QR lama → INVALID", async () => {
    const order = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    const forged = `${order.qrPayload.slice(0, -4)}AAAA`;
    expect((await scan({ payload: forged })).result).toBe("INVALID");
    const oldVersion = buildTicketQrPayload(qrSigningKey, {
      ticketId: order.ticket.id,
      eventId,
      qrVersion: 2,
    });
    expect((await scan({ payload: oldVersion })).result).toBe("INVALID");
  });

  it("input kode manual: huruf kecil tanpa prefix, tidak ditemukan, event lain (SCN-06)", async () => {
    const order = await cash([{ ticketTypeId: reguler.id, quantity: 1 }]);
    const short = order.order.orderCode.replace("UNC-", "").toLowerCase();
    expect(await scan({ orderCode: short })).toMatchObject({
      result: "CASH_UNPAID",
      order: { code: order.order.orderCode },
    });
    expect(await scan({ orderCode: "UNC-ZZZZZZ" })).toMatchObject({
      result: "INVALID",
      reason: "ORDER_CODE_NOT_FOUND",
    });
    // Kode pesanan event lain tidak dibedakan dari kode yang tidak ada.
    expect(
      await scan({ orderCode: order.order.orderCode }, BEFORE_START, otherEventId),
    ).toMatchObject({
      result: "INVALID",
      reason: "ORDER_CODE_NOT_FOUND",
    });
    await expect(scan({})).rejects.toBeInstanceOf(ValidationError);
    await expect(scan({ payload: "x", orderCode: "y" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("kode manual pesanan QRIS yang belum lunas → QRIS_NOT_PAID", async () => {
    const pending = await createOrder(db, eventId, {
      paymentMethod: "QRIS",
      status: "PENDING_PAYMENT",
      expiresAt: AT_VENUE,
    });
    expect(await scan({ orderCode: pending.orderCode })).toMatchObject({
      result: "QRIS_NOT_PAID",
      order: { status: "PENDING_PAYMENT" },
      actions: { canConfirmCash: false, canCheckIn: false },
    });
  });

  it("setiap scan dicatat di audit_logs tanpa payload QR", async () => {
    const order = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 1 },
    ]);
    await scan({ payload: order.qrPayload });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, order.ticket.id), eq(auditLogs.action, "TICKET_SCANNED")));
    expect(audit).toMatchObject({
      actorUserId: admin.id,
      eventId,
      after: { result: "READY_PICKUP", via: "qr", orderCode: order.order.orderCode },
    });
    expect(JSON.stringify(audit?.after)).not.toContain(order.qrPayload);
  });
});
