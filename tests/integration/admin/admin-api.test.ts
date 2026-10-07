import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { emailOutbox, orders } from "@/server/db/schema";

import { cashOrderFor, paidQrisOrder } from "../../fixtures/admin";
import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../../fixtures/http";
import { createEventAdmin, PASSWORD } from "../../fixtures/identity";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  summary: typeof import("@/app/api/admin/events/[eventId]/summary/route");
  orders: typeof import("@/app/api/admin/events/[eventId]/orders/route");
  order: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/route");
  confirm: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/confirm-cash/route");
  reissue: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/reissue/route");
  scan: typeof import("@/app/api/admin/events/[eventId]/scan/route");
  checkIn: typeof import("@/app/api/admin/events/[eventId]/tickets/[ticketId]/check-in/route");
};

const DAY = 24 * 60 * 60 * 1000;

// DRD API §5 lewat route handler: sesi, membership, same-origin, bentuk JSON.
describe("Admin API: ringkasan, transaksi, scan, konfirmasi, diambil, reissue", () => {
  const db = useTestDatabase();
  let api: Handlers;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.QR_SIGNING_KEY = randomBytes(32).toString("base64");
    api = {
      login: await import("@/app/api/auth/login/route"),
      summary: await import("@/app/api/admin/events/[eventId]/summary/route"),
      orders: await import("@/app/api/admin/events/[eventId]/orders/route"),
      order: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/route"),
      confirm: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/confirm-cash/route"),
      reissue: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/reissue/route"),
      scan: await import("@/app/api/admin/events/[eventId]/scan/route"),
      checkIn: await import("@/app/api/admin/events/[eventId]/tickets/[ticketId]/check-in/route"),
    };
  });

  // Event berlangsung sekarang: QR Tiket ditandatangani QR_SIGNING_KEY env.
  async function setup() {
    const now = Date.now();
    const event = await createEvent(db, {
      name: "Teater Bagol",
      startsAt: new Date(now - 60 * 60 * 1000),
      endsAt: new Date(now + 2 * 60 * 60 * 1000),
    });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n, quota: 5 });
    const admin = await createEventAdmin(db, event.id);
    const response = await api.login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: admin.email, password: PASSWORD },
      }),
      undefined as never,
    );
    expect(response.status).toBe(200);
    return { event, vip, admin, cookie: cookieFrom(response) };
  }

  const base = (eventId: string) => `/api/admin/events/${eventId}`;
  const scanVia = (eventId: string, cookie: string, payload: unknown) =>
    api.scan.POST(
      makeRequest("POST", `${base(eventId)}/scan`, { cookie, body: payload }),
      ctx({ eventId }),
    );

  it("scan Cash → Konfirmasi Lunas → Tandai Diambil → ringkasan & daftar ikut berubah", async () => {
    const { event, vip, cookie } = await setup();
    const siti = await cashOrderFor(
      db,
      event.id,
      [{ ticketTypeId: vip.id, quantity: 1 }],
      { name: "Siti R.", phone: "081311221122", email: "siti@example.com" },
      new Date(),
    );
    // QR dibuat fixture dengan kunci uji, bukan env → pakai kode manual.
    const scanned = await scanVia(event.id, cookie, { orderCode: siti.order.orderCode });
    expect(scanned.status).toBe(200);
    expect(await body(scanned)).toMatchObject({
      result: "CASH_UNPAID",
      order: { code: siti.order.orderCode, totalAmount: 150000, status: "RESERVED" },
      actions: { canConfirmCash: true, canCheckIn: false },
    });

    const confirm = (payload: unknown, origin?: string | null) =>
      api.confirm.POST(
        makeRequest("POST", `${base(event.id)}/orders/${siti.order.id}/confirm-cash`, {
          cookie,
          body: payload,
          ...(origin !== undefined ? { origin } : {}),
        }),
        ctx({ eventId: event.id, orderId: siti.order.id }),
      );
    expect((await confirm({ cashReceived: true }, "https://evil.example")).status).toBe(403);
    expect((await confirm({ cashReceived: false })).status).toBe(400);
    const confirmed = await confirm({ cashReceived: true });
    expect(confirmed.status).toBe(200);
    const view = await body<{ result: string; ticket: { id: string } }>(confirmed);
    expect(view).toMatchObject({ result: "READY_PICKUP", order: { cashConfirmedBy: "Rina" } });
    expect((await confirm({ cashReceived: true })).status).toBe(409);

    const checkIn = () =>
      api.checkIn.POST(
        makeRequest("POST", `${base(event.id)}/tickets/${view.ticket.id}/check-in`, { cookie }),
        ctx({ eventId: event.id, ticketId: view.ticket.id }),
      );
    const done = await checkIn();
    expect(done.status).toBe(200);
    expect(await body(done)).toMatchObject({
      result: "ALREADY_CHECKED_IN",
      ticket: { status: "CHECKED_IN", checkedInBy: "Rina" },
    });
    const twice = await checkIn();
    expect(twice.status).toBe(409);
    expect(await body(twice)).toMatchObject({ code: "ALREADY_CHECKED_IN", checkedInBy: "Rina" });

    const summary = await api.summary.GET(
      makeRequest("GET", `${base(event.id)}/summary`, { cookie }),
      ctx({ eventId: event.id }),
    );
    expect(await body(summary)).toEqual({ sold: 1, paid: 1, unpaid: 0, pickedUp: 1 });

    const list = await api.orders.GET(
      makeRequest("GET", `${base(event.id)}/orders?pickup=done&q=siti&status=`, { cookie }),
      ctx({ eventId: event.id }),
    );
    expect(await body(list)).toMatchObject({
      total: 1,
      orders: [{ code: siti.order.orderCode, status: "PAID", ticketStatus: "CHECKED_IN" }],
    });
    const invalidFilter = await api.orders.GET(
      makeRequest("GET", `${base(event.id)}/orders?method=TRANSFER`, { cookie }),
      ctx({ eventId: event.id }),
    );
    expect(invalidFilter.status).toBe(400);

    const detail = await api.order.GET(
      makeRequest("GET", `${base(event.id)}/orders/${siti.order.id}`, { cookie }),
      ctx({ eventId: event.id, orderId: siti.order.id }),
    );
    expect(await body(detail)).toMatchObject({
      customer: { name: "Siti R.", phone: "081311221122", email: "siti@example.com" },
      ticket: { status: "CHECKED_IN" },
    });
    const missing = await api.order.GET(
      makeRequest("GET", `${base(event.id)}/orders/bukan-uuid`, { cookie }),
      ctx({ eventId: event.id, orderId: "bukan-uuid" }),
    );
    expect(missing.status).toBe(404);
  });

  it("reissue: 201 + view Lunas, Idempotency-Key replay, kedua kali → 409 ALREADY_REISSUED, email TICKET_ISSUED", async () => {
    const { event, vip, cookie } = await setup();
    const old = await cashOrderFor(
      db,
      event.id,
      [{ ticketTypeId: vip.id, quantity: 1 }],
      { name: "Siti R.", phone: "081311221199", email: "siti@example.com" },
      new Date(Date.now() - 2 * DAY),
    );
    // Reservasi lewat batas (belum disapu cron): scan → EXPIRED + blok reissue.
    await db
      .update(orders)
      .set({ expiresAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(orders.id, old.order.id));
    const scanned = await body(await scanVia(event.id, cookie, { orderCode: old.order.orderCode }));
    expect(scanned).toMatchObject({
      result: "RESERVATION_EXPIRED",
      reissue: { available: true, totalAmount: 150000, reissuedOrder: null },
      actions: { canReissue: true },
    });

    const reissue = (key: string) =>
      api.reissue.POST(
        new Request(`http://app.uncle.test${base(event.id)}/orders/${old.order.id}/reissue`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://app.uncle.test",
            cookie,
            "idempotency-key": key,
          },
          body: JSON.stringify({ cashReceived: true, expectedTotal: 150000 }),
        }),
        ctx({ eventId: event.id, orderId: old.order.id }),
      );
    const first = await reissue("k-1");
    expect(first.status).toBe(201);
    const created = await body<{ order: { id: string; code: string } }>(first);
    expect(created).toMatchObject({
      order: {
        status: "PAID",
        paymentMethod: "CASH",
        paidVia: "CASH_MANUAL",
        reissuedFromOrderCode: old.order.orderCode,
        totalAmount: 150000,
        items: [{ name: "VIP", quantity: 1, unitPrice: 150000 }],
      },
      ticket: { status: "ISSUED" },
      actions: { canCheckIn: true },
      view: { result: "READY_PICKUP" },
    });
    const replay = await reissue("k-1");
    expect(replay.status).toBe(201);
    expect((await body<typeof created>(replay)).order.id).toBe(created.order.id);

    const second = await reissue("k-2");
    expect(second.status).toBe(409);
    expect(await body(second)).toMatchObject({
      code: "ALREADY_REISSUED",
      newOrderCode: created.order.code,
    });
    const emails = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, created.order.id));
    expect(emails.map((e) => e.type)).toEqual(["TICKET_ISSUED"]);
  });

  it("tanpa sesi → 401; admin event lain → 404 tanpa data", async () => {
    const a = await setup();
    const b = await setup();
    const orderB = await paidQrisOrder(db, b.event.id, [
      { ticketTypeId: b.vip.id, name: "VIP", quantity: 1 },
    ]);

    const anonymous = await api.summary.GET(
      makeRequest("GET", `${base(a.event.id)}/summary`),
      ctx({ eventId: a.event.id }),
    );
    expect(anonymous.status).toBe(401);

    const foreign = await api.order.GET(
      makeRequest("GET", `${base(b.event.id)}/orders/${orderB.order.id}`, { cookie: a.cookie }),
      ctx({ eventId: b.event.id, orderId: orderB.order.id }),
    );
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(await body(foreign))).not.toContain(orderB.order.orderCode);

    // Order event B lewat path event A → tidak ditemukan.
    const crossPath = await api.order.GET(
      makeRequest("GET", `${base(a.event.id)}/orders/${orderB.order.id}`, { cookie: a.cookie }),
      ctx({ eventId: a.event.id, orderId: orderB.order.id }),
    );
    expect(crossPath.status).toBe(404);
  });
});
