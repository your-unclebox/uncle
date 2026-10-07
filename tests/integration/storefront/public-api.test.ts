import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, inject, it } from "vitest";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, ctx } from "../../fixtures/http";

type Handlers = {
  event: typeof import("@/app/api/public/event/route");
  ticketTypes: typeof import("@/app/api/public/ticket-types/route");
  orders: typeof import("@/app/api/public/orders/route");
  order: typeof import("@/app/api/public/orders/[orderCode]/route");
  ticket: typeof import("@/app/api/public/orders/[orderCode]/ticket/route");
  lookup: typeof import("@/app/api/public/orders/lookup/route");
};

const BASE = "uncle.test";
const DAY = 24 * 60 * 60 * 1000;

interface CallOptions {
  body?: unknown;
  token?: string;
  idempotencyKey?: string;
  ip?: string;
}

let ipCounter = 0;

// Tenant publik dari Host: request dikirim ke {slug}.uncle.test.
function call(host: string, method: string, path: string, options: CallOptions = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  ipCounter += 1;
  headers.set("x-forwarded-for", options.ip ?? `10.0.0.${ipCounter}`);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  return new Request(`http://${host}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

// No HP berbeda per test: rate limit order 5/jam per no HP (DRD Security §4).
let phoneCounter = 0;
function newBuyer() {
  phoneCounter += 1;
  return {
    name: "Budi Santoso",
    phone: `0812345678${String(phoneCounter).padStart(2, "0")}`,
    email: "budi@mail.com",
  };
}

describe("Public API (DRD API §2)", () => {
  const db = useTestDatabase();
  let api: Handlers;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.APP_BASE_DOMAIN = BASE;
    process.env.QR_SIGNING_KEY = randomBytes(32).toString("base64");
    api = {
      event: await import("@/app/api/public/event/route"),
      ticketTypes: await import("@/app/api/public/ticket-types/route"),
      orders: await import("@/app/api/public/orders/route"),
      order: await import("@/app/api/public/orders/[orderCode]/route"),
      ticket: await import("@/app/api/public/orders/[orderCode]/ticket/route"),
      lookup: await import("@/app/api/public/orders/lookup/route"),
    };
  });

  async function activeEvent() {
    const startsAt = new Date(Date.now() + 30 * DAY);
    const event = await createEvent(db, {
      name: "Teater Bagol",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
    });
    const reguler = await createTicketType(db, event.id, { name: "Reguler", price: 75_000n });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n, quota: 1 });
    return { event, host: `${event.slug}.${BASE}`, reguler, vip };
  }

  const placeOrder = (host: string, payload: unknown, options: CallOptions = {}) =>
    api.orders.POST(call(host, "POST", "/api/public/orders", { ...options, body: payload }), {
      params: Promise.resolve({}),
    });

  it("GET event & ticket-types: tenant dari Host; Draft/host lain → 404", async () => {
    const { host } = await activeEvent();
    const event = await api.event.GET(call(host, "GET", "/api/public/event"), ctx({}));
    expect(event.status).toBe(200);
    expect(await body(event)).toMatchObject({
      event: { name: "Teater Bagol", salesState: "open", paymentMethods: { cash: true } },
    });

    const types = await api.ticketTypes.GET(call(host, "GET", "/api/public/ticket-types"), ctx({}));
    expect(types.headers.get("cache-control")).toBe("no-store");
    expect(await body(types)).toMatchObject({
      data: [
        { name: "Reguler", price: 75_000, remaining: 10 },
        { name: "VIP", price: 150_000, remaining: 1 },
      ],
    });

    const draft = await createEvent(db, { status: "DRAFT" });
    for (const otherHost of [`${draft.slug}.${BASE}`, `app.${BASE}`, `admin.${BASE}`]) {
      const response = await api.event.GET(call(otherHost, "GET", "/api/public/event"), ctx({}));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ code: "EVENT_NOT_FOUND" });
    }
  });

  it("POST orders Cash → 201 RESERVED + QR Tiket; status & tiket via token", async () => {
    const { host, reguler, vip } = await activeEvent();
    const buyer = newBuyer();
    const created = await placeOrder(host, {
      items: [
        { ticketTypeId: reguler.id, quantity: 2 },
        { ticketTypeId: vip.id, quantity: 1 },
      ],
      customer: buyer,
      paymentMethod: "CASH",
    });
    expect(created.status).toBe(201);
    const result = await body<{
      order: { code: string; status: string; totalAmount: number };
      ticket: { qrPayload: string };
      accessToken: string;
    }>(created);
    expect(result.order).toMatchObject({ status: "RESERVED", totalAmount: 300_000 });
    expect(result.ticket.qrPayload).toMatch(/^U1\./);

    const code = result.order.code;
    const status = await api.order.GET(
      call(host, "GET", `/api/public/orders/${code}`, { token: result.accessToken }),
      ctx({ orderCode: code }),
    );
    const statusBody = await body<{ order: Record<string, unknown> }>(status);
    expect(statusBody.order).toMatchObject({ code, status: "RESERVED" });
    expect(JSON.stringify(statusBody)).not.toContain("qrPayload");

    const ticket = await api.ticket.GET(
      call(host, "GET", `/api/public/orders/${code}/ticket?t=${result.accessToken}`),
      ctx({ orderCode: code }),
    );
    expect(await body(ticket)).toMatchObject({
      order: { ticket: { qrPayload: result.ticket.qrPayload } },
    });

    const noToken = await api.ticket.GET(
      call(host, "GET", `/api/public/orders/${code}/ticket`),
      ctx({ orderCode: code }),
    );
    expect(noToken.status).toBe(404);
  });

  it("Idempotency-Key sama → order yang sama; kuota tidak berkurang dua kali", async () => {
    const { host, vip } = await activeEvent();
    const buyer = newBuyer();
    const payload = {
      items: [{ ticketTypeId: vip.id, quantity: 1 }],
      customer: buyer,
      paymentMethod: "CASH",
    };
    const key = crypto.randomUUID();
    const first = await body<{ order: { code: string } }>(
      await placeOrder(host, payload, { idempotencyKey: key }),
    );
    const second = await body<{ order: { code: string } }>(
      await placeOrder(host, payload, { idempotencyKey: key }),
    );
    expect(second.order.code).toBe(first.order.code);
  });

  it("kuota tidak cukup → 409 dengan sisa kuota; QRIS → 422; data salah → 400", async () => {
    const { host, vip } = await activeEvent();
    const buyer = newBuyer();
    const insufficient = await placeOrder(host, {
      items: [{ ticketTypeId: vip.id, quantity: 2 }],
      customer: buyer,
      paymentMethod: "CASH",
    });
    expect(insufficient.status).toBe(409);
    expect(await body(insufficient)).toMatchObject({
      code: "QUOTA_INSUFFICIENT",
      remaining: [{ ticketTypeId: vip.id, name: "VIP", remaining: 1 }],
    });

    const qris = await placeOrder(host, {
      items: [{ ticketTypeId: vip.id, quantity: 1 }],
      customer: buyer,
      paymentMethod: "QRIS",
    });
    expect(qris.status).toBe(422);
    expect(await body(qris)).toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });

    const invalid = await placeOrder(host, {
      items: [{ ticketTypeId: vip.id, quantity: 1 }],
      customer: { name: "", phone: "12345", email: "budi@" },
      paymentMethod: "CASH",
    });
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toMatchObject({
      code: "VALIDATION_ERROR",
      errors: {
        "customer.name": expect.any(Array) as unknown,
        "customer.phone": ["Format no HP tidak valid"],
        "customer.email": ["Format email tidak valid"],
      },
    });
  });

  it("rate limit order per no HP: 5/jam → order ke-6 ditolak 429", async () => {
    const { host, reguler } = await activeEvent();
    const buyer = newBuyer();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await placeOrder(host, {
        items: [{ ticketTypeId: reguler.id, quantity: 1 }],
        customer: buyer,
        paymentMethod: "CASH",
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("Cek Pesanan → token baru; gagal generik; rate limit per IP → 429", async () => {
    const { host, reguler } = await activeEvent();
    const buyer = newBuyer();
    const created = await body<{ order: { code: string } }>(
      await placeOrder(host, {
        items: [{ ticketTypeId: reguler.id, quantity: 1 }],
        customer: buyer,
        paymentMethod: "CASH",
      }),
    );
    const lookup = (payload: unknown, ip?: string) =>
      api.lookup.POST(
        call(host, "POST", "/api/public/orders/lookup", {
          body: payload,
          ...(ip ? { ip } : {}),
        }),
        ctx({}),
      );

    const found = await lookup({ orderCode: created.order.code, phone: buyer.phone });
    const { accessToken } = await body<{ accessToken: string }>(found);
    const viaLookup = await api.order.GET(
      call(host, "GET", `/api/public/orders/${created.order.code}`, { token: accessToken }),
      ctx({ orderCode: created.order.code }),
    );
    expect(viaLookup.status).toBe(200);

    const wrong = await lookup({ orderCode: created.order.code, phone: "081299999999" });
    expect(wrong.status).toBe(404);
    expect(await body(wrong)).toMatchObject({ title: "Pesanan tidak ditemukan" });

    const ip = "10.9.9.9";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await lookup({ orderCode: "UNC-AAAAAA", phone: buyer.phone }, ip)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);
  });
});
