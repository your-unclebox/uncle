import { ForbiddenError } from "@/server/modules/identity/errors";

import { ValidationError } from "./validation-error";

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError({ _: ["Body JSON tidak valid"] });
  }
}

export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function userAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

/**
 * CSRF (DRD Security §7): mutasi dashboard wajib datang dari origin yang sama.
 * Cookie SameSite=Lax + cek header Origin.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ForbiddenError();
}

// If-Match: "<version>" (DRD API §4, optimistic locking).
export function readIfMatchVersion(request: Request): number {
  const raw = request.headers.get("if-match")?.replace(/"/g, "").trim();
  const version = raw ? Number(raw) : NaN;
  if (!Number.isInteger(version) || version < 1) {
    throw new ValidationError({ "if-match": ["Header If-Match berisi versi wajib diisi"] });
  }
  return version;
}
