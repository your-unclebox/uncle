import "server-only";

import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { expireDueOrders } from "@/server/jobs/expire-orders";
import { runReconcileQris } from "@/server/jobs/reconcile-qris";
import { UnauthenticatedError } from "@/server/modules/identity/errors";

import { DomainError } from "./domain-error";

// Kode baru (internal) — nama job tidak dikenal.
class UnknownJobError extends DomainError {
  readonly code = "JOB_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Job tidak dikenal");
  }
}

// DRD API §7: /api/internal/cron/{job}, header Authorization: Bearer {CRON_SECRET}.
const JOBS = {
  "expire-orders": () => expireDueOrders(getDb()),
  "reconcile-qris": () => runReconcileQris(getDb()),
} as const;

function assertCronSecret(request: Request): void {
  const secret = getServerEnv().CRON_SECRET;
  const given = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const ok =
    Boolean(secret) &&
    given.length === secret?.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) throw new UnauthenticatedError();
}

export async function runCronJob(request: Request, job: string) {
  assertCronSecret(request);
  if (!(job in JOBS)) throw new UnknownJobError();
  return { job, result: await JOBS[job as keyof typeof JOBS]() };
}
