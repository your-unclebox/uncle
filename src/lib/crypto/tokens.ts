import "server-only";

import { createHash, randomBytes } from "node:crypto";

// Token acak base64url (default 32 byte), mis. order access token (DRD Auth §4).
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// Hanya hash yang disimpan di DB; token mentah tidak pernah disimpan atau di-log.
export function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
