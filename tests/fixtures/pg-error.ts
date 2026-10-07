import { expect } from "vitest";

import { findPgError } from "@/server/db/pg-error";

export const PG = {
  NOT_NULL: "23502",
  FOREIGN_KEY: "23503",
  UNIQUE: "23505",
  CHECK: "23514",
  INSUFFICIENT_PRIVILEGE: "42501",
} as const;

export async function expectPgError(
  promise: Promise<unknown>,
  expected: { code: string; constraint?: string },
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  const pgError = findPgError(error);
  expect(pgError, "query seharusnya ditolak Postgres").toBeDefined();
  expect(pgError?.code).toBe(expected.code);
  if (expected.constraint) expect(pgError?.constraint_name).toBe(expected.constraint);
}
