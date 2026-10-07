import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { credentialAad, decodeKek, decryptSecret, encryptSecret } from "./credential-crypto";

describe("credential-crypto (DRD Security §1)", () => {
  const key = randomBytes(32);
  const aad = credentialAad("event-a", "config-a");

  it("enkripsi bolak-balik; IV acak sehingga ciphertext selalu berbeda", () => {
    const first = encryptSecret(key, "DEV-api-key", aad);
    const second = encryptSecret(key, "DEV-api-key", aad);
    expect(first.equals(second)).toBe(false);
    expect(first.toString("utf8")).not.toContain("DEV-api-key");
    expect(decryptSecret(key, first, aad)).toBe("DEV-api-key");
  });

  it("ciphertext tidak bisa dipindah ke tenant lain atau didekripsi kunci lain", () => {
    const blob = encryptSecret(key, "rahasia", aad);
    expect(() => decryptSecret(key, blob, credentialAad("event-b", "config-a"))).toThrow();
    expect(() => decryptSecret(randomBytes(32), blob, aad)).toThrow();
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptSecret(key, tampered, aad)).toThrow();
  });

  it("KEK wajib 32 byte", () => {
    expect(decodeKek(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => decodeKek(undefined)).toThrow();
    expect(() => decodeKek(randomBytes(16).toString("base64"))).toThrow();
  });
});
