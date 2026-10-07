import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { auditLogs, emailOutbox, orders, tickets, ticketTypes } from "@/server/db/schema";
import { buildTicketQrPayload } from "@/server/modules/ticketing";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../../fixtures/http";
import { createEventAdmin, PASSWORD } from "../../fixtures/identity";
import { checkout, qrSigningKey } from "../../fixtures/ordering";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  scan: typeof import("@/app/api/admin/events/[eventId]/scan/route");
  confirm: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/confirm-cash/route");
  reissue: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/reissue/route");
  checkIn: typeof import("@/app/api/admin/events/[eventId]/tickets/[ticketId]/check-in/route");
};

type ScanBody = {
  result: string;
  reason?: string;
  ticket?: { id: string; status: string; checkedInAt: string | null; checkedInBy: string | null };
  order?: {
    id: string;
    code: string;
    customerName: string;
    status: string;
    paidBy: string | null;
    items: Array<{ name: string; quantity: number }>;
  };
  reissue?: {
    available: boolean;
    totalAmount: number;
    items: Array<{ name: string; quantity: number; remaining: number; unitPrice: number }>;
    reissuedOrder: { code: string; createdBy: string | null; ticketStatus: string } | null;
  };
  actions: { canConfirmCash: boolean; canCheckIn: boolean; canReissue: boolean };
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// SCN-02..08, DRD API §5 & Security §6, AI-CODING-RULES Testing §1 (scan, confirm-cash, check-in, reissue).
describe("Scan Tiket API", () => {
  const db = useTestDatabase();
  let api: Handlers;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.QR_SIGNING_KEY = qrSigningKey.toString("base64");
    api = {
      login: await import("@/app/api/auth/login/route"),
      scan: await import("@/app/api/admin/events/[eventId]/scan/route"),
      confirm: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/confirm-cash/route"),
      reissue: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/reissue/route"),
      checkIn: await import("@/app/api/admin/events/[eventId]/tickets/[ticketId]/check-in/route"),
    };
  });

  /** Event berjalan (mulai 30 hari lagi) atau sudah lewat batas reservasi (selesai 1 jam lalu). */
  async function setup(options: { past?: boolean; vipQuota?: number } = {}) {
    const startsAt = options.past
      ? new Date(Date.now() - 4 * HOUR)
      : new Date(Date.now() + 30 * DAY);
    const event = await createEvent(db, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
    });
    const vip = await createTicketType(db, event.id, {
      name: "VIP",
      price: 150_000n,
      quota: options.vipQuota ?? 5,
    });
    const admin = await createEventAdmin(db, event.id);
    const login = await api.login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: admin.email, password: PASSWORD },
      }),
      undefined as never,
    );
    const checkoutAt = options.past ? new Date(startsAt.getTime() - HOUR) : new Date();
    const buy = (quantity = 1) =>
      checkout(db, event.id, [{ ticketTypeId: vip.id, quantity }], { now: checkoutAt });
    return { event, vip, admin, cookie: cookieFrom(login), buy };
  }

  const scan = (eventId: string, cookie: string, payload: unknown) =>
    api.scan.POST(
      makeRequest("POST", `/api/admin/events/${eventId}/scan`, { cookie, body: payload }),
      ctx({ eventId }),
    );
  const confirm = (eventId: string, orderId: string, cookie: string, payload: unknown) =>
    api.confirm.POST(
      makeRequest("POST", `/api/admin/events/${eventId}/orders/${orderId}/confirm-cash`, {
        cookie,
        body: payload,
      }),
      ctx({ eventId, orderId }),
    );
  const checkIn = (eventId: string, ticketId: string, cookie: string) =>
    api.checkIn.POST(
      makeRequest("POST", `/api/admin/events/${eventId}/tickets/${ticketId}/check-in`, { cookie }),
      ctx({ eventId, ticketId }),
    );
  const reissue = (
    eventId: string,
    orderId: string,
    cookie: string,
    payload: unknown,
    key?: string,
  ) => {
    const request = makeRequest("POST", `/api/admin/events/${eventId}/orders/${orderId}/reissue`, {
      cookie,
      body: payload,
    });
    if (key) request.headers.set("idempotency-key", key);
    return api.reissue.POST(request, ctx({ eventId, orderId }));
  };

  it("Cash belum bayar → CASH_UNPAID; Konfirmasi Lunas → READY_PICKUP; Tandai Diambil (AC-SCN-04)", async () => {
    const { event, admin, cookie, buy } = await setup();
    const { order, ticket, qrPayload } = await buy();

    const first = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(first).toMatchObject({
      result: "CASH_UNPAID",
      ticket: { id: ticket.id, status: "ISSUED" },
      order: { code: order.orderCode, status: "RESERVED", items: [{ name: "VIP", quantity: 1 }] },
      actions: { canConfirmCash: true, canCheckIn: false, canReissue: false },
    });

    // BR-TKT-04: belum lunas → tidak bisa diambil.
    const early = await checkIn(event.id, ticket.id, cookie);
    expect(early.status).toBe(409);
    expect((await body(early)).code).toBe("ORDER_NOT_PAID");

    const unchecked = await confirm(event.id, order.id, cookie, { cashReceived: false });
    expect(unchecked.status).toBe(400);

    const confirmed = await confirm(event.id, order.id, cookie, { cashReceived: true });
    expect(confirmed.status).toBe(200);
    expect(await body<ScanBody>(confirmed)).toMatchObject({
      result: "READY_PICKUP",
      order: { status: "PAID", paidBy: admin.name },
      actions: { canCheckIn: true, canConfirmCash: false },
    });
    const again = await confirm(event.id, order.id, cookie, { cashReceived: true });
    expect(again.status).toBe(409);
    expect((await body(again)).code).toBe("INVALID_ORDER_TRANSITION");

    const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(stored).toMatchObject({
      status: "PAID",
      paidVia: "CASH_MANUAL",
      cashConfirmedBy: admin.id,
    });

    const done = await checkIn(event.id, ticket.id, cookie);
    expect(done.status).toBe(200);
    expect(await body<ScanBody>(done)).toMatchObject({
      result: "ALREADY_CHECKED_IN",
      ticket: { status: "CHECKED_IN", checkedInBy: admin.name },
    });

    // BR-TKT-05: scan ulang → SUDAH DIAMBIL + waktu & admin.
    const rescanned = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(rescanned).toMatchObject({
      result: "ALREADY_CHECKED_IN",
      ticket: { checkedInBy: admin.name },
      actions: { canCheckIn: false },
    });
    expect(rescanned.ticket?.checkedInAt).toBeTruthy();

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.eventId, event.id));
    expect(audit.map((row) => row.action).sort()).toEqual([
      "CASH_PAYMENT_CONFIRMED",
      "TICKET_CHECKED_IN",
      "TICKET_SCANNED",
      "TICKET_SCANNED",
    ]);
  });

  it("dua check-in paralel → tepat satu sukses, lainnya 409 ALREADY_CHECKED_IN (AC-SCN-07.1)", async () => {
    const { event, cookie, buy } = await setup();
    const { order, ticket } = await buy();
    await confirm(event.id, order.id, cookie, { cashReceived: true });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => checkIn(event.id, ticket.id, cookie)),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    const conflict = responses.find((response) => response.status === 409);
    const problem = await body(conflict as Response);
    expect(problem).toMatchObject({ code: "ALREADY_CHECKED_IN" });
    expect(problem.checkedInBy).toBeTruthy();
  });

  it("input kode manual (SCN-06), huruf kecil diterima", async () => {
    const { event, cookie, buy } = await setup();
    const { order } = await buy();
    const result = await body<ScanBody>(
      await scan(event.id, cookie, { orderCode: order.orderCode.toLowerCase() }),
    );
    expect(result).toMatchObject({ result: "CASH_UNPAID", order: { code: order.orderCode } });
    const unknown = await body<ScanBody>(await scan(event.id, cookie, { orderCode: "UNC-XXXXXX" }));
    expect(unknown).toEqual({
      result: "INVALID",
      reason: "UNKNOWN",
      actions: { canConfirmCash: false, canCheckIn: false, canReissue: false },
    });
  });

  it("QR tidak dikenali, QR pembayaran, MAC palsu, versi lama → INVALID tanpa data (SCN-05)", async () => {
    const { event, cookie, buy } = await setup();
    const { ticket, qrPayload } = await buy();

    const cases: Array<[unknown, string]> = [
      [{ payload: "halo dunia" }, "UNKNOWN"],
      [{ payload: "00020101021226660014ID.CO.QRIS.WWW" }, "PAYMENT_QR"],
      [{ payload: `${qrPayload.slice(0, -2)}AA` }, "UNKNOWN"],
      [
        {
          payload: buildTicketQrPayload(qrSigningKey, {
            ticketId: ticket.id,
            eventId: event.id,
            qrVersion: 2,
          }),
        },
        "UNKNOWN",
      ],
    ];
    for (const [input, reason] of cases) {
      const response = await scan(event.id, cookie, input);
      expect(response.status).toBe(200);
      const result = await body<ScanBody>(response);
      expect(result).toMatchObject({ result: "INVALID", reason });
      expect(result.order).toBeUndefined();
    }

    for (const input of [{}, { payload: qrPayload, orderCode: "UNC-1" }, { payload: "" }]) {
      expect((await scan(event.id, cookie, input)).status).toBe(400);
    }
  });

  it("QR event lain → OTHER_EVENT tanpa data order; resource event lain → 404 (BR-TKT-06, I-2)", async () => {
    const mine = await setup();
    const other = await setup();
    const { order, ticket, qrPayload } = await other.buy();

    const result = await body<ScanBody>(
      await scan(mine.event.id, mine.cookie, { payload: qrPayload }),
    );
    expect(result).toEqual({
      result: "OTHER_EVENT",
      actions: { canConfirmCash: false, canCheckIn: false, canReissue: false },
    });
    expect(JSON.stringify(result)).not.toContain(order.orderCode);

    expect(
      (await confirm(mine.event.id, order.id, mine.cookie, { cashReceived: true })).status,
    ).toBe(404);
    expect((await checkIn(mine.event.id, ticket.id, mine.cookie)).status).toBe(404);
    expect(
      (
        await reissue(mine.event.id, order.id, mine.cookie, {
          cashReceived: true,
          expectedTotal: 150_000,
        })
      ).status,
    ).toBe(404);
    // Admin event A memanggil path event B → 404.
    expect((await scan(other.event.id, mine.cookie, { payload: qrPayload })).status).toBe(404);
    // Tidak berubah.
    const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(stored?.status).toBe("RESERVED");
  });

  it("transaksi dibatalkan → CANCELLED", async () => {
    const { event, cookie, buy } = await setup();
    const { order, qrPayload } = await buy();
    await db
      .update(orders)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(eq(orders.id, order.id));
    await db.update(tickets).set({ status: "VOID" }).where(eq(tickets.orderId, order.id));
    await db
      .update(ticketTypes)
      .set({ allocatedCount: 0 })
      .where(eq(ticketTypes.eventId, event.id));
    const result = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(result).toMatchObject({ result: "CANCELLED", actions: { canCheckIn: false } });
  });

  it("reservasi lewat batas (belum disapu cron) → RESERVATION_EXPIRED + reissue → pesanan baru PAID (AC-SCN-08)", async () => {
    const { event, vip, admin, cookie, buy } = await setup({ past: true });
    const { order, qrPayload } = await buy(2);

    const result = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(result).toMatchObject({
      result: "RESERVATION_EXPIRED",
      ticket: { status: "VOID" },
      order: { status: "EXPIRED" },
      reissue: {
        available: true,
        totalAmount: 300_000,
        items: [{ name: "VIP", quantity: 2, unitPrice: 150_000, remaining: 5 }],
        reissuedOrder: null,
      },
      actions: { canReissue: true, canConfirmCash: false },
    });
    // Scan meng-EXPIRED-kan order & melepas kuota.
    const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, vip.id));
    expect(type?.allocatedCount).toBe(0);
    // Konfirmasi Lunas untuk reservasi kedaluwarsa ditolak.
    expect((await confirm(event.id, order.id, cookie, { cashReceived: true })).status).toBe(409);

    const key = "6f1c2b7e-0000-4000-8000-000000000001";
    const created = await reissue(
      event.id,
      order.id,
      cookie,
      { cashReceived: true, expectedTotal: 300_000 },
      key,
    );
    expect(created.status).toBe(201);
    const reissued = await body<{
      order: {
        id: string;
        code: string;
        status: string;
        paidVia: string;
        reissuedFromOrderCode: string;
      };
      ticket: { id: string; status: string };
      actions: { canCheckIn: boolean };
    }>(created);
    expect(reissued).toMatchObject({
      order: { status: "PAID", paidVia: "CASH_MANUAL", reissuedFromOrderCode: order.orderCode },
      ticket: { status: "ISSUED" },
      actions: { canCheckIn: true },
    });

    // Idempotency-Key sama → respons 201 sama.
    const replay = await reissue(
      event.id,
      order.id,
      cookie,
      { cashReceived: true, expectedTotal: 300_000 },
      key,
    );
    expect(replay.status).toBe(201);
    expect((await body<typeof reissued>(replay)).order.code).toBe(reissued.order.code);

    const outbox = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, reissued.order.id));
    expect(outbox.map((row) => row.type)).toEqual(["TICKET_ISSUED"]);

    // (k3) scan QR lama lagi → sudah dibuatkan pesanan baru.
    const rescanned = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(rescanned).toMatchObject({
      result: "RESERVATION_EXPIRED",
      reissue: {
        available: false,
        reissuedOrder: { code: reissued.order.code, createdBy: admin.name, ticketStatus: "ISSUED" },
      },
      actions: { canReissue: false },
    });

    const second = await reissue(event.id, order.id, cookie, {
      cashReceived: true,
      expectedTotal: 300_000,
    });
    expect(second.status).toBe(409);
    expect(await body(second)).toMatchObject({
      code: "ALREADY_REISSUED",
      newOrderCode: reissued.order.code,
    });

    // Pesanan baru bisa langsung ditandai diambil.
    expect((await checkIn(event.id, reissued.ticket.id, cookie)).status).toBe(200);
  });

  it("reservasi kedaluwarsa, kuota habis → reissue.available=false; reissue 409 QUOTA_INSUFFICIENT (k2)", async () => {
    const { event, vip, cookie, buy } = await setup({ past: true, vipQuota: 2 });
    const { order, qrPayload } = await buy(2);
    // Kuota direbut pembeli lain setelah reservasi dilepas.
    await db.update(orders).set({ status: "EXPIRED" }).where(eq(orders.id, order.id));
    await db.update(tickets).set({ status: "VOID" }).where(eq(tickets.orderId, order.id));
    await db.update(ticketTypes).set({ allocatedCount: 1 }).where(eq(ticketTypes.id, vip.id));

    const result = await body<ScanBody>(await scan(event.id, cookie, { payload: qrPayload }));
    expect(result).toMatchObject({
      result: "RESERVATION_EXPIRED",
      reissue: { available: false, items: [{ remaining: 1, quantity: 2 }] },
      actions: { canReissue: false },
    });
    const failed = await reissue(event.id, order.id, cookie, {
      cashReceived: true,
      expectedTotal: 300_000,
    });
    expect(failed.status).toBe(409);
    expect((await body(failed)).code).toBe("QUOTA_INSUFFICIENT");
  });

  it("tanpa login → 401; tanpa Origin (CSRF) → 403", async () => {
    const { event, cookie, buy } = await setup();
    const { qrPayload } = await buy();
    expect((await scan(event.id, "", { payload: qrPayload })).status).toBe(401);
    const noOrigin = await api.scan.POST(
      makeRequest("POST", `/api/admin/events/${event.id}/scan`, {
        cookie,
        origin: null,
        body: { payload: qrPayload },
      }),
      ctx({ eventId: event.id }),
    );
    expect(noOrigin.status).toBe(403);
  });
});
