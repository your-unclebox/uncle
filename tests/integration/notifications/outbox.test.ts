import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { EmailSendFailure, type EmailMessage, type EmailSender } from "@/integrations/email";
import { emailOutbox } from "@/server/db/schema";
import { inviteAdmin } from "@/server/modules/identity";
import { getCustomerOrder, verifyOrderAccessToken } from "@/server/modules/ordering";
import { applyEmailDeliveryEvent, processEmailOutbox } from "@/server/modules/notifications";
import { withTenant } from "@/server/tenancy";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { createOwnerUser } from "../../fixtures/identity";
import {
  BEFORE_EVENT,
  checkout,
  customer,
  EVENT_ENDS_AT,
  EVENT_STARTS_AT,
  qrSigningKey,
} from "../../fixtures/ordering";

const MINUTE = 60_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

type Behaviour = "ok" | "retryable" | "permanent";

function fakeSender(behaviour: () => Behaviour = () => "ok") {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(message) {
      const outcome = behaviour();
      if (outcome !== "ok") throw new EmailSendFailure(`gagal ${outcome}`, outcome);
      sent.push(message);
      return { providerMessageId: `re_${randomBytes(4).toString("hex")}` };
    },
  };
  return { sender, sent };
}

describe("Email outbox (DRD Integrations §2)", () => {
  const db = useTestDatabase();
  const deps = (sender: EmailSender, now: Date) => ({
    sender,
    qrSigningKey,
    appUrl: "https://app.uncle.test",
    baseDomain: "uncle.test",
    fromAddress: "tiket@mail.uncle.test",
    now,
    batchSize: 1000,
  });

  async function cashOrder() {
    const event = await createEvent(db, {
      name: "Teater Bagol",
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
      contactInfo: "WA 0812xxxx / panitia@teater.id",
      venueName: "Gedung Kesenian",
    });
    const vip = await createTicketType(db, event.id, { name: "VIP", price: 150_000n });
    const created = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);
    const [row] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, created.order.id));
    if (!row) throw new Error("outbox hilang");
    return { event, created, row };
  }

  const reload = async (id: string) =>
    (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)))[0];

  it("CASH_RESERVATION: QR PNG inline, tautan cadangan bertoken, From/Reply-To → SENT", async () => {
    const { event, created, row } = await cashOrder();
    const { sender, sent } = fakeSender();
    await processEmailOutbox(db, deps(sender, BEFORE_EVENT));

    const message = sent.find((m) => m.idempotencyKey === `email-outbox-${row.id}`);
    if (!message) throw new Error("email tidak terkirim");
    expect(message).toMatchObject({
      to: customer.email,
      from: '"Teater Bagol via Uncle" <tiket@mail.uncle.test>',
      replyTo: "panitia@teater.id",
      subject: `Reservasi tiket Teater Bagol — ${created.order.orderCode}`,
    });
    const attachment = message.attachments?.[0];
    expect(attachment).toMatchObject({ contentId: "qr-ticket", contentType: "image/png" });
    expect(attachment?.content.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
    expect(message.html).toContain("Rp 150.000");
    expect(message.html).toContain("Reservasi berlaku sampai");

    // Tautan cadangan membuka order ini (token Cek Pesanan, bukan token pembuatan).
    const link = /pesanan\/(UNC-[0-9A-Z]{6})\?t=([^"&\s]+)/.exec(message.text);
    expect(link?.[1]).toBe(created.order.orderCode);
    expect(message.text).toContain(`http://${event.slug}.uncle.test`.replace("http", "https"));
    expect(verifyOrderAccessToken(qrSigningKey, created.order, link?.[2], BEFORE_EVENT)).toBe(true);

    expect(await reload(row.id)).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
    const view = await withTenant(db, { eventId: event.id }, (repo) =>
      getCustomerOrder(
        repo,
        { orderCode: created.order.orderCode, accessToken: created.accessToken },
        { qrSigningKey, now: BEFORE_EVENT },
      ),
    );
    expect(view.emailStatus).toBe("SENT");
  });

  it("gagal sementara → retry 1, 5, 15, 60 menit lalu FAILED setelah 5x; gagal permanen langsung FAILED", async () => {
    const { row } = await cashOrder();
    const { sender } = fakeSender(() => "retryable");
    let now = BEFORE_EVENT;
    for (const [attempt, delay] of [
      [1, 1],
      [2, 5],
      [3, 15],
      [4, 60],
    ] as const) {
      await processEmailOutbox(db, deps(sender, now));
      const current = await reload(row.id);
      expect(current).toMatchObject({ status: "PENDING", attempts: attempt });
      expect(current?.nextAttemptAt).toEqual(new Date(now.getTime() + delay * MINUTE));
      // Belum jatuh tempo → tidak diklaim.
      await processEmailOutbox(db, deps(sender, new Date(now.getTime() + MINUTE / 2)));
      expect((await reload(row.id))?.attempts).toBe(attempt);
      now = current?.nextAttemptAt ?? now;
    }
    await processEmailOutbox(db, deps(sender, now));
    expect(await reload(row.id)).toMatchObject({ status: "FAILED", attempts: 5 });

    const second = await cashOrder();
    await processEmailOutbox(db, deps(fakeSender(() => "permanent").sender, BEFORE_EVENT));
    expect(await reload(second.row.id)).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("dua worker paralel tidak mengirim email yang sama dua kali (SKIP LOCKED)", async () => {
    const orders = await Promise.all([cashOrder(), cashOrder(), cashOrder()]);
    const { sender, sent } = fakeSender();
    await Promise.all([
      processEmailOutbox(db, deps(sender, BEFORE_EVENT)),
      processEmailOutbox(db, deps(sender, BEFORE_EVENT)),
    ]);
    for (const { row } of orders) {
      expect(sent.filter((m) => m.idempotencyKey === `email-outbox-${row.id}`)).toHaveLength(1);
    }
  });

  it("QR Tiket sudah VOID → email reservasi tidak dikirim (FAILED + alasan)", async () => {
    const { row } = await cashOrder();
    const { sender, sent } = fakeSender();
    // Reservasi kedaluwarsa sebelum email sempat dikirim.
    const afterEnd = new Date(EVENT_ENDS_AT.getTime() + MINUTE);
    const { expireDueOrders } = await import("@/server/jobs/expire-orders");
    await expireDueOrders(db, { now: afterEnd, batchSize: 1000 });
    await processEmailOutbox(db, deps(sender, afterEnd));
    expect(await reload(row.id)).toMatchObject({
      status: "FAILED",
      lastError: "QR Tiket tidak aktif",
    });
    expect(sent.some((m) => m.idempotencyKey === `email-outbox-${row.id}`)).toBe(false);
    const expired = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, row.orderId ?? ""));
    expect(expired.find((r) => r.type === "RESERVATION_EXPIRED")?.status).toBe("SENT");
  });

  it("ADMIN_INVITE: link /undangan/{token}; token dihapus dari payload setelah terkirim", async () => {
    const event = await createEvent(db, { name: "Konser X" });
    const owner = await createOwnerUser(db);
    const { invitation, token } = await withTenant(db, { eventId: event.id }, (repo) =>
      inviteAdmin(repo, { email: "rina@client.id", name: "Rina" }, { invitedBy: owner.id }),
    );
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.eventId, event.id));
    expect(row?.payload).toMatchObject({ invitationId: invitation.id, token });

    const { sender, sent } = fakeSender();
    await processEmailOutbox(db, deps(sender, new Date()));
    const message = sent.find((m) => m.idempotencyKey === `email-outbox-${row?.id}`);
    expect(message?.to).toBe("rina@client.id");
    expect(message?.html).toContain(`https://app.uncle.test/undangan/${token}`);
    const after = await reload(row?.id ?? "");
    expect(after?.status).toBe("SENT");
    expect(after?.payload).toEqual({ invitationId: invitation.id });
  });

  it("webhook bounced → BOUNCED; pembeli tidak melihat klaim terkirim", async () => {
    const { event, created, row } = await cashOrder();
    const { sender } = fakeSender();
    await processEmailOutbox(db, deps(sender, BEFORE_EVENT));
    const sentRow = await reload(row.id);
    expect(
      await applyEmailDeliveryEvent(db, {
        type: "email.bounced",
        providerMessageId: sentRow?.providerMessageId ?? "",
      }),
    ).toBe(true);
    const view = await withTenant(db, { eventId: event.id }, (repo) =>
      getCustomerOrder(
        repo,
        { orderCode: created.order.orderCode, accessToken: created.accessToken },
        { qrSigningKey, now: BEFORE_EVENT },
      ),
    );
    expect(view.emailStatus).toBe("BOUNCED");
  });
});
