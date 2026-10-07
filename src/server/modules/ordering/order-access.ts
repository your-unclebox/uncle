import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { sha256 } from "@/lib/crypto/tokens";

// Akses order oleh customer tanpa akun (DRD Authentication §4):
// 1. token acak saat order dibuat — hanya hash-nya di orders.access_token_hash;
// 2. token Cek Pesanan — ditandatangani HMAC (tanpa disimpan), sehingga token
//    lama (mis. link email) tetap berlaku walau customer memakai Cek Pesanan.

const KEY_LABEL = "uncle-order-access-v1";
const LOOKUP_TOKEN = /^(\d{10})\.([A-Za-z0-9_-]{43})$/;
const LOOKUP_TTL_MS = 24 * 60 * 60 * 1000;

interface OrderRef {
  readonly id: string;
  readonly eventId: string;
  readonly accessTokenHash: Buffer | null;
}

// Kunci turunan (domain separation) dari QR_SIGNING_KEY.
function accessKey(signingKey: Buffer): Buffer {
  return createHmac("sha256", signingKey).update(KEY_LABEL).digest();
}

function lookupMac(signingKey: Buffer, order: OrderRef, expiresAtSeconds: string): Buffer {
  return createHmac("sha256", accessKey(signingKey))
    .update(`${order.eventId}|${order.id}|${expiresAtSeconds}`)
    .digest();
}

/** Token Cek Pesanan, berlaku sampai 24 jam setelah event selesai (min. 24 jam dari sekarang). */
export function signLookupToken(
  signingKey: Buffer,
  order: OrderRef,
  options: { eventEndsAt: Date | null; now: Date },
): string {
  const base = Math.max(options.eventEndsAt?.getTime() ?? 0, options.now.getTime());
  const expiresAtSeconds = String(Math.floor((base + LOOKUP_TTL_MS) / 1000)).padStart(10, "0");
  const mac = lookupMac(signingKey, order, expiresAtSeconds).toString("base64url");
  return `${expiresAtSeconds}.${mac}`;
}

export function verifyOrderAccessToken(
  signingKey: Buffer,
  order: OrderRef,
  token: string | null | undefined,
  now: Date,
): boolean {
  if (!token) return false;
  const lookup = LOOKUP_TOKEN.exec(token);
  if (lookup) {
    const [, expiresAtSeconds = "", mac = ""] = lookup;
    if (Number(expiresAtSeconds) * 1000 <= now.getTime()) return false;
    const expected = lookupMac(signingKey, order, expiresAtSeconds);
    const given = Buffer.from(mac, "base64url");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
  if (!order.accessTokenHash) return false;
  const given = sha256(token);
  return (
    given.length === order.accessTokenHash.length && timingSafeEqual(given, order.accessTokenHash)
  );
}
