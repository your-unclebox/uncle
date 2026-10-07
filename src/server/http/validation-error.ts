import type { z } from "zod";

import { DomainError } from "./domain-error";

// 400 VALIDATION_ERROR dengan pesan per field (DRD API §1, RFC 9457 `errors`).
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly status = 400;

  constructor(
    readonly errors: Readonly<Record<string, readonly string[]>>,
    message = "Data tidak valid",
  ) {
    super(message);
  }
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (errors[key] ??= []).push(issue.message);
  }
  throw new ValidationError(errors);
}
