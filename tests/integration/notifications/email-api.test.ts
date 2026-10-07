import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { emailOutbox } from "@/server/db/schema";

import { createEvent, createTicketType, useTestDatabase } from "../../fixtures/db";
import { body, ctx, ORIGIN } from "../../fixtures/http";
import { checkout, EVENT_ENDS_AT, EVENT_STARTS_AT } from "../../fixtures/ordering";

type Handlers = {
  webhook: typeof import("@/app/api/webhooks/email/[provider]/route");
  cron: typeof import("@/app/api/internal/cron/[job]/route");
};

const CRON_SECRET = "cron-email-uji";
const WEBHOOK_KEY = Buffer.from("kunci-webhook-email-uji-32-byte!");

describe("Email API: webhook Resend & cron process-email-outbox (DRD API §6–7)", () => {
  const db = useTestDatabase();
  let api: Handlers;
  let outboxDir: string;

  beforeAll(async () => {
    outboxDir = await mkdtemp(path.join(tmpdir(), "uncle-email-"));
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.QR_SIGNING_KEY = randomBytes(32).toString("base64");
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.EMAIL_WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString("base64")}`;
    process.env.EMAIL_DEV_OUTBOX_DIR = outboxDir;
    delete process.env.EMAIL_API_KEY;
    api = {
      webhook: await import("@/app/api/webhooks/email/[provider]/route"),
      cron: await import("@/app/api/internal/cron/[job]/route"),
    };
  });

  const runCron = () =>
    api.cron.POST(
      new Request(`${ORIGIN}/api/internal/cron/process-email-outbox`, {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
      ctx({ job: "process-email-outbox" }),
    );

  function signedWebhook(payload: unknown, key = WEBHOOK_KEY) {
    const rawBody = JSON.stringify(payload);
    const id = "msg_uji";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");
    return new Request(`${ORIGIN}/api/webhooks/email/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
      body: rawBody,
    });
  }

  it("cron mengirim outbox (driver file dev), lalu webhook bounced → BOUNCED", async () => {
    const event = await createEvent(db, { startsAt: EVENT_STARTS_AT, endsAt: EVENT_ENDS_AT });
    const vip = await createTicketType(db, event.id);
    const created = await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 1 }]);

    // Outbox uji dipakai bersama file lain: dahulukan baris ini di batch cron (20 terlama).
    await db
      .update(emailOutbox)
      .set({ nextAttemptAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(emailOutbox.orderId, created.order.id));
    const ran = await runCron();
    expect(ran.status).toBe(200);
    expect(await body(ran)).toMatchObject({ job: "process-email-outbox" });
    const [row] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orderId, created.order.id));
    expect(row?.status).toBe("SENT");
    const files = await readdir(outboxDir);
    expect(files).toContain(`${row?.providerMessageId}.html`);

    const rejected = await api.webhook.POST(
      signedWebhook(
        { type: "email.bounced", data: { email_id: row?.providerMessageId } },
        Buffer.from("kunci-salah-kunci-salah-32-bytes"),
      ),
      ctx({ provider: "resend" }),
    );
    expect(rejected.status).toBe(401);

    const accepted = await api.webhook.POST(
      signedWebhook({ type: "email.bounced", data: { email_id: row?.providerMessageId } }),
      ctx({ provider: "resend" }),
    );
    expect(accepted.status).toBe(200);
    const [bounced] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, row?.id ?? ""));
    expect(bounced?.status).toBe("BOUNCED");

    const unknown = await api.webhook.POST(
      signedWebhook({ type: "email.delivered" }),
      ctx({ provider: "postmark" }),
    );
    expect(unknown.status).toBe(404);
  });
});
