import "server-only";

import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import { EmailSendFailure, type EmailSender } from "@/integrations/email/email-sender";
import { logger } from "@/lib/logger";
import type { Database } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";

import { composeOutboxEmail, type ComposeDeps } from "./compose";

type OutboxRow = typeof emailOutbox.$inferSelect;

// DRD Integrations §2: retry 1, 5, 15, 60, 240 menit; setelah 5x → FAILED.
const BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
export const MAX_EMAIL_ATTEMPTS = BACKOFF_MINUTES.length;
// SENDING lebih lama dari ini dianggap worker mati → diklaim ulang.
const STUCK_SENDING_MS = 10 * 60_000;
const MINUTE_MS = 60_000;

export interface OutboxDeps extends Omit<ComposeDeps, "now"> {
  readonly sender: EmailSender;
  readonly now?: Date;
  readonly batchSize?: number;
}

export interface OutboxRunResult {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
}

/** Ambil batch PENDING yang jatuh tempo (SKIP LOCKED → aman dijalankan paralel). */
async function claimBatch(db: Database, now: Date, limit: number): Promise<OutboxRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          lte(emailOutbox.nextAttemptAt, now),
          or(
            eq(emailOutbox.status, "PENDING"),
            and(
              eq(emailOutbox.status, "SENDING"),
              lt(emailOutbox.updatedAt, new Date(now.getTime() - STUCK_SENDING_MS)),
            ),
          ),
        ),
      )
      .orderBy(asc(emailOutbox.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(emailOutbox)
      .set({ status: "SENDING", attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: now })
      .where(
        inArray(
          emailOutbox.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });
}

// Token undangan hanya disimpan sampai email selesai diproses.
function scrubbedPayload(row: OutboxRow): Record<string, unknown> | undefined {
  if (row.type !== "ADMIN_INVITE") return undefined;
  const payload = { ...((row.payload ?? {}) as Record<string, unknown>) };
  delete payload.token;
  return payload;
}

async function finish(
  db: Database,
  row: OutboxRow,
  values: Partial<typeof emailOutbox.$inferInsert>,
  now: Date,
  final: boolean,
) {
  const payload = final ? scrubbedPayload(row) : undefined;
  await db
    .update(emailOutbox)
    .set({ ...values, ...(payload ? { payload } : {}), updatedAt: now })
    .where(eq(emailOutbox.id, row.id));
}

/**
 * Worker `process-email-outbox` (DRD Architecture §6): kirim email PENDING,
 * retry backoff eksponensial; limit/429 Resend = retry, bukan FAILED.
 * Job sistem lintas tenant (koneksi owner, setiap query difilter event_id).
 */
export async function processEmailOutbox(db: Database, deps: OutboxDeps): Promise<OutboxRunResult> {
  const now = deps.now ?? new Date();
  const rows = await claimBatch(db, now, deps.batchSize ?? 20);
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const composed = await composeOutboxEmail(db, row, { ...deps, now });
      if (!composed.ok) {
        await finish(db, row, { status: "FAILED", lastError: composed.reason }, now, true);
        failed += 1;
        continue;
      }
      const { providerMessageId } = await deps.sender.send(composed.message);
      await finish(
        db,
        row,
        { status: "SENT", providerMessageId, sentAt: now, lastError: null },
        now,
        true,
      );
      sent += 1;
    } catch (error) {
      const permanent = error instanceof EmailSendFailure && error.kind === "permanent";
      const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      if (permanent || row.attempts >= MAX_EMAIL_ATTEMPTS) {
        await finish(db, row, { status: "FAILED", lastError }, now, true);
        failed += 1;
      } else {
        const delay = BACKOFF_MINUTES[row.attempts - 1] ?? BACKOFF_MINUTES[0];
        await finish(
          db,
          row,
          {
            status: "PENDING",
            lastError,
            nextAttemptAt: new Date(now.getTime() + delay * MINUTE_MS),
          },
          now,
          false,
        );
        retried += 1;
      }
      logger.warn("Email outbox gagal dikirim", {
        outboxId: row.id,
        type: row.type,
        attempt: row.attempts,
        error: lastError,
      });
    }
  }

  if (rows.length > 0) {
    logger.info("process-email-outbox selesai", { claimed: rows.length, sent, retried, failed });
  }
  return { claimed: rows.length, sent, retried, failed };
}

/** Status pengiriman dari webhook provider (DRD Integrations §2). */
export async function applyEmailDeliveryEvent(
  db: Database,
  event: { providerMessageId: string; type: string },
): Promise<boolean> {
  if (event.type === "email.bounced") {
    const updated = await db
      .update(emailOutbox)
      .set({ status: "BOUNCED", lastError: "Bounced" })
      .where(eq(emailOutbox.providerMessageId, event.providerMessageId))
      .returning({ id: emailOutbox.id });
    return updated.length > 0;
  }
  if (event.type === "email.complained") {
    const updated = await db
      .update(emailOutbox)
      .set({ lastError: "Ditandai spam oleh penerima" })
      .where(eq(emailOutbox.providerMessageId, event.providerMessageId))
      .returning({ id: emailOutbox.id });
    return updated.length > 0;
  }
  return false;
}
