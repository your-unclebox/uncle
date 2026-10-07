import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decodeQrSigningKey } from "./signing-key";
import {
  buildTicketQrPayload,
  parseTicketQrPayload,
  ticketQrFingerprint,
  verifyTicketQrMac,
} from "./ticket-qr";

const key = randomBytes(32);
const claims = { ticketId: randomUUID(), eventId: randomUUID(), qrVersion: 1 };

describe("payload QR Tiket U1 (BR-TKT-01, DRD Security §6)", () => {
  it("format U1.{ticketId}.{qrVersion}.{mac 22 char} tanpa PII", () => {
    const payload = buildTicketQrPayload(key, claims);
    expect(payload).toMatch(/^U1\.[0-9a-f-]{36}\.1\.[A-Za-z0-9_-]{22}$/);
  });

  it("MAC valid untuk event yang benar", () => {
    const parsed = parseTicketQrPayload(buildTicketQrPayload(key, claims));
    expect(parsed).not.toBeNull();
    expect(verifyTicketQrMac(key, parsed!, claims.eventId)).toBe(true);
  });

  it("MAC tidak valid untuk event lain, kunci lain, atau payload diubah", () => {
    const payload = buildTicketQrPayload(key, claims);
    const parsed = parseTicketQrPayload(payload)!;
    expect(verifyTicketQrMac(key, parsed, randomUUID())).toBe(false);
    expect(verifyTicketQrMac(randomBytes(32), parsed, claims.eventId)).toBe(false);
    const tampered = parseTicketQrPayload(payload.replace(".1.", ".2."))!;
    expect(verifyTicketQrMac(key, tampered, claims.eventId)).toBe(false);
  });

  it.each([
    "",
    "U2.x.1.y",
    "00020101021226…", // string QRIS EMVCo (QR pembayaran)
    `U1.bukan-uuid.1.${"a".repeat(22)}`,
    `U1.${randomUUID()}.0.${"a".repeat(22)}`,
    `U1.${randomUUID()}.1.pendek`,
  ])("menolak format tidak dikenal: %s", (payload) => {
    expect(parseTicketQrPayload(payload)).toBeNull();
  });

  it("fingerprint SHA-256 deterministik & berbeda per QR", () => {
    const a = buildTicketQrPayload(key, claims);
    const b = buildTicketQrPayload(key, { ...claims, qrVersion: 2 });
    expect(ticketQrFingerprint(a).equals(ticketQrFingerprint(a))).toBe(true);
    expect(ticketQrFingerprint(a).equals(ticketQrFingerprint(b))).toBe(false);
  });

  it("QR_SIGNING_KEY wajib minimal 32 byte", () => {
    expect(() => decodeQrSigningKey(undefined)).toThrow();
    expect(() => decodeQrSigningKey(randomBytes(16).toString("base64"))).toThrow();
    expect(decodeQrSigningKey(key.toString("base64")).equals(key)).toBe(true);
  });
});
