import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { generateToken, sha256 } from "@/lib/crypto/tokens";
import type { Database } from "@/server/db/client";
import { emailOutbox, events, invitations, memberships, roles, users } from "@/server/db/schema";
import { parseInput } from "@/server/http/validation-error";
import type { TenantScopedRepository } from "@/server/tenancy";

import {
  AlreadyMemberError,
  InvitationExistsError,
  InvitationExpiredError,
  InvitationInvalidError,
} from "./errors";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";
import { createSession } from "./sessions";

// BR-ACC-05: undangan berlaku 7 hari.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const inviteAdminInputSchema = z
  .object({
    email: z
      .string("Wajib diisi")
      .trim()
      .min(1, "Wajib diisi")
      .pipe(z.email("Format email tidak valid")),
    name: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(100),
  })
  .strict();

export const acceptInvitationInputSchema = z
  .object({
    name: z.string().trim().min(1, "Wajib diisi").max(100),
    password: z
      .string("Wajib diisi")
      .min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`)
      .max(200),
  })
  .strict();

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function invitationStatus(
  invitation: Pick<typeof invitations.$inferSelect, "acceptedAt" | "revokedAt" | "expiresAt">,
  now = new Date(),
): InvitationStatus {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  return invitation.expiresAt <= now ? "EXPIRED" : "PENDING";
}

async function eventAdminRoleId(repo: TenantScopedRepository): Promise<number> {
  const [role] = await repo.tx
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, "EVENT_ADMIN"));
  if (!role) throw new Error("Role EVENT_ADMIN belum ada (migrasi 0002).");
  return role.id;
}

/**
 * OWN-10: Owner mengundang admin untuk satu event. Token mentah dikembalikan
 * sekali (link undangan); DB hanya menyimpan hash-nya.
 */
export async function inviteAdmin(
  repo: TenantScopedRepository,
  rawInput: unknown,
  options: { invitedBy: string; now?: Date },
): Promise<{ invitation: typeof invitations.$inferSelect; token: string }> {
  const input = parseInput(inviteAdminInputSchema, rawInput);
  const now = options.now ?? new Date();
  const email = input.email.toLowerCase();
  const roleId = await eventAdminRoleId(repo);

  const [member] = await repo.tx
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.eventId, repo.eventId),
        eq(memberships.roleId, roleId),
        isNull(memberships.revokedAt),
        eq(users.email, email),
      ),
    );
  if (member) throw new AlreadyMemberError();

  const active = await repo.findFirst(
    invitations,
    and(
      eq(invitations.email, email),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
    ),
  );
  if (active) {
    // Undangan kedaluwarsa yang belum dicabut tidak menghalangi undangan baru.
    if (invitationStatus(active, now) === "PENDING") throw new InvitationExistsError(active.id);
    await repo.update(invitations, { revokedAt: now }, eq(invitations.id, active.id));
  }

  const token = generateToken();
  const invitation = await repo.insert(invitations, {
    email,
    name: input.name,
    roleId,
    tokenHash: sha256(token),
    invitedBy: options.invitedBy,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
  });
  await enqueueInviteEmail(repo, invitation);
  return { invitation, token };
}

/** Kirim ulang: token baru (token lama tidak berlaku) & masa berlaku diperpanjang. */
export async function resendInvitation(
  repo: TenantScopedRepository,
  invitationId: string,
  now = new Date(),
): Promise<{ invitation: typeof invitations.$inferSelect; token: string }> {
  const current = await repo.findFirst(invitations, eq(invitations.id, invitationId));
  if (!current || current.acceptedAt || current.revokedAt) throw new InvitationInvalidError();
  const token = generateToken();
  const [invitation] = await repo.update(
    invitations,
    { tokenHash: sha256(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) },
    eq(invitations.id, invitationId),
  );
  if (!invitation) throw new InvitationInvalidError();
  await enqueueInviteEmail(repo, invitation);
  return { invitation, token };
}

export async function revokeInvitation(
  repo: TenantScopedRepository,
  invitationId: string,
  now = new Date(),
): Promise<void> {
  const [updated] = await repo.update(
    invitations,
    { revokedAt: now },
    eq(invitations.id, invitationId),
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
  );
  if (!updated) throw new InvitationInvalidError();
}

/** Cabut akses admin (DRD API §4 DELETE members). */
export async function revokeMembership(
  repo: TenantScopedRepository,
  membershipId: string,
  now = new Date(),
): Promise<void> {
  const [updated] = await repo.tx
    .update(memberships)
    .set({ revokedAt: now })
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.eventId, repo.eventId),
        isNull(memberships.revokedAt),
      ),
    )
    .returning({ id: memberships.id });
  if (!updated) throw new InvitationInvalidError();
}

export interface AdminAccessRow {
  readonly kind: "MEMBER" | "INVITATION";
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: "ACTIVE" | InvitationStatus;
}

// UI-UX Tab Akses Admin: Aktif / Diundang / Kedaluwarsa.
export async function listAdminAccess(
  repo: TenantScopedRepository,
  now = new Date(),
): Promise<AdminAccessRow[]> {
  const members = await repo.tx
    .select({ id: memberships.id, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.eventId, repo.eventId), isNull(memberships.revokedAt)));
  const pending = await repo.findMany(
    invitations,
    and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)),
  );
  return [
    ...members.map((m) => ({ kind: "MEMBER" as const, ...m, status: "ACTIVE" as const })),
    ...pending.map((i) => ({
      kind: "INVITATION" as const,
      id: i.id,
      email: i.email,
      name: i.name,
      status: invitationStatus(i, now),
    })),
  ];
}

// Email undangan dikirim di fase notifikasi; isi link/token belum diputuskan.
async function enqueueInviteEmail(
  repo: TenantScopedRepository,
  invitation: typeof invitations.$inferSelect,
): Promise<void> {
  await repo.insert(emailOutbox, {
    type: "ADMIN_INVITE",
    toEmail: invitation.email,
    payload: { invitationId: invitation.id },
  });
}

async function findInvitationByToken(db: Database, token: string) {
  const [row] = await db
    .select({ invitation: invitations, eventName: events.name })
    .from(invitations)
    .innerJoin(events, eq(events.id, invitations.eventId))
    .where(eq(invitations.tokenHash, sha256(token)))
    .limit(1);
  return row;
}

/** GET /api/auth/invitations/{token}: info undangan untuk halaman aktivasi. */
export async function getInvitationByToken(db: Database, token: string, now = new Date()) {
  const row = await findInvitationByToken(db, token);
  if (!row) throw new InvitationInvalidError();
  const status = invitationStatus(row.invitation, now);
  if (status === "EXPIRED") throw new InvitationExpiredError();
  if (status !== "PENDING") throw new InvitationInvalidError();
  return {
    eventName: row.eventName,
    email: row.invitation.email,
    name: row.invitation.name,
    expiresAt: row.invitation.expiresAt,
  };
}

/**
 * ADM-01: terima undangan → akun aktif + membership EVENT_ADMIN + login.
 * Bila email sudah punya akun (admin event lain), password lama tidak diubah.
 */
export async function acceptInvitation(
  db: Database,
  token: string,
  rawInput: unknown,
  context: { ip: string | null; userAgent: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date; eventId: string }> {
  const input = parseInput(acceptInvitationInputSchema, rawInput);
  const now = context.now ?? new Date();

  const userId = await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256(token)))
      .for("update");
    if (!invitation) throw new InvitationInvalidError();
    const status = invitationStatus(invitation, now);
    if (status === "EXPIRED") throw new InvitationExpiredError();
    if (status !== "PENDING") throw new InvitationInvalidError();

    let [user] = await tx.select().from(users).where(eq(users.email, invitation.email));
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          email: invitation.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        })
        .returning();
    } else if (!user.passwordHash) {
      [user] = await tx
        .update(users)
        .set({ name: input.name, passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, user.id))
        .returning();
    }
    if (!user) throw new Error("Gagal membuat akun admin.");

    await tx
      .insert(memberships)
      .values({ userId: user.id, roleId: invitation.roleId, eventId: invitation.eventId })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.roleId, memberships.eventId],
        set: { revokedAt: null },
      });
    await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id));
    return { userId: user.id, eventId: invitation.eventId };
  });

  const session = await createSession(db, {
    userId: userId.userId,
    ip: context.ip,
    userAgent: context.userAgent,
    now,
  });
  return { ...session, eventId: userId.eventId };
}
