import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  emailOutbox,
  orders,
  paymentConfigs,
  paymentTransactions,
  tickets,
  ticketTypes,
  webhookEvents,
} from "@/server/db/schema";
import {
  createQrisOrder,
  processPaymentWebhook,
  reconcileQrisPayments,
} from "@/server/modules/payments";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { BEFORE_EVENT, customer, EVENT_ENDS_AT, EVENT_STARTS_AT } from "../../fixtures/ordering";
import { APP_URL, connectQris, fakeTripay, kek, signedCallback } from "../../fixtures/payments";

const qrSigningKey = randomBytes(32);
const MINUTE = 60_000;

describe("Checkout QRIS + webhook + rekonsiliasi (LP-09, DRD Integrations §1)", () => {
  const db = useTestDatabase();

  async function setup(options: { vipQuota?: number } = {}) {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const vip = await createTicketType(db, event.id, {
      name: "VIP",
      price: 150_000n,
      quota: options.vipQuota ?? 5,
    });
    const tripay = fakeTripay();
    await connectQris(db, event.id, tripay.provider);
    const [config] = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.eventId, event.id));
    if (!config) throw new Error("config hilang");
    return { event, vip, tripay, config };
  }

  const order = (
    setupResult: Awaited<ReturnType<typeof setup>>,
    quantity = 1,
    options: { now?: Date; idempotencyKey?: string } = {},
  ) =>
    createQrisOrder(
      db,
      { eventId: setupResult.event.id },
      {
        items: [{ ticketTypeId: setupResult.vip.id, quantity }],
        customer,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
      {
        provider: setupResult.tripay.provider,
        kek,
        appUrl: APP_URL,
        now: options.now ?? BEFORE_EVENT,
      },
    );

  const webhook = (
    setupResult: Awaited<ReturnType<typeof setup>>,
    payload: Record<string, unknown>,
    options: { privateKey?: string; now?: Date } = {},
  ) => {
    const { rawBody, headers } = signedCallback(payload, options.privateKey);
    return processPaymentWebhook(
      db,
      { webhookKey: setupResult.config.webhookKey, rawBody, headers },
      {
        provider: setupResult.tripay.provider,
        kek,
        qrSigningKey,
        now: options.now ?? BEFORE_EVENT,
      },
    );
  };

  const paidCallback = (
    payment: { providerReference: string | null; merchantRef: string },
    amount = 150_000,
  ) => ({
    reference: payment.providerReference,
    merchant_ref: payment.merchantRef,
    payment_method: "QRIS",
    total_amount: amount,
    fee_customer: 0,
    status: "PAID",
    paid_at: Math.floor(BEFORE_EVENT.getTime() / 1000) + 60,
  });

  const allocated = async (ticketTypeId: string) =>
    (await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)))[0]
      ?.allocatedCount;

  it("order QRIS: PENDING_PAYMENT 15 menit, kuota ditahan, QR dari gateway (AC-LP-09.1)", async () => {
    const ctx = await setup();
    const result = await order(ctx, 2);
    expect(result.order).toMatchObject({ status: "PENDING_PAYMENT", totalAmount: 300_000n });
    expect(result.order.expiresAt).toEqual(new Date(BEFORE_EVENT.getTime() + 15 * MINUTE));
    expect(result.payment).toMatchObject({
      status: "UNPAID",
      merchantRef: `${result.order.orderCode}-1`,
      qrString: `00020101021226-${result.order.orderCode}-1`,
    });
    expect(result.payment?.rawCreateResponse).not.toHaveProperty("customer_email");
    expect(await allocated(ctx.vip.id)).toBe(2);
    expect(ctx.tripay.state.created[0]).toMatchObject({
      amount: 300_000,
      callback_url: `${APP_URL}/api/webhooks/payments/tripay/${ctx.config.webhookKey}`,
      order_items: [{ name: "VIP", price: 150_000, quantity: 2 }],
    });
  });

  it("Idempotency-Key sama → QR yang sama, gateway tidak dipanggil dua kali", async () => {
    const ctx = await setup();
    const first = await order(ctx, 1, { idempotencyKey: "same-key" });
    const second = await order(ctx, 1, { idempotencyKey: "same-key" });
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.payment?.qrString).toBe(first.payment?.qrString);
    expect(ctx.tripay.state.created).toHaveLength(1);
    expect(await allocated(ctx.vip.id)).toBe(1);
  });

  it("gateway gagal → 502, order EXPIRED, kuota dilepas (AC-LP-09.7)", async () => {
    for (const failure of ["network", "rejected"] as const) {
      const ctx = await setup();
      ctx.tripay.state.createFails = failure;
      await expect(order(ctx)).rejects.toMatchObject({
        code: "PAYMENT_GATEWAY_ERROR",
        status: 502,
      });
      const [row] = await db.select().from(orders).where(eq(orders.eventId, ctx.event.id));
      expect(row?.status).toBe("EXPIRED");
      expect(await allocated(ctx.vip.id)).toBe(0);
    }
  });

  it("QRIS belum terhubung → 422 PAYMENT_METHOD_UNAVAILABLE (BR-PAY-09)", async () => {
    const ctx = await setup();
    ctx.tripay.state.rejectApiKey = true;
    await connectQris(db, ctx.event.id, ctx.tripay.provider);
    await expect(order(ctx)).rejects.toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });
  });

  it("webhook PAID valid → Lunas, QR Tiket terbit, email; ganda → no-op (AC-LP-09.2, 09.5)", async () => {
    const ctx = await setup();
    const { order: created, payment } = await order(ctx);
    if (!payment) throw new Error("payment hilang");

    expect(await webhook(ctx, paidCallback(payment))).toEqual({
      status: 200,
      body: { success: true },
    });
    const [paid] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(paid).toMatchObject({ status: "PAID", paidVia: "GATEWAY_WEBHOOK" });
    expect(await db.select().from(tickets).where(eq(tickets.orderId, created.id))).toHaveLength(1);

    expect(await webhook(ctx, paidCallback(payment))).toEqual({
      status: 200,
      body: { success: true },
    });
    expect(await db.select().from(tickets).where(eq(tickets.orderId, created.id))).toHaveLength(1);
    const emails = await db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.orderId, created.id), eq(emailOutbox.type, "TICKET_ISSUED")));
    expect(emails).toHaveLength(1);
    const inbox = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.paymentConfigId, ctx.config.id));
    expect(inbox.map((row) => row.result).sort()).toEqual(["APPLIED", "DUPLICATE"]);
    expect(JSON.stringify(inbox[0]?.headers)).not.toContain("x-callback-signature");
  });

  it("signature salah → 401 REJECTED; webhookKey tak dikenal → 404 (AC-LP-09.4)", async () => {
    const ctx = await setup();
    const { order: created, payment } = await order(ctx);
    if (!payment) throw new Error("payment hilang");
    expect(await webhook(ctx, paidCallback(payment), { privateKey: "palsu" })).toEqual({
      status: 401,
      body: { success: false },
    });
    const [unchanged] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(unchanged?.status).toBe("PENDING_PAYMENT");

    const { rawBody, headers } = signedCallback(paidCallback(payment));
    const unknown = await processPaymentWebhook(
      db,
      { webhookKey: "tidak-ada", rawBody, headers },
      { provider: ctx.tripay.provider, kek, qrSigningKey },
    );
    expect(unknown.status).toBe(404);
  });

  it("nominal berbeda → tidak Lunas, ditandai perlu ditinjau (BR-PAY-06)", async () => {
    const ctx = await setup();
    const { order: created, payment } = await order(ctx);
    if (!payment) throw new Error("payment hilang");
    await webhook(ctx, paidCallback(payment, 1_000));
    const [row] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(row).toMatchObject({ status: "PENDING_PAYMENT", needsReview: true });
  });

  it("referensi milik tenant lain diabaikan (DRD Security §2)", async () => {
    const victim = await setup();
    const attacker = await setup();
    const { order: created, payment } = await order(victim);
    if (!payment) throw new Error("payment hilang");
    // Callback bertanda tangan sah milik tenant penyerang, berisi referensi tenant korban.
    expect((await webhook(attacker, paidCallback(payment))).status).toBe(200);
    const [row] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(row?.status).toBe("PENDING_PAYMENT");
  });

  it("gateway EXPIRED → order Kedaluwarsa, kuota dilepas (AC-LP-09.3)", async () => {
    const ctx = await setup();
    const { order: created, payment } = await order(ctx);
    if (!payment) throw new Error("payment hilang");
    await webhook(ctx, { ...paidCallback(payment), status: "EXPIRED", paid_at: null });
    const [row] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(row?.status).toBe("EXPIRED");
    expect(await allocated(ctx.vip.id)).toBe(0);
  });

  it("PAID terlambat: kuota masih ada → Lunas; kuota habis → perlu ditinjau (BR-PAY-08)", async () => {
    const ctx = await setup({ vipQuota: 1 });
    const { order: late, payment } = await order(ctx);
    if (!payment) throw new Error("payment hilang");
    await webhook(ctx, { ...paidCallback(payment), status: "EXPIRED", paid_at: null });
    await webhook(ctx, paidCallback(payment));
    const [revived] = await db.select().from(orders).where(eq(orders.id, late.id));
    expect(revived?.status).toBe("PAID");
    expect(await allocated(ctx.vip.id)).toBe(1);

    const other = await setup({ vipQuota: 1 });
    const { order: lost, payment: lostPayment } = await order(other);
    if (!lostPayment) throw new Error("payment hilang");
    await webhook(other, { ...paidCallback(lostPayment), status: "EXPIRED", paid_at: null });
    await order(other); // kuota terakhir diambil pembeli lain
    await webhook(other, paidCallback(lostPayment));
    const [review] = await db.select().from(orders).where(eq(orders.id, lost.id));
    expect(review).toMatchObject({ status: "EXPIRED", needsReview: true });
  });

  it("reconcile-qris: transaksi UNPAID > 2 menit yang sudah dibayar → Lunas", async () => {
    const ctx = await setup();
    const { order: created, payment } = await order(ctx);
    if (!payment?.providerReference) throw new Error("payment hilang");
    await db
      .update(paymentTransactions)
      .set({
        createdAt: new Date(Date.now() - 5 * MINUTE),
        expiresAt: new Date(Date.now() + MINUTE),
      })
      .where(eq(paymentTransactions.id, payment.id));
    ctx.tripay.state.statuses.set(payment.providerReference, { status: "PAID", amount: 150_000 });
    const result = await reconcileQrisPayments(db, {
      provider: ctx.tripay.provider,
      kek,
      qrSigningKey,
    });
    expect(result.applied).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(row).toMatchObject({ status: "PAID", paidVia: "GATEWAY_RECONCILE" });
  });
});
