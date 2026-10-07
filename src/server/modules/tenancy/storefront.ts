import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { contrastRatio, isHexColor } from "@/lib/color";
import { formatTimeRange } from "@/lib/event-time";
import { htmlToText } from "@/lib/html";
import type { DatabaseExecutor } from "@/server/db/client";
import { events } from "@/server/db/schema";
import { computeCashExpiresAt } from "@/server/modules/ordering/cash-reservation";

type EventRow = typeof events.$inferSelect;

/**
 * Event yang boleh tampil publik (DRD Architecture §4 langkah 4): slug cocok
 * dan status ACTIVE/FINISHED. Draft & arsip → null ("Event tidak ditemukan").
 * Tabel `events` adalah registry tenant (tanpa RLS), jadi lookup slug aman
 * dilakukan sebelum tenant context ada.
 */
export async function findPublicEventBySlug(
  db: DatabaseExecutor,
  slug: string,
): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), inArray(events.status, ["ACTIVE", "FINISHED"])))
    .limit(1);
  return row ?? null;
}

export type SalesState = "open" | "closed";

export interface StorefrontAvailability {
  readonly salesState: SalesState;
  readonly paymentMethods: { readonly cash: boolean; readonly qris: boolean };
}

/**
 * Penjualan dibuka bila event ACTIVE, sales_open, belum lewat jam selesai,
 * dan minimal satu metode bayar bisa dipakai saat ini (BR-EVT-03, BR-EVT-08,
 * BR-PAY-09). Cash ditutup setelah batas reservasinya lewat; QRIS hanya bila
 * kredensial client berstatus CONNECTED.
 */
export function storefrontAvailability(
  event: EventRow,
  now: Date,
  qrisConnected = false,
): StorefrontAvailability {
  const live =
    event.status === "ACTIVE" &&
    event.salesOpen &&
    event.startsAt !== null &&
    event.endsAt !== null &&
    event.endsAt > now;
  const cash = live && event.cashEnabled && computeCashExpiresAt(event) > now;
  const qris = live && qrisConnected;
  return { salesState: cash || qris ? "open" : "closed", paymentMethods: { cash, qris } };
}

const WHITE = "#FFFFFF";
const DARK_TEXT = "#111827";

// UI-UX §2.1: teks di atas Primary putih, kecuali kontrasnya < 4.5:1 → gelap.
export function onPrimaryColor(primary: string): string {
  return contrastRatio(WHITE, primary) >= 4.5 ? WHITE : DARK_TEXT;
}

/** Data landing page yang aman dikirim ke browser (tanpa id internal & PII). */
export function toPublicEvent(
  event: EventRow,
  now: Date,
  options: { qrisConnected?: boolean } = {},
) {
  const primary = event.primaryColor && isHexColor(event.primaryColor) ? event.primaryColor : null;
  return {
    slug: event.slug ?? "",
    name: event.name,
    // Teks polos: deskripsi disimpan sebagai HTML hasil escape (textToHtml);
    // landing merender teks, bukan HTML mentah (DRD Security §5, anti-XSS).
    description: htmlToText(event.descriptionHtml),
    category: event.category,
    eventType: event.eventType,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    timeRange:
      event.startsAt && event.endsAt
        ? formatTimeRange(event.startsAt, event.endsAt, event.timezone)
        : null,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    mapsUrl: event.mapsUrl,
    primaryColor: primary,
    onPrimaryColor: primary ? onPrimaryColor(primary) : null,
    secondaryColor:
      event.secondaryColor && isHexColor(event.secondaryColor) ? event.secondaryColor : null,
    contactInfo: event.contactInfo,
    terms: htmlToText(event.termsHtml),
    refundPolicy: htmlToText(event.refundPolicyHtml),
    maxTicketsPerOrder: event.maxTicketsPerOrder,
    finished: event.status === "FINISHED" || (event.endsAt !== null && event.endsAt <= now),
    ...storefrontAvailability(event, now, options.qrisConnected ?? false),
  };
}

export type PublicEvent = ReturnType<typeof toPublicEvent>;
