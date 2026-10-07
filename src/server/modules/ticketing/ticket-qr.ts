import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// QR Tiket (DRD Security §6): `U1.{ticketId}.{qrVersion}.{mac}` dengan
// mac = base64url(HMAC-SHA256(key, "U1|ticketId|eventId|qrVersion"))[0..22] (≥128 bit).
// Payload tidak memuat PII dan berbeda dari QR pembayaran (BR-TKT-01).
const PREFIX = "U1";
const MAC_LENGTH = 22;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface TicketQrClaims {
  readonly ticketId: string;
  readonly eventId: string;
  readonly qrVersion: number;
}

export interface ParsedTicketQr {
  readonly ticketId: string;
  readonly qrVersion: number;
  readonly mac: string;
}

function computeMac(key: Buffer, claims: TicketQrClaims): string {
  return createHmac("sha256", key)
    .update(`${PREFIX}|${claims.ticketId}|${claims.eventId}|${claims.qrVersion}`)
    .digest("base64url")
    .slice(0, MAC_LENGTH);
}

export function buildTicketQrPayload(key: Buffer, claims: TicketQrClaims): string {
  return `${PREFIX}.${claims.ticketId}.${claims.qrVersion}.${computeMac(key, claims)}`;
}

// Format saja; validitas MAC dicek setelah tiket (dan event_id-nya) ditemukan.
export function parseTicketQrPayload(payload: string): ParsedTicketQr | null {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, ticketId = "", version = "", mac = ""] = parts;
  if (!UUID.test(ticketId) || !/^[1-9]\d{0,4}$/.test(version) || mac.length !== MAC_LENGTH) {
    return null;
  }
  return { ticketId, qrVersion: Number(version), mac };
}

export function verifyTicketQrMac(key: Buffer, parsed: ParsedTicketQr, eventId: string): boolean {
  const expected = Buffer.from(computeMac(key, { ...parsed, eventId }));
  const actual = Buffer.from(parsed.mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// tickets.qr_fingerprint: SHA-256 payload aktif (QR Tiket unik & lookup cepat).
export function ticketQrFingerprint(payload: string): Buffer {
  return createHash("sha256").update(payload).digest();
}
