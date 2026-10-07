import "server-only";

import type { TenantContext } from "@/server/tenancy";

import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./sessions";

export function requireAuth(auth: AuthContext | null): AuthContext {
  if (!auth) throw new UnauthenticatedError();
  return auth;
}

// AC-OWN-01.3: area Owner hanya untuk role OWNER.
export function requireOwner(auth: AuthContext | null): AuthContext {
  const session = requireAuth(auth);
  if (!session.isOwner) throw new ForbiddenError();
  return session;
}

/**
 * Admin event (DRD Auth §3 langkah 2). Tidak punya membership → dianggap
 * resource tidak ada (404 di lapisan HTTP), bukan 403, agar tidak membocorkan
 * keberadaan event lain (AI-CODING-RULES I-2).
 */
export function requireEventAdmin(
  auth: AuthContext | null,
  eventId: string,
): { auth: AuthContext; tenant: TenantContext } | null {
  const session = requireAuth(auth);
  if (!session.adminEventIds.includes(eventId)) return null;
  return { auth: session, tenant: { eventId, actorUserId: session.user.id } };
}
