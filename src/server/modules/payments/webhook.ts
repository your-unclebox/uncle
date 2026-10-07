import "server-only";

import { and, eq } from "drizzle-orm";

import { logger } from "@/lib/logger";
import {
  PaymentGatewayFailure,
  type GatewayWebhook,
  type PaymentProvider,
} from "@/integrations/payment-gateway/payment-provider";
import type { Database } from "@/server/db/client";
import { paymentConfigs, paymentTransactions, webhookEvents } from "@/server/db/schema";
import { withTenant } from "@/server/tenancy";

import type { EncryptionKey } from "./credential-crypto";
import { applyGatewayStatus } from "./gateway-status";
import { decryptCredentials } from "./payment-config";

export interface WebhookDeps {
  readonly provider: PaymentProvider;
  readonly kek: EncryptionKey;
  readonly qrSigningKey: Buffer;
  readonly now?: Date;
}

export interface WebhookResponse {
  readonly status: number;
  readonly body: { readonly success: boolean };
}

const ACCEPTED: WebhookResponse = { status: 200, body: { success: true } };

// Header yang disimpan di inbox (tanpa signature/secret).
function safeHeaders(headers: Headers) {
  return {
    "x-callback-event": headers.get("x-callback-event"),
    "content-type": headers.get("content-type"),
    "user-agent": headers.get("user-agent"),
  };
}

/**
 * Webhook Tripay (DRD Integrations §1.4, Security §2):
 * webhookKey → tenant; verifikasi HMAC raw body dengan private key tenant;
 * inbox webhook_events (dedupe_key UNIQUE → idempoten); transaksi harus milik
 * payment_config yang sama; status diterapkan lewat state machine.
 */
export async function processPaymentWebhook(
  db: Database,
  params: { webhookKey: string; rawBody: string; headers: Headers },
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const now = deps.now ?? new Date();
  // Lookup sistem lintas tenant (koneksi owner, RLS dilewati) hanya untuk webhookKey.
  const [config] = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.webhookKey, params.webhookKey))
    .limit(1);
  if (!config?.apiKeyEnc) return { status: 404, body: { success: false } };

  const credentials = decryptCredentials(config, deps.kek);
  const signatureValid = deps.provider.verifyWebhook(credentials, params.rawBody, params.headers);
  const base = {
    provider: config.provider,
    paymentConfigId: config.id,
    eventId: config.eventId,
    receivedAt: now,
    signatureValid,
    headers: safeHeaders(params.headers),
    rawBody: params.rawBody,
  };

  if (!signatureValid) {
    await db.insert(webhookEvents).values({ ...base, result: "REJECTED", processedAt: now });
    logger.warn("Webhook QRIS ditolak: signature tidak valid", { eventId: config.eventId });
    return { status: 401, body: { success: false } };
  }

  let report: GatewayWebhook;
  try {
    report = deps.provider.parseWebhook(params.rawBody);
  } catch (error) {
    if (!(error instanceof PaymentGatewayFailure)) throw error;
    await db
      .insert(webhookEvents)
      .values({ ...base, result: "IGNORED", processedAt: now, error: error.message });
    return ACCEPTED;
  }

  const dedupeKey = `${config.provider}:${report.providerReference}:${report.status}`;
  const [inbox] = await db
    .insert(webhookEvents)
    .values({
      ...base,
      providerReference: report.providerReference,
      reportedStatus: report.status,
      dedupeKey,
    })
    .onConflictDoNothing({ target: webhookEvents.dedupeKey })
    .returning();
  if (!inbox) {
    // Notifikasi ganda: dicatat, tidak diproses lagi (BR-PAY-05).
    await db.insert(webhookEvents).values({
      ...base,
      providerReference: report.providerReference,
      reportedStatus: report.status,
      result: "DUPLICATE",
      processedAt: now,
    });
    return ACCEPTED;
  }

  try {
    const result = await withTenant(db, { eventId: config.eventId }, async (repo) => {
      // Jangan percaya isi webhook: transaksi harus milik payment_config ini.
      const transaction = await repo.findFirst(
        paymentTransactions,
        and(
          eq(paymentTransactions.paymentConfigId, config.id),
          eq(paymentTransactions.providerReference, report.providerReference),
          eq(paymentTransactions.merchantRef, report.merchantRef),
        ),
      );
      if (!transaction) return "IGNORED" as const;
      return applyGatewayStatus(repo, transaction.id, report, {
        qrSigningKey: deps.qrSigningKey,
        now,
        via: "GATEWAY_WEBHOOK",
      });
    });
    await db
      .update(webhookEvents)
      .set({ result, processedAt: now })
      .where(eq(webhookEvents.id, inbox.id));
    return ACCEPTED;
  } catch (error) {
    // Gagal diproses: lepas dedupe_key supaya retry dari gateway bisa diproses ulang.
    await db
      .update(webhookEvents)
      .set({ dedupeKey: null, error: error instanceof Error ? error.message : String(error) })
      .where(eq(webhookEvents.id, inbox.id));
    throw error;
  }
}
