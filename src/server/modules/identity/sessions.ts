import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { generateToken, sha256 } from "@/lib/crypto/tokens";
import type { Database } from "@/server/db/client";
import { memberships, roles, sessions, users } from "@/server/db/schema";

// DRD Auth §1: session 7 hari sliding; idle timeout 12 jam untuk Admin.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
// Perpanjangan sliding paling sering tiap 5 menit agar tidak menulis DB per request.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface AuthContext {
  readonly sessionId: string;
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
  readonly isOwner: boolean;
  // Event yang boleh diakses sebagai EVENT_ADMIN (membership aktif).
  readonly adminEventIds: readonly string[];
}

export async function createSession(
  db: Database,
  params: { userId: string; ip?: string | null; userAgent?: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = params.now ?? new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId: params.userId,
    tokenHash: sha256(token),
    expiresAt,
    lastSeenAt: now,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
  return { token, expiresAt };
}

async function loadRoles(db: Database, userId: string) {
  const rows = await db
    .select({ code: roles.code, eventId: memberships.eventId })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.revokedAt)));
  return {
    isOwner: rows.some((row) => row.code === "OWNER"),
    adminEventIds: rows
      .filter((row) => row.code === "EVENT_ADMIN" && row.eventId)
      .map((row) => row.eventId as string),
  };
}

/** Validasi token cookie → AuthContext, atau null bila tidak sah/kedaluwarsa. */
export async function resolveSession(
  db: Database,
  token: string | undefined,
  now = new Date(),
): Promise<AuthContext | null> {
  if (!token) return null;
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.user.status !== "ACTIVE") return null;

  const access = await loadRoles(db, row.user.id);
  const lastSeen = row.session.lastSeenAt ?? row.session.createdAt;
  if (!access.isOwner && now.getTime() - lastSeen.getTime() > ADMIN_IDLE_TIMEOUT_MS) {
    await revokeSession(db, row.session.id, now);
    return null;
  }
  if (now.getTime() - lastSeen.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.session.id));
  }

  return {
    sessionId: row.session.id,
    user: { id: row.user.id, name: row.user.name, email: row.user.email },
    ...access,
  };
}

export async function revokeSession(db: Database, sessionId: string, now = new Date()) {
  await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
}

// "Logout semua perangkat" (DRD Auth §1) — penting bila HP scanner hilang.
export async function revokeAllSessions(db: Database, userId: string, now = new Date()) {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
