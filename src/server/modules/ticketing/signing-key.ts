import "server-only";

import { getServerEnv } from "@/config/env";

const MIN_KEY_BYTES = 32;

// QR_SIGNING_KEY: base64, minimal 32 byte (.env.example). Tidak pernah di-log.
export function decodeQrSigningKey(base64: string | undefined): Buffer {
  const key = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0);
  if (key.length < MIN_KEY_BYTES) {
    throw new Error("QR_SIGNING_KEY belum diisi atau kurang dari 32 byte.");
  }
  return key;
}

export function getQrSigningKey(): Buffer {
  return decodeQrSigningKey(getServerEnv().QR_SIGNING_KEY);
}
