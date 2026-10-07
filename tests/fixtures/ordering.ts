import { randomBytes } from "node:crypto";

import type { Database } from "@/server/db/client";
import {
  createCashOrder,
  reissueExpiredOrder,
  type CreateCashOrderInput,
  type ReissueExpiredOrderInput,
} from "@/server/modules/ordering";
import { withTenant } from "@/server/tenancy";

export const qrSigningKey = randomBytes(32);

// Teater Bagol: 20 Des 2026 19:00–22:00 WIB.
export const EVENT_STARTS_AT = new Date("2026-12-20T19:00:00+07:00");
export const EVENT_ENDS_AT = new Date("2026-12-20T22:00:00+07:00");
export const BEFORE_EVENT = new Date("2026-12-01T10:00:00+07:00");

export const customer = {
  name: "Siti R.",
  phone: "081311221122",
  email: "siti@example.com",
};

export function checkout(
  db: Database,
  eventId: string,
  items: CreateCashOrderInput["items"],
  options: { now?: Date; idempotencyKey?: string } = {},
) {
  return withTenant(db, { eventId }, (repo) =>
    createCashOrder(
      repo,
      {
        items,
        customer,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
      { qrSigningKey, now: options.now ?? BEFORE_EVENT },
    ),
  );
}

export function reissue(
  db: Database,
  eventId: string,
  actorUserId: string | undefined,
  input: Omit<ReissueExpiredOrderInput, "cashReceived"> & { cashReceived?: boolean },
  now: Date,
) {
  return withTenant(db, actorUserId ? { eventId, actorUserId } : { eventId }, (repo) =>
    reissueExpiredOrder(repo, { cashReceived: true, ...input }, { qrSigningKey, now }),
  );
}
