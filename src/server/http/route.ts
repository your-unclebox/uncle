import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/server/db/client";
import {
  requireEventAdmin,
  requireOwner,
  resolveSession,
  type AuthContext,
} from "@/server/modules/identity";
import { EventNotFoundError } from "@/server/modules/ordering/errors";
import { withTenant, type TenantContext, type TenantScopedRepository } from "@/server/tenancy";

import { problemResponse } from "./problem-details";
import { assertSameOrigin } from "./request";
import { readCookie, SESSION_COOKIE } from "./session-cookie";

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Pembungkus route handler: error → RFC 9457, satu tempat (AI-CODING-RULES §7). */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    try {
      return await handler(request, context);
    } catch (error) {
      return problemResponse(error, requestId);
    }
  };
}

export function authenticate(request: Request): Promise<AuthContext | null> {
  return resolveSession(getDb(), readCookie(request, SESSION_COOKIE));
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Area Owner: login + role OWNER; mutasi wajib same-origin. */
export async function authenticateOwner(request: Request): Promise<AuthContext> {
  if (MUTATING.has(request.method)) assertSameOrigin(request);
  return requireOwner(await authenticate(request));
}

const uuid = z.uuid();

/**
 * Owner bekerja pada satu event lewat TenantScopedRepository + RLS
 * (eventId dari path, AI-CODING-RULES I-1). Event tidak ada → 404.
 */
export async function withOwnerEvent<T>(
  request: Request,
  eventId: string,
  work: (repo: TenantScopedRepository, auth: AuthContext) => Promise<T>,
): Promise<T> {
  const auth = await authenticateOwner(request);
  if (!uuid.safeParse(eventId).success) throw new EventNotFoundError();
  return withTenant(getDb(), { eventId, actorUserId: auth.user.id }, async (repo) => {
    if (!(await repo.getEvent())) throw new EventNotFoundError();
    return work(repo, auth);
  });
}

/**
 * Area Admin event (DRD API §5): login + membership ke eventId; mutasi wajib
 * same-origin. Bukan anggota event → 404 (bukan 403), tidak membocorkan event lain.
 */
export async function authenticateEventAdmin(
  request: Request,
  eventId: string,
): Promise<{ auth: AuthContext; tenant: TenantContext }> {
  if (MUTATING.has(request.method)) assertSameOrigin(request);
  if (!uuid.safeParse(eventId).success) throw new EventNotFoundError();
  const access = requireEventAdmin(await authenticate(request), eventId);
  if (!access) throw new EventNotFoundError();
  return access;
}
