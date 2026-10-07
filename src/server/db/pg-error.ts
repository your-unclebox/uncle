// Drizzle membungkus error driver; cari error Postgres asli di rantai `cause`.
export interface PgError {
  readonly code: string;
  readonly constraint_name?: string;
}

export function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (
      "code" in current &&
      typeof current.code === "string" &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return current as PgError;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = findPgError(error);
  return pgError?.code === "23505" && pgError.constraint_name === constraint;
}
