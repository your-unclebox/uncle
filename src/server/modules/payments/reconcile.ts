import "server-only";

import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { logger } from "@/lib/logger";
import type { PaymentProvider } from "@/integrations/payment-gateway/payment-provider";
import type { Database } from "@/server/db/client";
import { paymentConfigs, paymentTransactions } from "@/server/db/schema";
import { withTenant } from "@/server/tenancy";

import type { EncryptionKey } from "./credential-crypto";
import { applyGatewayStatus, type ApplyResult } from "./gateway-status";
import { decryptCredentials } from "./payment-config";

export interface ReconcileDeps {
  readonly provider: PaymentProvider;
  readonly kek: EncryptionKey;
  readonly qrSigningKey: Buffer;
  readonly now?: Date;
}

type TransactionRef = Pick<
  typeof paymentTransactions.$inferSelect,
  "id" | "eventId" | "paymentConfigId" | "providerReference"
>;

const MINUTE_MS = 60_000;

/** Tanya status ke gateway lalu terapkan (paid_via = GATEWAY_RECONCILE). */
async function reconcileOne(
  db: Database,
  transaction: TransactionRef,
  deps: ReconcileDeps,
  now: Date,
): Promise<ApplyResult> {
  if (!transaction.providerReference) return "IGNORED";
  const [config] = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.id, transaction.paymentConfigId))
    .limit(1);
  if (!config?.apiKeyEnc) return "IGNORED";
  const report = await deps.provider.getPaymentStatus(
    decryptCredentials(config, deps.kek),
    transaction.providerReference,
  );
  if (report.status === "UNPAID") return "IGNORED";
  return withTenant(db, { eventId: transaction.eventId }, (repo) =>
    applyGatewayStatus(repo, transaction.id, report, {
      qrSigningKey: deps.qrSigningKey,
      now,
      via: "GATEWAY_RECONCILE",
    }),
  );
}

/**
 * Job `reconcile-qris` (DRD Architecture §6, Integrations §1.4): transaksi
 * UNPAID berumur > 2 menit sampai 10 menit setelah kedaluwarsa dicek ke
 * gateway — jaring pengaman bila webhook hilang. Job sistem lintas tenant.
 */
export async function reconcileQrisPayments(
  db: Database,
  deps: ReconcileDeps & { batchSize?: number },
): Promise<{ scanned: number; applied: number }> {
  const now = deps.now ?? new Date();
  const candidates = await db
    .select({
      id: paymentTransactions.id,
      eventId: paymentTransactions.eventId,
      paymentConfigId: paymentTransactions.paymentConfigId,
      providerReference: paymentTransactions.providerReference,
    })
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.status, "UNPAID"),
        lt(paymentTransactions.createdAt, new Date(now.getTime() - 2 * MINUTE_MS)),
        or(
          isNull(paymentTransactions.expiresAt),
          gt(paymentTransactions.expiresAt, new Date(now.getTime() - 10 * MINUTE_MS)),
        ),
      ),
    )
    .orderBy(asc(paymentTransactions.createdAt))
    .limit(deps.batchSize ?? 50);

  let applied = 0;
  for (const transaction of candidates) {
    try {
      if ((await reconcileOne(db, transaction, deps, now)) === "APPLIED") applied += 1;
    } catch (error) {
      logger.warn("reconcile-qris: gagal cek transaksi", {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info("reconcile-qris selesai", { scanned: candidates.length, applied });
  return { scanned: candidates.length, applied };
}

/** Tombol "Cek Status" di Step 4 (DRD API §2 …/payment/check). */
export async function checkOrderPayment(
  db: Database,
  params: { eventId: string; orderId: string },
  deps: ReconcileDeps,
): Promise<void> {
  const [transaction] = await withTenant(db, { eventId: params.eventId }, (repo) =>
    repo.tx
      .select({
        id: paymentTransactions.id,
        eventId: paymentTransactions.eventId,
        paymentConfigId: paymentTransactions.paymentConfigId,
        providerReference: paymentTransactions.providerReference,
      })
      .from(paymentTransactions)
      .where(repo.scope(paymentTransactions, eq(paymentTransactions.orderId, params.orderId)))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1),
  );
  if (transaction) await reconcileOne(db, transaction, deps, deps.now ?? new Date());
}
