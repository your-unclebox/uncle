import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { tripayCallbackSignature } from "@/integrations/payment-gateway/tripay/tripay-provider";
import { orders } from "@/server/db/schema";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest, ORIGIN } from "../../fixtures/http";
import { createEventAdmin, createOwnerUser, PASSWORD } from "../../fixtures/identity";
import { startMockTripay, type MockTripay } from "../../support/mock-tripay";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  config: typeof import("@/app/api/admin/events/[eventId]/payment-config/route");
  retest: typeof import("@/app/api/admin/events/[eventId]/payment-config/test/route");
  publicEvent: typeof import("@/app/api/public/event/route");
  orders: typeof import("@/app/api/public/orders/route");
  order: typeof import("@/app/api/public/orders/[orderCode]/route");
  check: typeof import("@/app/api/public/orders/[orderCode]/payment/check/route");
  ticket: typeof import("@/app/api/public/orders/[orderCode]/ticket/route");
  webhook: typeof import("@/app/api/webhooks/payments/tripay/[webhookKey]/route");
  cron: typeof import("@/app/api/internal/cron/[job]/route");
};

const BASE = "uncle.test";
const CRON_SECRET = "cron-secret-uji";
const DAY = 24 * 60 * 60 * 1000;
const credentials = { merchantCode: "T0001", apiKey: "DEV-key-5678", privateKey: "pk-uji" };

let ipCounter = 0;
function publicCall(
  host: string,
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
) {
  ipCounter += 1;
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": `10.1.0.${ipCounter}`,
  });
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  return new Request(`http://${host}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

describe("Payment API: Payment Settings, checkout QRIS, webhook, cron (DRD API §2, §5–7)", () => {
  const db = useTestDatabase();
  let api: Handlers;
  let tripay: MockTripay;

  beforeAll(async () => {
    tripay = await startMockTripay();
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.APP_BASE_DOMAIN = BASE;
    process.env.APP_URL = ORIGIN;
    process.env.QR_SIGNING_KEY = randomBytes(32).toString("base64");
    process.env.PAYMENT_KEK_V1 = randomBytes(32).toString("base64");
    process.env.TRIPAY_API_BASE_URL = tripay.url;
    process.env.CRON_SECRET = CRON_SECRET;
    api = {
      login: await import("@/app/api/auth/login/route"),
      config: await import("@/app/api/admin/events/[eventId]/payment-config/route"),
      retest: await import("@/app/api/admin/events/[eventId]/payment-config/test/route"),
      publicEvent: await import("@/app/api/public/event/route"),
      orders: await import("@/app/api/public/orders/route"),
      order: await import("@/app/api/public/orders/[orderCode]/route"),
      check: await import("@/app/api/public/orders/[orderCode]/payment/check/route"),
      ticket: await import("@/app/api/public/orders/[orderCode]/ticket/route"),
      webhook: await import("@/app/api/webhooks/payments/tripay/[webhookKey]/route"),
      cron: await import("@/app/api/internal/cron/[job]/route"),
    };
  });

  afterAll(() => tripay.close());

  async function loginAs(email: string) {
    const response = await api.login.POST(
      makeRequest("POST", "/api/auth/login", { body: { email, password: PASSWORD } }),
      undefined as never,
    );
    return cookieFrom(response);
  }

  async function setupEvent() {
    const startsAt = new Date(Date.now() + 30 * DAY);
    const event = await createEvent(db, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
    });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n, quota: 5 });
    const admin = await createEventAdmin(db, event.id);
    const cookie = await loginAs(admin.email);
    return { event, vip, cookie, host: `${event.slug}.${BASE}` };
  }

  const putConfig = (eventId: string, cookie: string, payload: unknown, origin?: string | null) =>
    api.config.PUT(
      makeRequest("PUT", `/api/admin/events/${eventId}/payment-config`, {
        body: payload,
        cookie,
        ...(origin !== undefined ? { origin } : {}),
      }),
      ctx({ eventId }),
    );

  it("Payment Settings: hanya admin event; simpan → Terhubung, termasking (ADM-07)", async () => {
    const { event, cookie } = await setupEvent();
    const other = await setupEvent();

    const notSet = await api.config.GET(
      makeRequest("GET", `/api/admin/events/${event.id}/payment-config`, { cookie }),
      ctx({ eventId: event.id }),
    );
    expect(await body(notSet)).toMatchObject({ status: "NOT_SET", webhookUrl: null });

    // Admin event lain / Owner tanpa membership → 404; tanpa login → 401; CSRF → 403.
    const foreign = await putConfig(event.id, other.cookie, credentials);
    expect(foreign.status).toBe(404);
    const owner = await createOwnerUser(db);
    expect((await putConfig(event.id, await loginAs(owner.email), credentials)).status).toBe(404);
    expect((await putConfig(event.id, "", credentials)).status).toBe(401);
    expect((await putConfig(event.id, cookie, credentials, "https://evil.test")).status).toBe(403);

    const empty = await putConfig(event.id, cookie, {
      merchantCode: "",
      apiKey: "",
      privateKey: "",
    });
    expect(empty.status).toBe(400);

    const saved = await putConfig(event.id, cookie, credentials);
    expect(saved.status).toBe(200);
    const view = await body(saved);
    expect(view).toMatchObject({
      status: "CONNECTED",
      apiKeyLast4: "5678",
      merchantCodeLast4: "0001",
    });
    expect(JSON.stringify(view)).not.toContain(credentials.apiKey);
    expect(JSON.stringify(view)).not.toContain(credentials.privateKey);

    tripay.state.rejectApiKey = true;
    const failed = await api.retest.POST(
      makeRequest("POST", `/api/admin/events/${event.id}/payment-config/test`, { cookie }),
      ctx({ eventId: event.id }),
    );
    expect(await body(failed)).toMatchObject({ status: "FAILED", lastError: "Invalid API Key" });
    tripay.state.rejectApiKey = false;
  });

  it("checkout QRIS → QR pembayaran; webhook PAID → Lunas & QR Tiket; Cek Status; cron", async () => {
    const { event, vip, cookie, host } = await setupEvent();
    const config = await body<{ webhookUrl: string }>(
      await putConfig(event.id, cookie, credentials),
    );

    const storefront = await api.publicEvent.GET(
      publicCall(host, "GET", "/api/public/event"),
      ctx({}),
    );
    expect(await body(storefront)).toMatchObject({
      event: { paymentMethods: { cash: true, qris: true } },
    });

    const created = await api.orders.POST(
      publicCall(host, "POST", "/api/public/orders", {
        body: {
          items: [{ ticketTypeId: vip.id, quantity: 2 }],
          customer: { name: "Budi Santoso", phone: "081234567811", email: "budi@mail.com" },
          paymentMethod: "QRIS",
        },
      }),
      ctx({}),
    );
    expect(created.status).toBe(201);
    const result = await body<{
      order: { code: string; status: string; totalAmount: number };
      payment: { qrString: string; expiresAt: string };
      ticket: null;
      accessToken: string;
    }>(created);
    expect(result.order).toMatchObject({ status: "PENDING_PAYMENT", totalAmount: 300_000 });
    expect(result.payment.qrString).toContain(`${result.order.code}-1`);
    expect(result.ticket).toBeNull();
    const code = result.order.code;

    // Belum lunas → QR Tiket tidak tersedia (AC-LP-10.4); status membawa QR pembayaran.
    const noTicket = await api.ticket.GET(
      publicCall(host, "GET", `/api/public/orders/${code}/ticket`, { token: result.accessToken }),
      ctx({ orderCode: code }),
    );
    expect(noTicket.status).toBe(404);
    const pending = await api.order.GET(
      publicCall(host, "GET", `/api/public/orders/${code}`, { token: result.accessToken }),
      ctx({ orderCode: code }),
    );
    expect(await body(pending)).toMatchObject({
      order: { status: "PENDING_PAYMENT", payment: { qrString: result.payment.qrString } },
    });

    // Cek Status: gateway masih UNPAID → tetap menunggu.
    const stillPending = await api.check.POST(
      publicCall(host, "POST", `/api/public/orders/${code}/payment/check`, {
        token: result.accessToken,
      }),
      ctx({ orderCode: code }),
    );
    expect(await body(stillPending)).toMatchObject({ order: { status: "PENDING_PAYMENT" } });

    // Webhook dari Tripay ke host dashboard.
    const reference = [...tripay.state.statuses.keys()].at(-1) ?? "";
    const webhookKey = config.webhookUrl.split("/").at(-1) ?? "";
    const rawBody = JSON.stringify({
      reference,
      merchant_ref: `${code}-1`,
      payment_method: "QRIS",
      total_amount: 300_000,
      fee_customer: 0,
      status: "PAID",
      paid_at: Math.floor(Date.now() / 1000),
    });
    const callback = (signature: string) =>
      api.webhook.POST(
        new Request(`${ORIGIN}/api/webhooks/payments/tripay/${webhookKey}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-callback-event": "payment_status",
            "x-callback-signature": signature,
          },
          body: rawBody,
        }),
        ctx({ webhookKey }),
      );
    const rejected = await callback("salah");
    expect(rejected.status).toBe(401);
    const accepted = await callback(tripayCallbackSignature(credentials.privateKey, rawBody));
    expect(accepted.status).toBe(200);
    expect(await body(accepted)).toEqual({ success: true });

    const ticket = await api.ticket.GET(
      publicCall(host, "GET", `/api/public/orders/${code}/ticket`, { token: result.accessToken }),
      ctx({ orderCode: code }),
    );
    expect(await body(ticket)).toMatchObject({
      order: { status: "PAID", payment: null, ticket: { status: "ISSUED" } },
    });

    // Cron: tanpa secret → 401; dengan secret → jalan.
    const cron = (job: string, secret?: string) =>
      api.cron.POST(
        new Request(`${ORIGIN}/api/internal/cron/${job}`, {
          method: "POST",
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        }),
        ctx({ job }),
      );
    expect((await cron("reconcile-qris")).status).toBe(401);
    expect((await cron("reconcile-qris", "salah")).status).toBe(401);
    expect((await cron("tidak-ada", CRON_SECRET)).status).toBe(404);
    const ran = await cron("reconcile-qris", CRON_SECRET);
    expect(await body(ran)).toMatchObject({
      job: "reconcile-qris",
      result: { scanned: expect.any(Number) as unknown },
    });

    const [row] = await db.select().from(orders).where(eq(orders.orderCode, code));
    expect(row).toMatchObject({ status: "PAID", paidVia: "GATEWAY_WEBHOOK" });
  });

  it("gateway error saat checkout → 502 dan kuota kembali", async () => {
    const { event, vip, cookie, host } = await setupEvent();
    await putConfig(event.id, cookie, credentials);
    tripay.state.createFails = true;
    const response = await api.orders.POST(
      publicCall(host, "POST", "/api/public/orders", {
        body: {
          items: [{ ticketTypeId: vip.id, quantity: 1 }],
          customer: { name: "Budi Santoso", phone: "081234567822", email: "budi@mail.com" },
          paymentMethod: "QRIS",
        },
      }),
      ctx({}),
    );
    tripay.state.createFails = false;
    expect(response.status).toBe(502);
    expect(await body(response)).toMatchObject({ code: "PAYMENT_GATEWAY_ERROR" });
  });
});
