import "server-only";

import { after } from "next/server";

import { getServerEnv } from "@/config/env";
import { getEmailSender, verifyResendWebhook } from "@/integrations/email";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db/client";
import {
  applyEmailDeliveryEvent,
  processEmailOutbox,
  type OutboxDeps,
} from "@/server/modules/notifications";
import { getQrSigningKey } from "@/server/modules/ticketing";

import { getAppUrl } from "./app-url";

// DRD Integrations §2: outbox dikirim worker/cron dan "dipicu segera setelah commit".

export function outboxDeps(): OutboxDeps {
  const env = getServerEnv();
  return {
    sender: getEmailSender(),
    qrSigningKey: getQrSigningKey(),
    appUrl: getAppUrl(),
    baseDomain: env.APP_BASE_DOMAIN,
    fromAddress: env.EMAIL_FROM ?? "tiket@mail.uncle.id",
  };
}

export function runEmailOutbox() {
  return processEmailOutbox(getDb(), outboxDeps());
}

/** Kirim email yang baru masuk outbox setelah respons selesai (tanpa menunda respons). */
export function kickEmailOutbox(): void {
  try {
    after(async () => {
      try {
        await runEmailOutbox();
      } catch (error) {
        // Gagal di sini tidak hilang: cron process-email-outbox mengulanginya.
        logger.warn("Kirim email langsung gagal", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  } catch {
    // Di luar request (test/script): cron yang mengirim.
  }
}

/** POST /api/webhooks/email/{provider} — status delivered/bounced/complained (DRD API §6). */
export async function receiveEmailWebhook(request: Request, provider: string) {
  if (provider !== "resend") return { status: 404, body: { success: false } };
  const secret = getServerEnv().EMAIL_WEBHOOK_SECRET;
  const rawBody = await request.text();
  if (!secret || !verifyResendWebhook(secret, rawBody, request.headers)) {
    return { status: 401, body: { success: false } };
  }
  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return { status: 400, body: { success: false } };
  }
  if (typeof event.type === "string" && typeof event.data?.email_id === "string") {
    await applyEmailDeliveryEvent(getDb(), {
      type: event.type,
      providerMessageId: event.data.email_id,
    });
  }
  return { status: 200, body: { success: true } };
}
