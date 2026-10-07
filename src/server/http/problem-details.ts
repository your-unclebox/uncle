import { logger } from "@/lib/logger";

import { DomainError } from "./domain-error";
import { json } from "./json";

// RFC 9457 Problem Details (DRD API §1, AI-CODING-RULES §7).
const kebab = (code: string) => code.toLowerCase().replace(/_/g, "-");
const RESERVED = new Set(["code", "status", "name", "message", "stack", "cause"]);

export function problemResponse(error: unknown, requestId: string): Response {
  if (error instanceof DomainError) {
    // Properti tambahan error domain (mis. remaining, items) ikut sebagai extension.
    const extensions = Object.fromEntries(
      Object.entries(error).filter(([key]) => !RESERVED.has(key)),
    );
    const headers = new Headers({ "content-type": "application/problem+json" });
    if ("retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number") {
      headers.set("retry-after", String(error.retryAfterSeconds));
    }
    const response = json(
      {
        type: `https://uncle.id/errors/${kebab(error.code)}`,
        code: error.code,
        title: error.message,
        status: error.status,
        ...extensions,
      },
      { status: error.status, headers },
    );
    response.headers.set("content-type", "application/problem+json");
    return response;
  }

  // Error tak dikenal: detail hanya di log, klien menerima pesan generik.
  logger.error("Unhandled error", {
    requestId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  const response = json(
    {
      type: "https://uncle.id/errors/internal",
      code: "INTERNAL_ERROR",
      title: "Terjadi kesalahan. Coba lagi.",
      status: 500,
    },
    { status: 500 },
  );
  response.headers.set("content-type", "application/problem+json");
  return response;
}
