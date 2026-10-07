import "server-only";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { EmailMessage } from "@/integrations/email/email-sender";
import { emailOutbox, orders } from "@/server/db/schema";
import { OrderNotFoundError } from "@/server/modules/ordering/errors";
import type { TenantScopedRepository } from "@/server/tenancy";

import { composeOutboxEmail, type ComposeDeps } from "./compose";
import { TicketResendNotAllowedError } from "./errors";

// ADM-08 — Kirim Ulang QR Tiket (DRD API §5). Memakai template & penyusun
// email yang sama dengan email TICKET_ISSUED pertama (DRD Integrations §2).

type OrderRow = typeof orders.$inferSelect;

/** Syarat kirim ulang: order ada (tenant ini), Lunas, punya email pembeli. */
export function assertTicketResendable<T extends Pick<OrderRow, "status" | "customerEmail">>(
  order: T | undefined,
): asserts order is T {
  if (!order) throw new OrderNotFoundError();
  if (order.status !== "PAID") throw new TicketResendNotAllowedError("ORDER_NOT_PAID");
  if (!order.customerEmail.trim()) throw new TicketResendNotAllowedError("EMAIL_MISSING");
}

const uuid = z.uuid();

/**
 * Susun ulang email QR Tiket untuk order Lunas. Tidak menulis ke database
 * (tanpa baris outbox / field baru); baris outbox hanya dibentuk di memori
 * supaya penyusunannya identik. Idempotency-Key unik per permintaan agar
 * Resend tidak menganggapnya duplikat email pertama.
 */
export async function prepareTicketResend(
  repo: TenantScopedRepository,
  orderId: string,
  deps: Omit<ComposeDeps, "now"> & { readonly now?: Date },
): Promise<EmailMessage> {
  if (!uuid.safeParse(orderId).success) throw new OrderNotFoundError();
  const order = await repo.findFirst(orders, eq(orders.id, orderId));
  assertTicketResendable(order);
  const now = deps.now ?? new Date();

  const row: typeof emailOutbox.$inferSelect = {
    id: randomUUID(),
    eventId: order.eventId,
    orderId: order.id,
    type: "TICKET_ISSUED",
    toEmail: order.customerEmail,
    payload: { orderCode: order.orderCode },
    status: "PENDING",
    attempts: 0,
    nextAttemptAt: now,
    providerMessageId: null,
    lastError: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const composed = await composeOutboxEmail(repo.tx, row, { ...deps, now });
  if (!composed.ok) throw new TicketResendNotAllowedError("TICKET_UNAVAILABLE");
  return composed.message;
}
