import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { DatabaseExecutor } from "@/server/db/client";
import { findPgError } from "@/server/db/pg-error";
import { events, orders, reservedSlugs } from "@/server/db/schema";
import { parseInput, ValidationError } from "@/server/http/validation-error";
import type { TenantScopedRepository } from "@/server/tenancy";

import { SlugLockedError, SlugTakenError } from "./errors";
import { slugInputSchema } from "./schemas";

// Sama dengan CHECK ck_events_slug_format (BR-EVT-02): 3–30, a–z 0–9 "-".
const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export type SlugAvailability =
  { available: true } | { available: false; reason: "INVALID_FORMAT" | "RESERVED" | "TAKEN" };

export const SLUG_FORMAT_MESSAGE = 'Hanya huruf kecil, angka, dan "-" (3–30 karakter)';

export async function checkSlugAvailability(
  db: DatabaseExecutor,
  slug: string,
  options: { exceptEventId?: string } = {},
): Promise<SlugAvailability> {
  if (!SLUG_FORMAT.test(slug)) return { available: false, reason: "INVALID_FORMAT" };
  const [reserved] = await db.select().from(reservedSlugs).where(eq(reservedSlugs.slug, slug));
  if (reserved) return { available: false, reason: "RESERVED" };
  const [taken] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      options.exceptEventId
        ? and(eq(events.slug, slug), ne(events.id, options.exceptEventId))
        : eq(events.slug, slug),
    );
  return taken ? { available: false, reason: "TAKEN" } : { available: true };
}

/** OWN-08: set slug event. Ditolak bila sudah ada transaksi (BR-EVT-06). */
export async function setEventSlug(
  repo: TenantScopedRepository,
  rawInput: unknown,
): Promise<string> {
  const { slug } = parseInput(slugInputSchema, rawInput);
  const availability = await checkSlugAvailability(repo.tx, slug, { exceptEventId: repo.eventId });
  if (!availability.available) {
    if (availability.reason === "TAKEN") throw new SlugTakenError();
    throw new ValidationError({
      slug: [
        availability.reason === "RESERVED"
          ? "Subdomain ini dicadangkan sistem"
          : SLUG_FORMAT_MESSAGE,
      ],
    });
  }
  const [order] = await repo.tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.eventId, repo.eventId))
    .limit(1);
  if (order) throw new SlugLockedError();

  try {
    await repo.tx.update(events).set({ slug }).where(eq(events.id, repo.eventId));
  } catch (error) {
    const pgError = findPgError(error);
    if (pgError?.constraint_name === "events_slug_unique") throw new SlugTakenError();
    if (pgError?.constraint_name === "ck_events_slug_locked") throw new SlugLockedError();
    throw error;
  }
  return slug;
}
