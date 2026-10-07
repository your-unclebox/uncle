import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { isUniqueViolation } from "@/server/db/pg-error";
import { orderItems, ticketTypes } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  QuotaBelowAllocatedError,
  TicketTypeInUseError,
  TicketTypeNameTakenError,
  TicketTypeNotFoundError,
} from "./errors";

type TicketTypeRow = typeof ticketTypes.$inferSelect;

// OWN-07, BR-EVT-05: nama, harga > 0 (Rupiah utuh), kuota > 0.
const fields = {
  name: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(60),
  price: z
    .number("Harga wajib diisi")
    .int("Harga harus bilangan bulat")
    .positive("Harga harus lebih dari 0")
    .max(1_000_000_000),
  quota: z
    .number("Kuota wajib diisi")
    .int("Kuota harus bilangan bulat")
    .positive("Kuota harus lebih dari 0")
    .max(1_000_000),
};

export const createTicketTypeInputSchema = z.object(fields).strict();
export const updateTicketTypeInputSchema = z
  .object({ ...fields, isActive: z.boolean() })
  .partial()
  .strict();

const UNIQUE_NAME = "uq_ticket_types_event_id_name";

export function listTicketTypes(repo: TenantScopedRepository): Promise<TicketTypeRow[]> {
  return repo.tx
    .select()
    .from(ticketTypes)
    .where(repo.scope(ticketTypes))
    .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt));
}

export async function createTicketType(
  repo: TenantScopedRepository,
  rawInput: unknown,
): Promise<TicketTypeRow> {
  const input = parseInput(createTicketTypeInputSchema, rawInput);
  const [last] = await repo.tx
    .select({ max: sql<number>`coalesce(max(${ticketTypes.sortOrder}), -1)::int` })
    .from(ticketTypes)
    .where(repo.scope(ticketTypes));
  try {
    return await repo.tx.transaction(async (savepoint) => {
      const [row] = await savepoint
        .insert(ticketTypes)
        .values({
          eventId: repo.eventId,
          name: input.name,
          price: BigInt(input.price),
          quota: input.quota,
          sortOrder: (last?.max ?? -1) + 1,
        })
        .returning();
      if (!row) throw new Error("Gagal membuat jenis tiket.");
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, UNIQUE_NAME)) throw new TicketTypeNameTakenError();
    throw error;
  }
}

/** Perubahan harga hanya berlaku untuk transaksi baru (snapshot di order_items, BR-EVT-07). */
export async function updateTicketType(
  repo: TenantScopedRepository,
  ticketTypeId: string,
  rawInput: unknown,
): Promise<TicketTypeRow> {
  const input = parseInput(updateTicketTypeInputSchema, rawInput);
  const [current] = await repo.tx
    .select()
    .from(ticketTypes)
    .where(repo.scope(ticketTypes, eq(ticketTypes.id, ticketTypeId)))
    .for("update");
  if (!current) throw new TicketTypeNotFoundError();
  if (input.quota !== undefined && input.quota < current.allocatedCount) {
    throw new QuotaBelowAllocatedError(current.allocatedCount);
  }
  try {
    const [row] = await repo.tx.transaction((savepoint) =>
      savepoint
        .update(ticketTypes)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.price !== undefined ? { price: BigInt(input.price) } : {}),
          ...(input.quota !== undefined ? { quota: input.quota } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(repo.scope(ticketTypes, eq(ticketTypes.id, ticketTypeId)))
        .returning(),
    );
    if (!row) throw new TicketTypeNotFoundError();
    return row;
  } catch (error) {
    if (isUniqueViolation(error, UNIQUE_NAME)) throw new TicketTypeNameTakenError();
    throw error;
  }
}

export async function deleteTicketType(
  repo: TenantScopedRepository,
  ticketTypeId: string,
): Promise<void> {
  const [used] = await repo.tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(repo.scope(orderItems, eq(orderItems.ticketTypeId, ticketTypeId)))
    .limit(1);
  if (used) throw new TicketTypeInUseError();
  const deleted = await repo.delete(ticketTypes, eq(ticketTypes.id, ticketTypeId));
  if (deleted === 0) throw new TicketTypeNotFoundError();
}
