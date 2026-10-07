import { randomBytes } from "node:crypto";

import { afterAll, inject } from "vitest";

import { createDatabase, type Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

// Koneksi superuser container (bypass RLS) untuk menyiapkan data uji.
export function useTestDatabase(): Database {
  const handle = createDatabase(inject("databaseUrl"), { max: 30 });
  afterAll(() => handle.close());
  return handle.db;
}

const randomHex = (bytes: number) => randomBytes(bytes).toString("hex");

export async function createEvent(
  db: Database,
  overrides: Partial<typeof schema.events.$inferInsert> = {},
) {
  const startsAt = new Date("2026-12-20T19:00:00+07:00");
  const [event] = await db
    .insert(schema.events)
    .values({
      slug: `evt-${randomHex(5)}`,
      name: "Event Uji",
      status: "ACTIVE",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  if (!event) throw new Error("createEvent gagal");
  return event;
}

export async function createTicketType(
  db: Database,
  eventId: string,
  overrides: Partial<typeof schema.ticketTypes.$inferInsert> = {},
) {
  const [ticketType] = await db
    .insert(schema.ticketTypes)
    .values({ eventId, name: `Jenis ${randomHex(3)}`, price: 75_000n, quota: 10, ...overrides })
    .returning();
  if (!ticketType) throw new Error("createTicketType gagal");
  return ticketType;
}

export async function createOrder(
  db: Database,
  eventId: string,
  overrides: Partial<typeof schema.orders.$inferInsert> = {},
) {
  const [order] = await db
    .insert(schema.orders)
    .values({
      eventId,
      orderCode: `UNC-${randomHex(4).toUpperCase()}`,
      customerName: "Siti R.",
      customerPhone: "+6281311221122",
      customerEmail: "siti@example.com",
      paymentMethod: "CASH",
      status: "RESERVED",
      totalAmount: 150_000n,
      expiresAt: new Date("2026-12-20T22:00:00+07:00"),
      ...overrides,
    })
    .returning();
  if (!order) throw new Error("createOrder gagal");
  return order;
}

export async function createTicket(
  db: Database,
  eventId: string,
  orderId: string,
  overrides: Partial<typeof schema.tickets.$inferInsert> = {},
) {
  const [ticket] = await db
    .insert(schema.tickets)
    .values({ eventId, orderId, qrFingerprint: randomBytes(32), ...overrides })
    .returning();
  if (!ticket) throw new Error("createTicket gagal");
  return ticket;
}
