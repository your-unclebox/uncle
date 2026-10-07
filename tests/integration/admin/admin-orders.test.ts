import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditLogs, orders, tickets } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";
import {
  confirmCashPayment,
  getAdminOrderDetail,
  getEventSummary,
  listAdminOrders,
  OrderNotFoundError,
  OrderNotReservedError,
  ReservationExpiredError,
} from "@/server/modules/ordering";
import { withTenant } from "@/server/tenancy";

import { cashOrderFor, paidQrisOrder } from "../../fixtures/admin";
import {
  createEvent,
  createOrder,
  createTicketType,
  createUser,
  useTestDatabase,
} from "../../fixtures/db";
import { BEFORE_EVENT, EVENT_ENDS_AT, EVENT_STARTS_AT } from "../../fixtures/ordering";

const AT_VENUE = new Date("2026-12-20T19:20:00+07:00");

// ADM-03 … ADM-06, SCN-04 (DRD API §5).
describe("Admin Dashboard: ringkasan, daftar, detail, konfirmasi Cash", () => {
  const db = useTestDatabase();
  let eventId: string;
  let otherEventId: string;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let reguler: Awaited<ReturnType<typeof createTicketType>>;
  let vip: Awaited<ReturnType<typeof createTicketType>>;
  let budi: Awaited<ReturnType<typeof paidQrisOrder>>;
  let siti: Awaited<ReturnType<typeof cashOrderFor>>;
  let andi: Awaited<ReturnType<typeof paidQrisOrder>>;
  let pendingQris: Awaited<ReturnType<typeof createOrder>>;

  const asAdmin = <T>(work: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, { eventId, actorUserId: admin.id }, work);

  beforeAll(async () => {
    admin = await createUser(db, { name: "Rina" });
    const event = await createEvent(db, {
      name: "Teater Bagol",
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
    });
    eventId = event.id;
    otherEventId = (await createEvent(db, { name: "Konser X" })).id;
    reguler = await createTicketType(db, eventId, { name: "Reguler", quota: 100 });
    vip = await createTicketType(db, eventId, { name: "VIP", price: 150_000n, quota: 40 });

    // Budi S.: 2 Reguler, QRIS, Lunas, belum diambil (AC-ADM-04.1).
    budi = await paidQrisOrder(db, eventId, [
      { ticketTypeId: reguler.id, name: "Reguler", quantity: 2 },
    ]);
    // Siti R.: 1 VIP, Cash, belum bayar.
    siti = await cashOrderFor(db, eventId, [{ ticketTypeId: vip.id, quantity: 1 }], {
      name: "Siti Rahma",
      phone: "081311221122",
      email: "siti@example.com",
    });
    // Andi P.: 2 Reguler + 1 VIP, QRIS, Lunas, sudah diambil (AC-ADM-04.2).
    andi = await paidQrisOrder(
      db,
      eventId,
      [
        { ticketTypeId: reguler.id, name: "Reguler", quantity: 2 },
        { ticketTypeId: vip.id, name: "VIP", quantity: 1, unitPrice: 150_000n },
      ],
      { customerName: "Andi Pratama", customerPhone: "+6285733443344" },
    );
    await db
      .update(tickets)
      .set({ status: "CHECKED_IN", checkedInAt: AT_VENUE, checkedInBy: admin.id })
      .where(eq(tickets.id, andi.ticket.id));
    // Checkout QRIS yang ditinggal: tersembunyi secara default.
    pendingQris = await createOrder(db, eventId, {
      paymentMethod: "QRIS",
      status: "PENDING_PAYMENT",
      customerName: "Dewi Kurnia",
      expiresAt: new Date(BEFORE_EVENT.getTime() + 15 * 60_000),
    });
    // Event lain dengan nama serupa — tidak boleh ikut tampil (AC-ADM-02.1).
    await paidQrisOrder(db, otherEventId, [
      { ticketTypeId: (await createTicketType(db, otherEventId)).id, name: "X", quantity: 3 },
    ]);
  });

  it("ringkasan menghitung tiket: Terjual = Lunas + Belum, Diambil (AC-ADM-03.1, BR-RPT-02)", async () => {
    const summary = await asAdmin((repo) => getEventSummary(repo, BEFORE_EVENT));
    expect(summary).toEqual({ sold: 6, paid: 5, unpaid: 1, pickedUp: 3 });
    // Reservasi yang sudah lewat batas tidak lagi dihitung "Belum".
    const late = await asAdmin((repo) =>
      getEventSummary(repo, new Date("2026-12-21T00:00:00+07:00")),
    );
    expect(late).toMatchObject({ sold: 5, unpaid: 0 });
  });

  it("daftar default menyembunyikan pesanan belum selesai; baris lengkap & multi jenis (AC-ADM-04.1/04.2)", async () => {
    const list = await asAdmin((repo) => listAdminOrders(repo, {}));
    expect(list.total).toBe(3);
    expect(list.orders.map((o) => o.code)).not.toContain(pendingQris.orderCode);
    const rowBudi = list.orders.find((o) => o.id === budi.order.id);
    expect(rowBudi).toMatchObject({
      customerName: "Budi Santoso",
      customerPhone: "081234567890",
      paymentMethod: "QRIS",
      status: "PAID",
      ticketStatus: "ISSUED",
      items: [{ name: "Reguler", quantity: 2 }],
    });
    expect(list.orders.find((o) => o.id === andi.order.id)?.items).toEqual([
      { name: "Reguler", quantity: 2 },
      { name: "VIP", quantity: 1 },
    ]);

    const all = await asAdmin((repo) => listAdminOrders(repo, { includeUnfinished: "true" }));
    expect(all.total).toBe(4);
  });

  it("filter status bayar / ambil / metode + jumlah hasil (AC-ADM-05.1)", async () => {
    const unpaid = await asAdmin((repo) => listAdminOrders(repo, { status: "RESERVED" }));
    expect(unpaid.orders.map((o) => o.id)).toEqual([siti.order.id]);
    expect(unpaid.total).toBe(1);

    const notPicked = await asAdmin((repo) =>
      listAdminOrders(repo, { pickup: "pending", method: "QRIS" }),
    );
    expect(notPicked.orders.map((o) => o.id)).toEqual([budi.order.id]);

    const picked = await asAdmin((repo) => listAdminOrders(repo, { pickup: "done" }));
    expect(picked.orders.map((o) => o.id)).toEqual([andi.order.id]);

    const pending = await asAdmin((repo) => listAdminOrders(repo, { status: "PENDING_PAYMENT" }));
    expect(pending.orders.map((o) => o.id)).toEqual([pendingQris.id]);
  });

  it.each([
    ["siti", "Siti Rahma"],
    ["1122", "Siti Rahma"],
    ["0813112", "Siti Rahma"],
    ["andi p", "Andi Pratama"],
  ])("cari %s → %s (AC-ADM-05.2)", async (q, name) => {
    const list = await asAdmin((repo) => listAdminOrders(repo, { q }));
    expect(list.orders.map((o) => o.customerName)).toEqual([name]);
  });

  it("cari kode pesanan; tidak ada hasil → total 0 (AC-ADM-05.3); paging", async () => {
    const byCode = await asAdmin((repo) =>
      listAdminOrders(repo, { q: budi.order.orderCode.toLowerCase() }),
    );
    expect(byCode.orders.map((o) => o.id)).toEqual([budi.order.id]);

    const none = await asAdmin((repo) => listAdminOrders(repo, { q: "tidak-ada%_" }));
    expect(none).toMatchObject({ orders: [], total: 0 });

    const page2 = await asAdmin((repo) => listAdminOrders(repo, { pageSize: "2", page: "2" }));
    expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page2.orders).toHaveLength(1);
    const beyond = await asAdmin((repo) => listAdminOrders(repo, { pageSize: "2", page: "9" }));
    expect(beyond).toMatchObject({ orders: [], total: 3 });

    await expect(
      asAdmin((repo) => listAdminOrders(repo, { status: "LUNAS" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("detail: item, total, riwayat lunas & diambil oleh admin (ADM-06)", async () => {
    const detail = await asAdmin((repo) => getAdminOrderDetail(repo, andi.order.id));
    expect(detail).toMatchObject({
      code: andi.order.orderCode,
      status: "PAID",
      customer: { name: "Andi Pratama", phone: "085733443344", email: "budi@mail.com" },
      items: [
        { name: "Reguler", quantity: 2, unitPrice: 75_000n },
        { name: "VIP", quantity: 1, unitPrice: 150_000n },
      ],
      totalAmount: 300_000n,
      ticket: { status: "CHECKED_IN", checkedInBy: "Rina" },
    });
    expect(detail.history.map((h) => h.label)).toEqual([
      "Pesanan dibuat",
      "Lunas (QRIS, webhook)",
      "Tiket diambil, oleh Rina",
    ]);
  });

  it("detail pesanan event lain → tidak ditemukan (AC-ADM-02.2)", async () => {
    const [foreign] = await db.select().from(orders).where(eq(orders.eventId, otherEventId));
    await expect(
      asAdmin((repo) => getAdminOrderDetail(repo, foreign?.id ?? "")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  describe("Konfirmasi Lunas Cash (SCN-04, BR-PAY-03/04)", () => {
    it("RESERVED → PAID dengan waktu & admin, tercatat di audit", async () => {
      const order = await cashOrderFor(db, eventId, [{ ticketTypeId: vip.id, quantity: 1 }], {
        name: "Rudi H",
        phone: "081277778888",
        email: "rudi@example.com",
      });
      const paid = await asAdmin((repo) =>
        confirmCashPayment(repo, order.order.id, { cashReceived: true }, { now: AT_VENUE }),
      );
      expect(paid).toMatchObject({
        status: "PAID",
        paidVia: "CASH_MANUAL",
        cashConfirmedBy: admin.id,
        paidAt: AT_VENUE,
      });
      const detail = await asAdmin((repo) => getAdminOrderDetail(repo, order.order.id));
      expect(detail.history.map((h) => h.label)).toContain("Lunas (Cash), oleh Rina");
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, order.order.id), eq(auditLogs.action, "ORDER_CASH_CONFIRMED")),
        );
      expect(audit?.actorUserId).toBe(admin.id);

      // Sudah Lunas → 409, tidak ditimpa.
      await expect(
        asAdmin((repo) => confirmCashPayment(repo, order.order.id, { cashReceived: true })),
      ).rejects.toBeInstanceOf(OrderNotReservedError);
    });

    it("tanpa centang 'Sudah terima uang' → 400; QRIS → 409 (tidak bisa manual)", async () => {
      await expect(
        asAdmin((repo) => confirmCashPayment(repo, siti.order.id, { cashReceived: false })),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        asAdmin((repo) => confirmCashPayment(repo, pendingQris.id, { cashReceived: true })),
      ).rejects.toBeInstanceOf(OrderNotReservedError);
    });

    it("reservasi lewat batas → 409 RESERVATION_EXPIRED, status tidak berubah", async () => {
      const order = await cashOrderFor(db, eventId, [{ ticketTypeId: reguler.id, quantity: 1 }], {
        name: "Telat Datang",
        phone: "081299990000",
        email: "telat@example.com",
      });
      await expect(
        asAdmin((repo) =>
          confirmCashPayment(
            repo,
            order.order.id,
            { cashReceived: true },
            { now: new Date(EVENT_ENDS_AT.getTime() + 60_000) },
          ),
        ),
      ).rejects.toBeInstanceOf(ReservationExpiredError);
      const [after] = await db.select().from(orders).where(eq(orders.id, order.order.id));
      expect(after?.status).toBe("RESERVED");
    });

    it("dua admin konfirmasi bersamaan → tepat satu berhasil", async () => {
      const order = await cashOrderFor(db, eventId, [{ ticketTypeId: reguler.id, quantity: 1 }], {
        name: "Paralel",
        phone: "081211112222",
        email: "paralel@example.com",
      });
      const second = await createUser(db, { name: "Dodi" });
      const results = await Promise.allSettled([
        asAdmin((repo) => confirmCashPayment(repo, order.order.id, { cashReceived: true })),
        withTenant(db, { eventId, actorUserId: second.id }, (repo) =>
          confirmCashPayment(repo, order.order.id, { cashReceived: true }),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
        OrderNotReservedError,
      );
    });
  });
});
