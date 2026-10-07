import "server-only";

import { and, eq } from "drizzle-orm";

import { formatTimeRange, toInstant, toLocalParts } from "@/lib/event-time";
import { htmlToText, textToHtml } from "@/lib/html";
import type { Database } from "@/server/db/client";
import { events } from "@/server/db/schema";
import { parseInput, ValidationError } from "@/server/http/validation-error";
import { EventNotFoundError } from "@/server/modules/ordering/errors";
import type { TenantScopedRepository } from "@/server/tenancy";

import { VersionConflictError } from "./errors";
import { eventDetailsInputSchema, type EventDetailsInput } from "./schemas";

type EventRow = typeof events.$inferSelect;
type EventPatch = Partial<typeof events.$inferInsert>;

const DEFAULT_TIMEZONE = "Asia/Jakarta";
const emptyToNull = (value: string | undefined) => (value ? value : null);

// Tanggal + Jam Mulai + Jam Selesai (BR-EVT-09). Draft boleh kosong sebagian;
// jadwal hanya tersimpan bila ketiganya terisi.
function scheduleFrom(input: EventDetailsInput, timezone: string) {
  const { date, startTime, endTime } = input;
  if (!date || !startTime || !endTime) return { startsAt: null, endsAt: null };
  const startsAt = toInstant(date, startTime, timezone);
  const endsAt = toInstant(date, endTime, timezone);
  // Q21: event lewat tengah malam belum didukung.
  if (endsAt <= startsAt) {
    throw new ValidationError({ endTime: ["Jam selesai harus setelah jam mulai"] });
  }
  return { startsAt, endsAt };
}

function toPatch(input: ReturnType<typeof parseEventDetails>, timezone: string): EventPatch {
  return {
    name: input.name,
    descriptionHtml: input.description ? textToHtml(input.description) : null,
    category: emptyToNull(input.category),
    eventType: emptyToNull(input.eventType),
    ...scheduleFrom(input, timezone),
    venueName: emptyToNull(input.venueName),
    venueAddress: emptyToNull(input.venueAddress),
    mapsUrl: emptyToNull(input.mapsUrl),
    primaryColor: input.primaryColor ?? null,
    secondaryColor: input.secondaryColor ?? null,
    contactInfo: emptyToNull(input.contactInfo),
    termsHtml: input.terms ? textToHtml(input.terms) : null,
    refundPolicyHtml: input.refundPolicy ? textToHtml(input.refundPolicy) : null,
  };
}

const parseEventDetails = (raw: unknown) => parseInput(eventDetailsInputSchema, raw);

/** OWN-04: event baru selalu Draft (AC-OWN-04.1). */
export async function createDraftEvent(
  db: Database,
  rawInput: unknown,
  options: { createdBy: string },
): Promise<EventRow> {
  const input = parseEventDetails(rawInput);
  const [event] = await db
    .insert(events)
    .values({
      ...toPatch(input, DEFAULT_TIMEZONE),
      name: input.name,
      status: "DRAFT",
      createdBy: options.createdBy,
    })
    .returning();
  if (!event) throw new Error("Gagal membuat event.");
  return event;
}

/**
 * OWN-04/06/11: simpan Info Umum, Branding & Konten. Optimistic locking lewat
 * versi (If-Match). Event non-Draft wajib tetap lengkap (BR-EVT-04).
 */
export async function updateEventDetails(
  repo: TenantScopedRepository,
  rawInput: unknown,
  expectedVersion: number,
): Promise<EventRow> {
  const input = parseEventDetails(rawInput);
  const current = await repo.getEvent();
  if (!current) throw new EventNotFoundError();
  const patch = toPatch(input, current.timezone);
  if (current.status !== "DRAFT" && (!patch.startsAt || !patch.endsAt)) {
    throw new ValidationError({
      date: ["Tanggal, jam mulai & jam selesai wajib untuk event yang sudah dipublish"],
    });
  }

  const [updated] = await repo.tx
    .update(events)
    .set({ ...patch, version: expectedVersion + 1 })
    .where(and(eq(events.id, repo.eventId), eq(events.version, expectedVersion)))
    .returning();
  if (!updated) throw new VersionConflictError(current.version);
  return updated;
}

/** Nilai form edit (kebalikan dari toPatch). */
export function toEventForm(event: EventRow) {
  const start = event.startsAt ? toLocalParts(event.startsAt, event.timezone) : null;
  const end = event.endsAt ? toLocalParts(event.endsAt, event.timezone) : null;
  return {
    id: event.id,
    version: event.version,
    status: event.status,
    slug: event.slug,
    name: event.name,
    description: htmlToText(event.descriptionHtml),
    category: event.category ?? "",
    eventType: event.eventType ?? "",
    date: start?.date ?? "",
    startTime: start?.time ?? "",
    endTime: end?.time ?? "",
    timeRange:
      event.startsAt && event.endsAt
        ? formatTimeRange(event.startsAt, event.endsAt, event.timezone)
        : null,
    venueName: event.venueName ?? "",
    venueAddress: event.venueAddress ?? "",
    mapsUrl: event.mapsUrl ?? "",
    primaryColor: event.primaryColor ?? "",
    secondaryColor: event.secondaryColor ?? "",
    contactInfo: event.contactInfo ?? "",
    terms: htmlToText(event.termsHtml),
    refundPolicy: htmlToText(event.refundPolicyHtml),
  };
}

export type EventForm = ReturnType<typeof toEventForm>;
