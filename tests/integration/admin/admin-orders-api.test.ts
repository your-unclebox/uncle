import { beforeAll, describe, expect, inject, it } from "vitest";

import type { Database } from "@/server/db/client";
import { orderItems } from "@/server/db/schema";

import {
  createEvent,
  createOrder,
  createTicket,
  createTicketType,
  useTestDatabase,
} from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../../fixtures/http";
import { createEventAdmin, createOwnerUser, PASSWORD } from "../../fixtures/identity";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  summary: typeof import("@/app/api/admin/events/[eventId]/summary/route");
  orders: typeof import("@/app/api/admin/events/[eventId]/orders/route");
  order: typeof import("@/app/api/admin/events/[eventId]/orders/[orderId]/route");
};

type ListBody = {
  data: Array<{
    id: string;
    code: string;
    customerName: string;
    customerPhoneMasked: string;
    items: Array<{ name: string; quantity: number }>;
    paymentMethod: string;
    status: string;
    pickup: string | null;
    totalAmount: number;
  }>;
  nextCursor: string | null;
  total: number;
};

type DetailBody = {
  code: string;
  status: string;
  customer: { name: string; phone: string; email: string };
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  pickup: string | null;
  ticket: { status: string; checkedInBy: string | null } | null;
  reissuedFrom: { code: string } | null;
  reissuedTo: { code: string } | null;
  history: Array<{ kind: string; actorName: string | null; paidVia?: string; note?: string }>;
};

const HOUR = 60 * 60 * 1000;

async function addItems(
  db: Database,
  eventId: string,
  orderId: string,
  lines: Array<{ ticketType: { id: string; name: string; price: bigint }; quantity: number }>,
) {
  await db.insert(orderItems).values(
    lines.map((line) => ({
      eventId,
      orderId,
      ticketTypeId: line.ticketType.id,
      quantity: line.quantity,
      unitPrice: line.ticketType.price,
      ticketTypeName: line.ticketType.name,
    })),
  );
}

// ADM-03..06 (DRD API §5): Ringkasan, Daftar, Filter/Cari, Detail Transaksi.
describe("Admin API: ringkasan & transaksi", () => {
  const db = useTestDatabase();
  let api: Handlers;
  let eventId: string;
  let otherEventId: string;
  let otherOrderId: string;
  let cookie: string;
  let adminName: string;
  const codes: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    api = {
      login: await import("@/app/api/auth/login/route"),
      summary: await import("@/app/api/admin/events/[eventId]/summary/route"),
      orders: await import("@/app/api/admin/events/[eventId]/orders/route"),
      order: await import("@/app/api/admin/events/[eventId]/orders/[orderId]/route"),
    };

    const event = await createEvent(db, { name: "Teater Bagol" });
    eventId = event.id;
    // allocated_count = tiket yang dipegang order PENDING_PAYMENT/RESERVED/PAID di bawah,
    // supaya cron expiry (lintas tenant, dijalankan test lain) tetap konsisten.
    const reguler = await createTicketType(db, eventId, {
      name: "Reguler",
      price: 75_000n,
      allocatedCount: 6,
    });
    const vip = await createTicketType(db, eventId, {
      name: "VIP",
      price: 150_000n,
      allocatedCount: 3,
    });
    const admin = await createEventAdmin(db, eventId);
    adminName = admin.name;

    const past = new Date(Date.now() - HOUR);
    const future = new Date(Date.now() + 30 * 24 * HOUR);
    const sameInstant = new Date(Date.now() - 10 * HOUR);

    const seed = async (
      key: string,
      order: Parameters<typeof createOrder>[2],
      lines: Parameters<typeof addItems>[3],
      ticket?: Parameters<typeof createTicket>[3],
    ) => {
      // Default dibuat 2 jam lalu: sebelum waktu bayar/batal/ambil di data uji.
      const row = await createOrder(db, eventId, {
        createdAt: new Date(Date.now() - 2 * HOUR),
        ...order,
      });
      await addItems(db, eventId, row.id, lines);
      if (ticket) await createTicket(db, eventId, row.id, ticket);
      codes[key] = row.orderCode;
      ids[key] = row.id;
      return row;
    };

    // Budi & Siti sengaja created_at sama: urutan cursor memakai id sebagai penentu.
    await seed(
      "budi",
      {
        customerName: "Budi Santoso",
        customerPhone: "+6281234567890",
        paymentMethod: "QRIS",
        status: "PAID",
        paidAt: past,
        paidVia: "GATEWAY_WEBHOOK",
        createdAt: sameInstant,
      },
      [{ ticketType: reguler, quantity: 2 }],
      {},
    );
    await seed(
      "siti",
      {
        customerName: "Siti R.",
        customerPhone: "+6281311221122",
        expiresAt: future,
        createdAt: sameInstant,
      },
      [{ ticketType: vip, quantity: 1 }],
      {},
    );
    await seed(
      "andi",
      {
        customerName: "Andi P.",
        customerPhone: "+6285733443344",
        paymentMethod: "QRIS",
        status: "PAID",
        paidAt: past,
        paidVia: "GATEWAY_RECONCILE",
        totalAmount: 300_000n,
      },
      [
        { ticketType: reguler, quantity: 2 },
        { ticketType: vip, quantity: 1 },
      ],
      { status: "CHECKED_IN", checkedInAt: new Date(), checkedInBy: admin.id },
    );
    await seed(
      "dewi",
      {
        customerName: "Dewi K.",
        customerPhone: "+6287855665566",
        paymentMethod: "QRIS",
        status: "PENDING_PAYMENT",
        expiresAt: future,
      },
      [{ ticketType: reguler, quantity: 1 }],
    );
    // Reservasi lewat batas, belum disapu cron → tampil Kedaluwarsa.
    await seed(
      "eko",
      { customerName: "Eko W.", customerPhone: "+6281200000001", expiresAt: past },
      [{ ticketType: reguler, quantity: 1 }],
      {},
    );
    await seed(
      "fajar",
      {
        customerName: "Fajar N.",
        customerPhone: "+6281200000002",
        status: "CANCELLED",
        cancelledAt: past,
        cancelledBy: admin.id,
        cancelReason: "Tidak datang",
      },
      [{ ticketType: reguler, quantity: 1 }],
      { status: "VOID", voidedAt: past, voidReason: "ORDER_CANCELLED" },
    );
    const hana = await seed(
      "hana",
      {
        customerName: "Hana S.",
        customerPhone: "+6281200000003",
        status: "EXPIRED",
        expiresAt: past,
      },
      [{ ticketType: vip, quantity: 1 }],
      { status: "VOID", voidedAt: past, voidReason: "ORDER_EXPIRED" },
    );
    await seed(
      "gita",
      {
        customerName: "Hana S.",
        customerPhone: "+6281200000003",
        status: "PAID",
        expiresAt: null,
        paidAt: new Date(Date.now() + 1000),
        paidVia: "CASH_MANUAL",
        cashConfirmedBy: admin.id,
        reissuedFromOrderId: hana.id,
        createdAt: new Date(),
      },
      [{ ticketType: vip, quantity: 1 }],
      {},
    );

    const otherEvent = await createEvent(db, { name: "Konser X" });
    otherEventId = otherEvent.id;
    otherOrderId = (await createOrder(db, otherEventId, { customerName: "Siti Lain" })).id;

    const login = await api.login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: admin.email, password: PASSWORD },
      }),
      undefined as never,
    );
    cookie = cookieFrom(login);
  });

  const getSummary = (event: string, auth = cookie) =>
    api.summary.GET(
      makeRequest("GET", `/api/admin/events/${event}/summary`, { cookie: auth }),
      ctx({ eventId: event }),
    );

  const list = (params: Record<string, string> = {}, event = eventId) =>
    api.orders.GET(
      makeRequest("GET", `/api/admin/events/${event}/orders?${new URLSearchParams(params)}`, {
        cookie,
      }),
      ctx({ eventId: event }),
    );

  const listCodes = async (params: Record<string, string> = {}) => {
    const response = await list(params);
    expect(response.status).toBe(200);
    const data = await body<ListBody>(response);
    return data.data.map((row) => row.code).sort();
  };

  const detail = (orderId: string, event = eventId) =>
    api.order.GET(
      makeRequest("GET", `/api/admin/events/${event}/orders/${orderId}`, { cookie }),
      ctx({ eventId: event, orderId }),
    );

  const codesOf = (...keys: string[]) => keys.map((key) => codes[key]).sort();

  it("ringkasan dalam satuan tiket: Terjual = Lunas + Belum (AC-ADM-03.1)", async () => {
    const response = await getSummary(eventId);
    expect(response.status).toBe(200);
    // Lunas: Budi 2 + Andi 3 + Gita 1; Belum: Siti 1 (Eko lewat batas); Diambil: Andi 3.
    expect(await body(response)).toEqual({ sold: 7, paid: 6, unpaid: 1, pickedUp: 3 });
  });

  it("daftar default menyembunyikan Menunggu/Kedaluwarsa; baris lengkap (AC-ADM-04.1/04.2)", async () => {
    const response = await list();
    const data = await body<ListBody>(response);
    expect(data.total).toBe(5);
    expect(data.data.map((row) => row.code).sort()).toEqual(
      codesOf("budi", "siti", "andi", "fajar", "gita"),
    );
    const andi = data.data.find((row) => row.code === codes.andi);
    expect(andi).toMatchObject({
      customerName: "Andi P.",
      customerPhoneMasked: "0857****3344",
      paymentMethod: "QRIS",
      status: "PAID",
      pickup: "DONE",
      totalAmount: 300_000,
      items: [
        { name: "Reguler", quantity: 2 },
        { name: "VIP", quantity: 1 },
      ],
    });
    expect(JSON.stringify(data)).not.toContain("6285733443344");
  });

  it("includeUnfinished menampilkan semua; status efektif Kedaluwarsa untuk hold lewat batas", async () => {
    const data = await body<ListBody>(await list({ includeUnfinished: "true" }));
    expect(data.total).toBe(8);
    expect(data.data.find((row) => row.code === codes.eko)).toMatchObject({
      status: "EXPIRED",
      pickup: null,
    });
    expect(data.data.find((row) => row.code === codes.dewi)).toMatchObject({
      status: "PENDING_PAYMENT",
      pickup: null,
    });
  });

  it("filter status bayar, status ambil & metode (AC-ADM-05.1)", async () => {
    expect(await listCodes({ status: "RESERVED" })).toEqual(codesOf("siti"));
    expect(await listCodes({ status: "PAID" })).toEqual(codesOf("budi", "andi", "gita"));
    expect(await listCodes({ status: "EXPIRED" })).toEqual(codesOf("eko", "hana"));
    expect(await listCodes({ status: "PENDING_PAYMENT" })).toEqual(codesOf("dewi"));
    expect(await listCodes({ status: "CANCELLED" })).toEqual(codesOf("fajar"));
    expect(await listCodes({ pickup: "done" })).toEqual(codesOf("andi"));
    expect(await listCodes({ pickup: "pending" })).toEqual(codesOf("budi", "siti", "gita"));
    expect(await listCodes({ method: "CASH" })).toEqual(codesOf("siti", "fajar", "gita"));
    expect(await listCodes({ method: "QRIS", pickup: "pending" })).toEqual(codesOf("budi"));
  });

  it("cari nama, sebagian no HP, atau kode pesanan (AC-ADM-05.2/05.3)", async () => {
    expect(await listCodes({ q: "siti" })).toEqual(codesOf("siti"));
    expect(await listCodes({ q: "0813 1122" })).toEqual(codesOf("siti"));
    expect(await listCodes({ q: "7890" })).toEqual(codesOf("budi"));
    expect(await listCodes({ q: (codes.andi ?? "").toLowerCase() })).toEqual(codesOf("andi"));
    expect(await listCodes({ q: "%" })).toEqual([]);
    const empty = await body<ListBody>(await list({ q: "tidak-ada" }));
    expect(empty).toEqual({ data: [], nextCursor: null, total: 0 });
  });

  it("paginasi cursor: tanpa duplikat/terlewat, total tetap", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const params: Record<string, string> = { limit: "2", includeUnfinished: "true" };
      if (cursor) params.cursor = cursor;
      const page: ListBody = await body<ListBody>(await list(params));
      expect(page.total).toBe(8);
      seen.push(...page.data.map((row) => row.code));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
  });

  it("query tidak valid → 400 VALIDATION_ERROR", async () => {
    for (const params of [{ status: "LUNAS" }, { limit: "0" }, { cursor: "rusak" }, { x: "1" }]) {
      const response = await list(params);
      expect(response.status).toBe(400);
      expect((await body(response)).code).toBe("VALIDATION_ERROR");
    }
  });

  it("detail: data lengkap, item, status ambil & riwayat siapa/kapan (ADM-06)", async () => {
    const response = await detail(ids.andi ?? "");
    expect(response.status).toBe(200);
    const data = await body<DetailBody>(response);
    expect(data).toMatchObject({
      code: codes.andi,
      status: "PAID",
      customer: { name: "Andi P.", phone: "085733443344", email: "siti@example.com" },
      items: [
        { name: "Reguler", quantity: 2, unitPrice: 75_000 },
        { name: "VIP", quantity: 1, unitPrice: 150_000 },
      ],
      pickup: "DONE",
      ticket: { status: "CHECKED_IN", checkedInBy: adminName },
    });
    expect(data.history.map((entry) => entry.kind)).toEqual(["CREATED", "PAID", "CHECKED_IN"]);
    expect(data.history[1]).toMatchObject({ paidVia: "GATEWAY_RECONCILE", actorName: null });
    expect(data.history[2]).toMatchObject({ actorName: adminName });
  });

  it("detail riwayat: batal (alasan & admin), kedaluwarsa, dan pesanan baru dari reservasi", async () => {
    const fajar = await body<DetailBody>(await detail(ids.fajar ?? ""));
    expect(fajar.history.at(-1)).toMatchObject({
      kind: "CANCELLED",
      actorName: adminName,
      note: "Tidak datang",
    });
    expect(fajar.pickup).toBeNull();

    const eko = await body<DetailBody>(await detail(ids.eko ?? ""));
    expect(eko.status).toBe("EXPIRED");
    expect(eko.history.map((entry) => entry.kind)).toEqual(["CREATED", "EXPIRED"]);

    const hana = await body<DetailBody>(await detail(ids.hana ?? ""));
    expect(hana.reissuedTo).toEqual({ id: ids.gita, code: codes.gita });
    expect(hana.history.at(-1)).toMatchObject({
      kind: "REISSUED",
      note: codes.gita,
      actorName: adminName,
    });

    const gita = await body<DetailBody>(await detail(ids.gita ?? ""));
    expect(gita.reissuedFrom).toEqual({ id: ids.hana, code: codes.hana });
    expect(gita.history).toEqual([
      expect.objectContaining({ kind: "CREATED", note: codes.hana }),
      expect.objectContaining({ kind: "PAID", paidVia: "CASH_MANUAL", actorName: adminName }),
    ]);
  });

  it("isolasi tenant: event lain / order event lain / ID rusak → 404 (I-2)", async () => {
    expect((await getSummary(otherEventId)).status).toBe(404);
    expect((await list({}, otherEventId)).status).toBe(404);
    expect((await detail(otherOrderId, otherEventId)).status).toBe(404);
    const crossOrder = await detail(otherOrderId);
    expect(crossOrder.status).toBe(404);
    expect(JSON.stringify(await body(crossOrder))).not.toContain("Siti Lain");
    expect((await detail("bukan-uuid")).status).toBe(404);
    expect((await getSummary("bukan-uuid")).status).toBe(404);
  });

  it("tanpa login → 401; Owner tanpa membership admin → 404", async () => {
    expect((await getSummary(eventId, "")).status).toBe(401);
    const owner = await createOwnerUser(db);
    const login = await api.login.POST(
      makeRequest("POST", "/api/auth/login", {
        body: { email: owner.email, password: PASSWORD },
      }),
      undefined as never,
    );
    expect((await getSummary(eventId, cookieFrom(login))).status).toBe(404);
  });
});
