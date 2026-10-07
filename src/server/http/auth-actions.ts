import "server-only";

import { getDb } from "@/server/db/client";
import {
  acceptInvitation,
  getInvitationByToken,
  login,
  revokeSession,
} from "@/server/modules/identity";

import { getRateLimiter } from "./rate-limit";
import { clientIp, readJson, userAgent } from "./request";
import { authenticate } from "./route";

// Jembatan route handler → modul identity, supaya src/app tidak mengakses DB langsung.

export async function loginFromRequest(request: Request) {
  return login(getDb(), await readJson(request), {
    ip: clientIp(request),
    userAgent: userAgent(request),
    rateLimiter: getRateLimiter(),
  });
}

export async function logoutFromRequest(request: Request): Promise<void> {
  const auth = await authenticate(request);
  if (auth) await revokeSession(getDb(), auth.sessionId);
}

export function invitationInfo(token: string) {
  return getInvitationByToken(getDb(), token);
}

export async function acceptInvitationFromRequest(request: Request, token: string) {
  return acceptInvitation(getDb(), token, await readJson(request), {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });
}
