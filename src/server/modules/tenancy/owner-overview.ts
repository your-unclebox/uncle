import "server-only";

import { and, desc, eq, gte, ilike, inArray, or, sql, sum } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { eventStatus, events, orderItems, orders, ticketTypes } from "@/server/db/schema";

type EventStatus = (typeof eventStatus.enumValues)[number];

/**
 * Data lintas tenant untuk Owner (OWN-02/03). Hanya agregat & metadata event,
 * tanpa data pembeli, sehingga tidak dicatat sebagai OWNER_VIEWED_TENANT.
 */

// BR-RPT-02 (asumsi): terjual = tiket di order PAID + RESERVED yang belum lewat batas.
const soldOrderFilter = (now: Date) =>
  or(eq(orders.status, "PAID"), and(eq(orders.status, "RESERVED"), gte(orders.expiresAt, now)));

export async function getOwnerSummary(db: Database, now = new Date()) {
  const [eventCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${events.status} = 'ACTIVE')::int`,
    })
    .from(events);
  const [sold] = await db
    .select({ quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.eventId, orderItems.eventId), eq(orders.id, orderItems.orderId)),
    )
    .where(soldOrderFilter(now));
  // BR-RPT-01 (asumsi): revenue bruto transaksi Lunas.
  const [revenue] = await db
    .select({ amount: sum(orders.totalAmount) })
    .from(orders)
    .where(eq(orders.status, "PAID"));
  return {
    totalEvents: eventCounts?.total ?? 0,
    activeEvents: eventCounts?.active ?? 0,
    ticketsSold: sold?.quantity ?? 0,
    revenue: BigInt(revenue?.amount ?? 0),
  };
}

export interface OwnerEventRow {
  readonly id: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly slug: string | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly timezone: string;
  readonly sold: number;
  readonly totalQuota: number;
}

export async function listOwnerEvents(
  db: Database,
  filters: { q?: string; status?: EventStatus } = {},
  now = new Date(),
): Promise<OwnerEventRow[]> {
  const conditions = [
    filters.status ? eq(events.status, filters.status) : undefined,
    filters.q ? ilike(events.name, `%${filters.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
  ];
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      status: events.status,
      slug: events.slug,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      timezone: events.timezone,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const quotas = await db
    .select({ eventId: ticketTypes.eventId, total: sql<number>`sum(${ticketTypes.quota})::int` })
    .from(ticketTypes)
    .where(inArray(ticketTypes.eventId, ids))
    .groupBy(ticketTypes.eventId);
  const sold = await db
    .select({ eventId: orderItems.eventId, total: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.eventId, orderItems.eventId), eq(orders.id, orderItems.orderId)),
    )
    .where(and(inArray(orderItems.eventId, ids), soldOrderFilter(now)))
    .groupBy(orderItems.eventId);
  const quotaBy = new Map(quotas.map((row) => [row.eventId, row.total]));
  const soldBy = new Map(sold.map((row) => [row.eventId, row.total]));

  return rows.map((row) => ({
    ...row,
    sold: soldBy.get(row.id) ?? 0,
    totalQuota: quotaBy.get(row.id) ?? 0,
  }));
}
