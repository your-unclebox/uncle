import "server-only";

import { hash, verify } from "@node-rs/argon2";

// DRD Auth §1: Argon2id, minimal 10 karakter.
export const MIN_PASSWORD_LENGTH = 10;

// Algorithm.Argon2id = 2; parameter default library (m=19456, t=2, p=1).
const ARGON2ID = 2;

export function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: ARGON2ID });
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// Hash dummy supaya waktu respons login untuk email yang tidak terdaftar setara
// dengan email terdaftar (tidak membocorkan keberadaan akun).
let dummyHash: Promise<string> | undefined;
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummyHash ??= hashPassword("uncle-dummy-password-for-timing");
  return dummyHash.then((value) => verify(value, password));
}
