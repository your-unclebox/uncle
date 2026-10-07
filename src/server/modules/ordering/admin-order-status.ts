import { z } from "zod";

import { ValidationError } from "@/server/http/validation-error";

import { EXPIRABLE_STATUSES, type OrderStatus } from "./order-state-machine";

// Logika murni Daftar/Detail Transaksi admin (ADM-04..06), tanpa I/O.

type TicketStatus = "ISSUED" | "CHECKED_IN" | "VOID";
export type PickupStatus = "DONE" | "PENDING";

const isExpirable = (status: OrderStatus): boolean =>
  (EXPIRABLE_STATUSES as readonly OrderStatus[]).includes(status);

/**
 * Status yang ditampilkan ke admin. Hold yang sudah lewat expires_at tapi
 * belum disapu cron sudah tidak berlaku (DRD §Database 5.1) → Kedaluwarsa.
 */
export function effectiveOrderStatus(
  order: { readonly status: OrderStatus; readonly expiresAt: Date | null },
  now: Date,
): OrderStatus {
  if (isExpirable(order.status) && order.expiresAt !== null && order.expiresAt < now) {
    return "EXPIRED";
  }
  return order.status;
}

/** Status ambil: hanya bermakna untuk QR Tiket yang masih berlaku (DRD §4.2). */
export function pickupStatus(
  ticketStatus: TicketStatus | null,
  effectiveStatus: OrderStatus,
): PickupStatus | null {
  if (ticketStatus === "CHECKED_IN") return "DONE";
  if (ticketStatus === "ISSUED" && (effectiveStatus === "PAID" || effectiveStatus === "RESERVED")) {
    return "PENDING";
  }
  return null;
}

/**
 * Cari no HP (AC-ADM-05.2): ambil digit, awalan 0 → 62 agar cocok dengan
 * format E.164 tersimpan. Minimal 3 digit supaya tidak mencocokkan semua baris.
 */
export function phoneSearchDigits(query: string): string | null {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 3 || digits.length !== query.replace(/[\s\-+()]/g, "").length) return null;
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

// Cursor paginasi (DRD API §1): posisi (created_at, id) baris terakhir.
// created_at disimpan sebagai teks ISO UTC presisi mikrodetik dari Postgres,
// bukan Date JS (milidetik), supaya baris dengan milidetik sama tidak terlewat.
const cursorSchema = z.tuple([
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  z.uuid(),
]);

export interface OrderCursor {
  readonly createdAt: string;
  readonly id: string;
}

export function encodeOrderCursor(cursor: OrderCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");
}

export function decodeOrderCursor(raw: string): OrderCursor {
  try {
    const [createdAt, id] = cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return { createdAt, id };
  } catch {
    throw new ValidationError({ cursor: ["Cursor tidak valid"] });
  }
}
