import "server-only";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { generateToken } from "@/lib/crypto/tokens";
import type {
  GatewayCredentials,
  GatewayMode,
  PaymentProvider,
} from "@/integrations/payment-gateway/payment-provider";
import type { Database } from "@/server/db/client";
import { auditLogs, paymentConfigs } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import { withTenant, type TenantContext, type TenantScopedRepository } from "@/server/tenancy";

import {
  credentialAad,
  decryptSecret,
  encryptSecret,
  type EncryptionKey,
} from "./credential-crypto";
import { PaymentConfigNotSetError } from "./errors";
import { paymentConfigInputSchema } from "./schemas";

type PaymentConfigRow = typeof paymentConfigs.$inferSelect;

export interface PaymentConfigDeps {
  readonly provider: PaymentProvider;
  readonly kek: EncryptionKey;
  readonly mode: GatewayMode;
  /** Origin dashboard, mis. https://app.uncle.id (untuk URL webhook). */
  readonly appUrl: string;
  readonly now?: Date;
}

export const webhookUrlFor = (appUrl: string, webhookKey: string) =>
  `${appUrl.replace(/\/$/, "")}/api/webhooks/payments/tripay/${webhookKey}`;

const last4 = (value: string) => value.slice(-4);

/** Kredensial terdekripsi — hanya di memori, tidak pernah dikembalikan API / di-log. */
export function decryptCredentials(
  config: PaymentConfigRow,
  kek: EncryptionKey,
): GatewayCredentials {
  if (!config.apiKeyEnc || !config.privateKeyEnc) throw new PaymentConfigNotSetError();
  if (config.encKeyId !== kek.id)
    throw new Error(`Kunci enkripsi ${config.encKeyId} tidak tersedia.`);
  const aad = credentialAad(config.eventId, config.id);
  return {
    mode: config.mode,
    merchantCode: config.merchantCode,
    apiKey: decryptSecret(kek.key, config.apiKeyEnc, aad),
    privateKey: decryptSecret(kek.key, config.privateKeyEnc, aad),
  };
}

export async function findPaymentConfig(
  repo: TenantScopedRepository,
): Promise<PaymentConfigRow | undefined> {
  return repo.findFirst(paymentConfigs);
}

/** BR-PAY-09: QRIS tampil di landing hanya bila koneksi berstatus CONNECTED. */
export async function isQrisConnected(repo: TenantScopedRepository): Promise<boolean> {
  return (await findPaymentConfig(repo))?.status === "CONNECTED";
}

/** Tampilan Payment Settings: termasking, tanpa secret (AC-ADM-07.4, DRD Security §1). */
export function toPaymentConfigView(config: PaymentConfigRow | undefined, appUrl: string) {
  if (!config || !config.apiKeyEnc) {
    return {
      status: "NOT_SET" as const,
      provider: "TRIPAY" as const,
      mode: config?.mode ?? null,
      merchantCodeLast4: null,
      apiKeyLast4: null,
      lastTestedAt: null,
      lastError: null,
      webhookUrl: null,
    };
  }
  return {
    status: config.status,
    provider: config.provider,
    mode: config.mode,
    merchantCodeLast4: last4(config.merchantCode),
    apiKeyLast4: config.apiKeyLast4,
    lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
    lastError: config.lastError,
    webhookUrl: webhookUrlFor(appUrl, config.webhookKey),
  };
}

export type PaymentConfigView = ReturnType<typeof toPaymentConfigView>;

async function recordTestResult(
  db: Database,
  context: TenantContext,
  configId: string,
  result: Awaited<ReturnType<PaymentProvider["testConnection"]>>,
  now: Date,
): Promise<PaymentConfigRow> {
  return withTenant(db, context, async (repo) => {
    const [updated] = await repo.update(
      paymentConfigs,
      {
        status: result.ok ? "CONNECTED" : "FAILED",
        lastTestedAt: now,
        // Pesan dari provider, tanpa secret (DRD Integrations §1.2).
        lastError: result.ok ? null : result.message.slice(0, 500),
      },
      eq(paymentConfigs.id, configId),
    );
    if (!updated) throw new PaymentConfigNotSetError();
    return updated;
  });
}

/**
 * ADM-07 / DRD Integrations §1.2: validasi → enkripsi → simpan (status
 * sementara FAILED sampai teruji) → uji koneksi di luar transaksi DB →
 * CONNECTED / FAILED. Kredensial lama ditimpa utuh ("Ganti Kredensial").
 */
export async function savePaymentConfig(
  db: Database,
  context: TenantContext,
  rawInput: unknown,
  deps: PaymentConfigDeps,
): Promise<PaymentConfigView> {
  const input = parseInput(paymentConfigInputSchema, rawInput);
  const now = deps.now ?? new Date();

  const saved = await withTenant(db, context, async (repo) => {
    const existing = await findPaymentConfig(repo);
    const id = existing?.id ?? randomUUID();
    const aad = credentialAad(repo.eventId, id);
    const values = {
      provider: input.provider,
      mode: deps.mode,
      merchantCode: input.merchantCode,
      apiKeyEnc: encryptSecret(deps.kek.key, input.apiKey, aad),
      privateKeyEnc: encryptSecret(deps.kek.key, input.privateKey, aad),
      encKeyId: deps.kek.id,
      apiKeyLast4: last4(input.apiKey).padStart(4, "*"),
      status: "FAILED" as const,
      lastError: "Belum diuji",
      updatedBy: context.actorUserId ?? null,
    };
    const row = existing
      ? (await repo.update(paymentConfigs, values, eq(paymentConfigs.id, id)))[0]
      : await repo.insert(paymentConfigs, { id, webhookKey: generateToken(), ...values });
    if (!row) throw new PaymentConfigNotSetError();
    // Audit tanpa nilai secret (DRD Security §1).
    await repo.insert(auditLogs, {
      actorUserId: context.actorUserId ?? null,
      action: "PAYMENT_CONFIG_UPDATED",
      entityType: "payment_config",
      entityId: row.id,
      after: { provider: row.provider, mode: row.mode, apiKeyLast4: row.apiKeyLast4 },
    });
    return row;
  });

  const result = await deps.provider.testConnection(decryptCredentials(saved, deps.kek));
  const tested = await recordTestResult(db, context, saved.id, result, now);
  return toPaymentConfigView(tested, deps.appUrl);
}

/** "Uji Ulang" (DRD API §5 …/payment-config/test). */
export async function retestPaymentConfig(
  db: Database,
  context: TenantContext,
  deps: PaymentConfigDeps,
): Promise<PaymentConfigView> {
  const config = await withTenant(db, context, findPaymentConfig);
  if (!config?.apiKeyEnc) throw new PaymentConfigNotSetError();
  const result = await deps.provider.testConnection(decryptCredentials(config, deps.kek));
  const tested = await recordTestResult(db, context, config.id, result, deps.now ?? new Date());
  return toPaymentConfigView(tested, deps.appUrl);
}
