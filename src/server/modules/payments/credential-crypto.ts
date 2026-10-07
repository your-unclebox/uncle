import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getServerEnv } from "@/config/env";

// Enkripsi kredensial gateway per tenant (DRD Security §1): AES-256-GCM, IV
// 96-bit acak per enkripsi, AAD = event_id|payment_config_id sehingga
// ciphertext tidak bisa dipindah ke tenant lain. Format: iv(12) | tag(16) | data.

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface EncryptionKey {
  readonly id: string;
  readonly key: Buffer;
}

export function decodeKek(base64: string | undefined): Buffer {
  const key = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0);
  if (key.length !== KEY_BYTES) {
    throw new Error("PAYMENT_KEK belum diisi atau bukan 32 byte (base64).");
  }
  return key;
}

/** KEK aktif dari environment (PAYMENT_KEK_ACTIVE_ID → PAYMENT_KEK_V1). */
export function getActivePaymentKek(): EncryptionKey {
  const env = getServerEnv();
  if (env.PAYMENT_KEK_ACTIVE_ID !== "v1") {
    throw new Error(`PAYMENT_KEK ${env.PAYMENT_KEK_ACTIVE_ID} belum didukung.`);
  }
  return { id: "v1", key: decodeKek(env.PAYMENT_KEK_V1) };
}

export const credentialAad = (eventId: string, paymentConfigId: string) =>
  Buffer.from(`${eventId}|${paymentConfigId}`, "utf8");

export function encryptSecret(key: Buffer, plaintext: string, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decryptSecret(key: Buffer, blob: Buffer, aad: Buffer): string {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
