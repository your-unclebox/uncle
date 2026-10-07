import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, inject, it } from "vitest";

import { paidQrisOrder } from "../fixtures/admin";
import { createEvent, createTicketType, useTestDatabase } from "../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../fixtures/http";
import { createEventAdmin, PASSWORD } from "../fixtures/identity";

// AI-CODING-RULES §Testing "Cross-tenant isolation suite": setiap endpoint
// /api/admin/events/{eventId}/** diuji dengan admin event A → resource event B
// → 404 tanpa data. Daftar endpoint dibaca dari folder route; endpoint baru
// tanpa entri di REGISTRY membuat suite gagal.

const ADMIN_ROOT = path.join(process.cwd(), "src/app/api/admin/events/[eventId]");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];
type RouteModule = Partial<Record<Method, (request: Request, context: never) => Promise<Response>>>;

interface Target {
  eventId: string;
  orderId: string;
  ticketId: string;
}

interface Entry {
  load: () => Promise<RouteModule>;
  path: (t: Target) => string;
  params: (t: Target) => Record<string, string>;
  body?: unknown;
}

const ev = (t: Target) => ({ eventId: t.eventId });
const evOrder = (t: Target) => ({ eventId: t.eventId, orderId: t.orderId });
const base = (t: Target) => `/api/admin/events/${t.eventId}`;

const REGISTRY: Record<string, Entry> = {
  "GET payment-config": {
    load: () => import("@/app/api/admin/events/[eventId]/payment-config/route"),
    path: (t) => `${base(t)}/payment-config`,
    params: ev,
  },
  "PUT payment-config": {
    load: () => import("@/app/api/admin/events/[eventId]/payment-config/route"),
    path: (t) => `${base(t)}/payment-config`,
    params: ev,
    body: { merchantCode: "T0001", apiKey: "k", privateKey: "p" },
  },
  "POST payment-config/test": {
    load: () => import("@/app/api/admin/events/[eventId]/payment-config/test/route"),
    path: (t) => `${base(t)}/payment-config/test`,
    params: ev,
  },
  "GET payment-config/webhook-url": {
    load: () => import("@/app/api/admin/events/[eventId]/payment-config/webhook-url/route"),
    path: (t) => `${base(t)}/payment-config/webhook-url`,
    params: ev,
  },
  "GET summary": {
    load: () => import("@/app/api/admin/events/[eventId]/summary/route"),
    path: (t) => `${base(t)}/summary`,
    params: ev,
  },
  "GET orders": {
    load: () => import("@/app/api/admin/events/[eventId]/orders/route"),
    path: (t) => `${base(t)}/orders`,
    params: ev,
  },
  "GET orders/[orderId]": {
    load: () => import("@/app/api/admin/events/[eventId]/orders/[orderId]/route"),
    path: (t) => `${base(t)}/orders/${t.orderId}`,
    params: evOrder,
  },
  "POST orders/[orderId]/confirm-cash": {
    load: () => import("@/app/api/admin/events/[eventId]/orders/[orderId]/confirm-cash/route"),
    path: (t) => `${base(t)}/orders/${t.orderId}/confirm-cash`,
    params: evOrder,
    body: { cashReceived: true },
  },
  "POST orders/[orderId]/reissue": {
    load: () => import("@/app/api/admin/events/[eventId]/orders/[orderId]/reissue/route"),
    path: (t) => `${base(t)}/orders/${t.orderId}/reissue`,
    params: evOrder,
    body: { cashReceived: true, expectedTotal: 75000 },
  },
  "POST scan": {
    load: () => import("@/app/api/admin/events/[eventId]/scan/route"),
    path: (t) => `${base(t)}/scan`,
    params: ev,
    body: { orderCode: "UNC-AAAAAA" },
  },
  "POST tickets/[ticketId]/check-in": {
    load: () => import("@/app/api/admin/events/[eventId]/tickets/[ticketId]/check-in/route"),
    path: (t) => `${base(t)}/tickets/${t.ticketId}/check-in`,
    params: (t) => ({ eventId: t.eventId, ticketId: t.ticketId }),
  },
};

async function discoverAdminRoutes(dir = ADMIN_ROOT): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await discoverAdminRoutes(full)));
    else if (entry.name === "route.ts") {
      const rel = path.relative(ADMIN_ROOT, dir).split(path.sep).join("/");
      const source = await readFile(full, "utf8");
      for (const method of METHODS) {
        if (new RegExp(`export const ${method}\\b`).test(source)) found.push(`${method} ${rel}`);
      }
    }
  }
  return found.sort();
}

describe("isolasi tenant: semua endpoint Admin API", () => {
  const db = useTestDatabase();
  let cookieA = "";
  let eventA = "";
  let targetB: Target;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.QR_SIGNING_KEY = randomBytes(32).toString("base64");
    process.env.PAYMENT_KEK_V1 = randomBytes(32).toString("base64");
    process.env.APP_URL = "http://app.uncle.test";
    eventA = (await createEvent(db, { name: "Teater Bagol" })).id;
    const eventB = await createEvent(db, { name: "Konser X" });
    const typeB = await createTicketType(db, eventB.id);
    const orderB = await paidQrisOrder(db, eventB.id, [
      { ticketTypeId: typeB.id, name: "X", quantity: 1 },
    ]);
    targetB = { eventId: eventB.id, orderId: orderB.order.id, ticketId: orderB.ticket.id };

    const adminA = await createEventAdmin(db, eventA);
    const login = await import("@/app/api/auth/login/route");
    const response = await login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: adminA.email, password: PASSWORD },
      }),
      undefined as never,
    );
    cookieA = cookieFrom(response);
  });

  it("setiap route admin terdaftar di REGISTRY (dan sebaliknya)", async () => {
    expect(await discoverAdminRoutes()).toEqual(Object.keys(REGISTRY).sort());
  });

  describe.each(Object.entries(REGISTRY))("%s", (key, entry) => {
    const method = key.split(" ")[0] as Method;

    it("admin event A → event B: 404 tanpa data", async () => {
      const handler = (await entry.load())[method];
      if (!handler) throw new Error(`${key} tidak mengekspor ${method}`);
      const response = await handler(
        makeRequest(method, entry.path(targetB), {
          cookie: cookieA,
          ...(entry.body !== undefined ? { body: entry.body } : {}),
        }),
        ctx(entry.params(targetB)) as never,
      );
      expect(response.status).toBe(404);
      const text = JSON.stringify(await body(response));
      expect(text).not.toContain(targetB.orderId);
      expect(text).not.toContain("Konser X");
    });

    // Resource event B lewat path event A (ID diselundupkan) juga tidak tersentuh.
    it.runIf(key.includes("[orderId]") || key.includes("[ticketId]"))(
      "resource event B lewat path event A: 404",
      async () => {
        const handler = (await entry.load())[method];
        const target = { ...targetB, eventId: eventA };
        const response = await handler!(
          makeRequest(method, entry.path(target), {
            cookie: cookieA,
            ...(entry.body !== undefined ? { body: entry.body } : {}),
          }),
          ctx(entry.params(target)) as never,
        );
        expect(response.status).toBe(404);
      },
    );
  });
});
