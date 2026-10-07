import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { emailOutbox, orders } from "@/server/db/schema";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../../fixtures/http";
import { createEventAdmin, PASSWORD } from "../../fixtures/identity";
import { checkout, qrSigningKey } from "../../fixtures/ordering";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  resend: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/resend-ticket/route");
};

interface ResendCall {
  readonly headers: Record<string, string>;
  readonly body: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    attachments: Array<{ filename: string; content_id?: string; content_type: string }>;
  };
}

const DAY = 24 * 60 * 60 * 1000;

// ADM-08 (DRD API §5): Kirim Ulang QR Tiket — Resend tiruan lewat fetch.
describe("Admin API: kirim ulang email QR Tiket", () => {
  const db = useTestDatabase();
  let api: Handlers;
  const calls: ResendCall[] = [];
  let resendStatus = 200;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.QR_SIGNING_KEY = qrSigningKey.toString("base64");
    process.env.EMAIL_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "tiket@mail.uncle.test";
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
      calls.push({
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body)) as ResendCall["body"],
      });
      return resendStatus === 200
        ? Response.json({ id: `msg_${calls.length}` })
        : Response.json({ message: "Gagal" }, { status: resendStatus });
    });
    api = {
      login: await import("@/app/api/auth/login/route"),
      resend: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/resend-ticket/route"),
    };
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    delete process.env.EMAIL_API_KEY;
  });

  async function setup() {
    const startsAt = new Date(Date.now() + 30 * DAY);
    const event = await createEvent(db, {
      name: "Teater Bagol",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
    });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n });
    const admin = await createEventAdmin(db, event.id);
    const login = await api.login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: admin.email, password: PASSWORD },
      }),
      undefined as never,
    );
    const buy = () =>
      checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 2 }], { now: new Date() });
    const markPaid = (orderId: string) =>
      db
        .update(orders)
        .set({
          status: "PAID",
          paidAt: new Date(),
          paidVia: "CASH_MANUAL",
          cashConfirmedBy: admin.id,
        })
        .where(eq(orders.id, orderId));
    return { event, cookie: cookieFrom(login), buy, markPaid };
  }

  const resend = (eventId: string, orderId: string, cookie: string, origin?: string | null) =>
    api.resend.POST(
      makeRequest("POST", `/api/admin/events/${eventId}/orders/${orderId}/resend-ticket`, {
        cookie,
        ...(origin !== undefined ? { origin } : {}),
      }),
      ctx({ eventId, orderId }),
    );

  it("order Lunas → 200 + Resend dipanggil dengan template email tiket & QR inline", async () => {
    const { event, cookie, buy, markPaid } = await setup();
    const { order } = await buy();
    await markPaid(order.id);
    calls.length = 0;

    const response = await resend(event.id, order.id, cookie);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      message: "Email tiket berhasil dikirim ke siti@example.com",
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.headers.authorization).toBe("Bearer re_test_key");
    expect(call?.headers["idempotency-key"]).toMatch(/^email-outbox-[0-9a-f-]{36}$/);
    expect(call?.body).toMatchObject({
      from: '"Teater Bagol via Uncle" <tiket@mail.uncle.test>',
      to: ["siti@example.com"],
    });
    expect(call?.body.subject).toContain(order.orderCode);
    expect(call?.body.html).toContain(order.orderCode);
    expect(call?.body.attachments).toEqual([
      expect.objectContaining({
        filename: `tiket-${order.orderCode}.png`,
        content_type: "image/png",
        content_id: expect.any(String),
      }),
    ]);

    // Kirim ulang lagi → Idempotency-Key baru (bukan dianggap duplikat oleh Resend).
    await resend(event.id, order.id, cookie);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers["idempotency-key"]).not.toBe(call?.headers["idempotency-key"]);

    // Tanpa baris outbox baru (dikirim langsung, tidak ada tracking resend).
    const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(outbox.map((row) => row.type)).toEqual(["CASH_RESERVATION"]);
  });

  it("order belum Lunas → 400, Resend tidak dipanggil", async () => {
    const { event, cookie, buy } = await setup();
    const { order } = await buy();
    calls.length = 0;
    const response = await resend(event.id, order.id, cookie);
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      code: "TICKET_RESEND_NOT_ALLOWED",
      reason: "ORDER_NOT_PAID",
    });
    expect(calls).toHaveLength(0);
  });

  it("order tidak ada / ID rusak → 404", async () => {
    const { event, cookie } = await setup();
    expect((await resend(event.id, "0193a3c4-0000-7000-8000-000000000000", cookie)).status).toBe(
      404,
    );
    expect((await resend(event.id, "bukan-uuid", cookie)).status).toBe(404);
  });

  it("isolasi tenant: admin event A tidak bisa kirim ulang order event B → 404, tanpa email", async () => {
    const mine = await setup();
    const other = await setup();
    const { order } = await other.buy();
    await other.markPaid(order.id);
    calls.length = 0;

    // Order event B lewat path event A.
    const viaMine = await resend(mine.event.id, order.id, mine.cookie);
    expect(viaMine.status).toBe(404);
    expect(JSON.stringify(await body(viaMine))).not.toContain(order.orderCode);
    // Path event B dengan sesi admin event A.
    expect((await resend(other.event.id, order.id, mine.cookie)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("tanpa login → 401; tanpa Origin (CSRF) → 403", async () => {
    const { event, cookie, buy, markPaid } = await setup();
    const { order } = await buy();
    await markPaid(order.id);
    expect((await resend(event.id, order.id, "")).status).toBe(401);
    expect((await resend(event.id, order.id, cookie, null)).status).toBe(403);
  });

  it("Resend menolak → 502 EMAIL_SEND_FAILED", async () => {
    const { event, cookie, buy, markPaid } = await setup();
    const { order } = await buy();
    await markPaid(order.id);
    resendStatus = 500;
    try {
      const response = await resend(event.id, order.id, cookie);
      expect(response.status).toBe(502);
      expect((await body(response)).code).toBe("EMAIL_SEND_FAILED");
    } finally {
      resendStatus = 200;
    }
  });
});
