import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, orders, tickets } from "@/server/db/schema";
import { findUserNames } from "@/server/modules/identity/user-names";
import { ActorRequiredError } from "@/server/modules/ordering/errors";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  AlreadyCheckedInError,
  OrderNotPaidError,
  TicketNotFoundError,
  TicketVoidError,
} from "./errors";

const uuid = z.uuid();

/**
 * "Tandai Tiket Diambil" (SCN-03, BR-TKT-04/05, DRD Security §6). UPDATE
 * bersyarat `status = 'ISSUED'` + order PAID dalam satu statement, sehingga
 * dua HP yang menekan bersamaan hanya menghasilkan satu check-in (AC-SCN-07.1).
 */
export async function checkInTicket(
  repo: TenantScopedRepository,
  ticketId: string,
  deps: { now?: Date } = {},
): Promise<typeof tickets.$inferSelect> {
  const actorUserId = repo.context.actorUserId;
  if (!actorUserId) throw new ActorRequiredError();
  if (!uuid.safeParse(ticketId).success) throw new TicketNotFoundError();
  const now = deps.now ?? new Date();

  const [checkedIn] = await repo.tx
    .update(tickets)
    .set({ status: "CHECKED_IN", checkedInAt: now, checkedInBy: actorUserId })
    .where(
      repo.scope(
        tickets,
        eq(tickets.id, ticketId),
        eq(tickets.status, "ISSUED"),
        sql`exists (select 1 from ${orders} where ${and(
          eq(orders.eventId, tickets.eventId),
          eq(orders.id, tickets.orderId),
          eq(orders.status, "PAID"),
        )})`,
      ),
    )
    .returning();

  if (!checkedIn) {
    const ticket = await repo.findFirst(tickets, eq(tickets.id, ticketId));
    if (!ticket) throw new TicketNotFoundError();
    if (ticket.status === "CHECKED_IN") {
      const names = await findUserNames(repo.tx, [ticket.checkedInBy]);
      throw new AlreadyCheckedInError(
        ticket.checkedInAt,
        ticket.checkedInBy ? (names.get(ticket.checkedInBy) ?? null) : null,
      );
    }
    if (ticket.status === "VOID") throw new TicketVoidError();
    throw new OrderNotPaidError();
  }

  await repo.insert(auditLogs, {
    actorUserId,
    action: "TICKET_CHECKED_IN",
    entityType: "ticket",
    entityId: checkedIn.id,
    before: { status: "ISSUED" },
    after: { status: checkedIn.status, orderId: checkedIn.orderId },
  });
  return checkedIn;
}
