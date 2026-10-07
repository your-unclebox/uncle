import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { orders, ticketTypes } from "@/server/db/schema";
import { listPublicTicketTypes } from "@/server/modules/catalog";
import {
  getCustomerOrder,
  lookupCustomerOrder,
  signLookupToken,
  verifyOrderAccessToken,
} from "@/server/modules/ordering";
import {
  findPublicEventBySlug,
  storefrontAvailability,
  toPublicEvent,
} from "@/server/modules/tenancy";
import { withTenant } from "@/server/tenancy";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import {
  BEFORE_EVENT,
  checkout,
  customer,
  EVENT_ENDS_AT,
  EVENT_STARTS_AT,
  qrSigningKey,
} from "../../fixtures/ordering";

const deps = (now: Date) => ({ qrSigningKey, now });

describe("Storefront: event publik & kuota (LP-01, LP-06)", () => {
  const db = useTestDatabase();

  it("hanya event ACTIVE/FINISHED yang tampil; Draft = tidak ditemukan", async () => {
    const active = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const draft = await createEvent(db, { status: "DRAFT" });
    expect((await findPublicEventBySlug(db, active.slug ?? ""))?.id).toBe(active.id);
    expect(await findPublicEventBySlug(db, draft.slug ?? "")).toBeNull();
    expect(await findPublicEventBySlug(db, "tidak-ada")).toBeNull();
  });

  it("penjualan tutup setelah batas Cash / jam selesai / sales_open=false", async () => {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    expect(storefrontAvailability(event, BEFORE_EVENT)).toEqual({
      salesState: "open",
      paymentMethods: { cash: true, qris: false },
    });
    expect(storefrontAvailability(event, EVENT_ENDS_AT).salesState).toBe("closed");
    expect(storefrontAvailability({ ...event, salesOpen: false }, BEFORE_EVENT).salesState).toBe(
      "closed",
    );
    const startCutoff = { ...event, cashReservationMode: "UNTIL_EVENT_START" as const };
    expect(storefrontAvailability(startCutoff, EVENT_STARTS_AT).salesState).toBe("closed");

    const view = toPublicEvent({ ...event, status: "FINISHED" }, BEFORE_EVENT);
    expect(view).toMatchObject({
      finished: true,
      salesState: "closed",
      timeRange: "19:00–22:00 WIB",
    });
    expect(view).not.toHaveProperty("id");
  });

  it("warna teks di atas Primary mengikuti kontras (UI-UX §2.1)", async () => {
    const dark = await createEvent(db, { primaryColor: "#1D4ED8" });
    const light = await createEvent(db, { primaryColor: "#FDE047" });
    expect(toPublicEvent(dark, BEFORE_EVENT).onPrimaryColor).toBe("#FFFFFF");
    expect(toPublicEvent(light, BEFORE_EVENT).onPrimaryColor).toBe("#111827");
  });

  it("kuota tersisa, hampir habis, dan jenis nonaktif disembunyikan", async () => {
    const event = await createEvent(db);
    await createTicketType(db, event.id, { name: "Reguler", quota: 150, sortOrder: 1 });
    await createTicketType(db, event.id, {
      name: "VIP",
      quota: 50,
      allocatedCount: 45,
      sortOrder: 2,
    });
    await createTicketType(db, event.id, { name: "Lama", isActive: false });
    const list = await withTenant(db, { eventId: event.id }, listPublicTicketTypes);
    expect(list.map(({ name, remaining, lowStock }) => ({ name, remaining, lowStock }))).toEqual([
      { name: "Reguler", remaining: 150, lowStock: false },
      { name: "VIP", remaining: 5, lowStock: true },
    ]);
  });
});

describe("Storefront: pesanan customer (LP-10, LP-11, DRD Auth §4)", () => {
  const db = useTestDatabase();

  async function setup() {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n, quota: 5 });
    const created = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    return { event, vip, created };
  }

  const view = (eventId: string, orderCode: string, accessToken: string | null, now: Date) =>
    withTenant(db, { eventId }, (repo) =>
      getCustomerOrder(repo, { orderCode, accessToken }, deps(now)),
    );

  it("token pembuatan membuka order + QR Tiket Cash (Belum bayar)", async () => {
    const { event, created } = await setup();
    const order = await view(event.id, created.order.orderCode, created.accessToken, BEFORE_EVENT);
    expect(order).toMatchObject({
      code: created.order.orderCode,
      status: "RESERVED",
      paymentMethod: "CASH",
      totalAmount: 150_000,
      customer: { name: customer.name, phoneMasked: "0813****1122" },
      items: [{ name: "VIP", quantity: 1, unitPrice: 150_000 }],
      ticket: { status: "ISSUED", qrPayload: created.qrPayload },
    });
  });

  it("token salah, tanpa token, atau kode milik event lain → 404 yang sama", async () => {
    const { event, created } = await setup();
    const other = await createEvent(db);
    const code = created.order.orderCode;
    for (const attempt of [
      view(event.id, code, "salah", BEFORE_EVENT),
      view(event.id, code, null, BEFORE_EVENT),
      view(other.id, code, created.accessToken, BEFORE_EVENT),
    ]) {
      await expect(attempt).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", status: 404 });
    }
  });

  it("reservasi lewat batas saat dibuka → Kedaluwarsa, QR hilang, kuota kembali", async () => {
    const { event, vip, created } = await setup();
    const after = new Date(EVENT_ENDS_AT.getTime() + 60_000);
    const order = await view(event.id, created.order.orderCode, created.accessToken, after);
    expect(order.status).toBe("EXPIRED");
    expect(order.ticket).toMatchObject({ status: "VOID", qrPayload: null });
    const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, vip.id));
    expect(type?.allocatedCount).toBe(0);
  });

  it("Cek Pesanan: kode + no HP cocok → token baru; token lama tetap berlaku", async () => {
    const { event, created } = await setup();
    const lookup = (input: unknown) =>
      withTenant(db, { eventId: event.id }, (repo) =>
        lookupCustomerOrder(repo, input, deps(BEFORE_EVENT)),
      );
    const found = await lookup({
      orderCode: created.order.orderCode.toLowerCase(),
      phone: "+62 813-1122-1122",
    });
    expect(found.orderCode).toBe(created.order.orderCode);
    const viaLookup = await view(event.id, found.orderCode, found.accessToken, BEFORE_EVENT);
    expect(viaLookup.ticket?.qrPayload).toBe(created.qrPayload);
    const viaOld = await view(event.id, found.orderCode, created.accessToken, BEFORE_EVENT);
    expect(viaOld.status).toBe("RESERVED");

    for (const input of [
      { orderCode: created.order.orderCode, phone: "081299999999" },
      { orderCode: "UNC-ZZZZZZ", phone: customer.phone },
      { orderCode: created.order.orderCode, phone: "12345" },
    ]) {
      await expect(lookup(input)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    }
    await expect(lookup({ orderCode: "", phone: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("token Cek Pesanan kedaluwarsa & terikat ke order", async () => {
    const { created } = await setup();
    const [order] = await db.select().from(orders).where(eq(orders.id, created.order.id));
    if (!order) throw new Error("order hilang");
    const token = signLookupToken(qrSigningKey, order, {
      eventEndsAt: EVENT_ENDS_AT,
      now: BEFORE_EVENT,
    });
    expect(verifyOrderAccessToken(qrSigningKey, order, token, BEFORE_EVENT)).toBe(true);
    const dayAfter = new Date(EVENT_ENDS_AT.getTime() + 25 * 60 * 60 * 1000);
    expect(verifyOrderAccessToken(qrSigningKey, order, token, dayAfter)).toBe(false);
    expect(
      verifyOrderAccessToken(
        qrSigningKey,
        { ...order, id: crypto.randomUUID() },
        token,
        BEFORE_EVENT,
      ),
    ).toBe(false);
    expect(verifyOrderAccessToken(Buffer.alloc(32, 1), order, token, BEFORE_EVENT)).toBe(false);
  });
});
