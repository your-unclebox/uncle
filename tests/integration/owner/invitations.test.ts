import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { emailOutbox, memberships, users } from "@/server/db/schema";
import {
  acceptInvitation,
  AlreadyMemberError,
  getInvitationByToken,
  InvitationExistsError,
  InvitationExpiredError,
  InvitationInvalidError,
  inviteAdmin,
  listAdminAccess,
  resendInvitation,
  resolveSession,
  revokeInvitation,
  verifyPassword,
} from "@/server/modules/identity";
import { withTenant } from "@/server/tenancy";

import { createEvent, useTestDatabase } from "../../fixtures/db";
import { createEventAdmin, createOwnerUser, PASSWORD } from "../../fixtures/identity";

const client = { ip: "10.0.0.2", userAgent: "vitest" };

describe("undangan admin (OWN-10, ADM-01, BR-ACC-05)", () => {
  const db = useTestDatabase();

  async function setup() {
    const owner = await createOwnerUser(db);
    const event = await createEvent(db, { name: "Teater Bagol" });
    const invite = (input: unknown, now?: Date) =>
      withTenant(db, { eventId: event.id, actorUserId: owner.id }, (repo) =>
        inviteAdmin(repo, input, { invitedBy: owner.id, ...(now ? { now } : {}) }),
      );
    return { owner, event, invite };
  }

  it("AC-OWN-10.1 & AC-ADM-01.1: undang → terima → akun aktif + membership + sesi", async () => {
    const { event, invite } = await setup();
    const email = `rina-${crypto.randomUUID().slice(0, 6)}@teaterbagol.com`;
    const { token } = await invite({ email, name: "Rina" });

    expect(await getInvitationByToken(db, token)).toMatchObject({
      eventName: "Teater Bagol",
      email,
    });
    const accepted = await acceptInvitation(
      db,
      token,
      { name: "Rina", password: PASSWORD },
      client,
    );

    const auth = await resolveSession(db, accepted.token);
    expect(auth?.adminEventIds).toEqual([event.id]);
    expect(auth?.isOwner).toBe(false);
    const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.eventId, event.id));
    expect(outbox.map((row) => row.type)).toEqual(["ADMIN_INVITE"]);
    await expect(
      acceptInvitation(db, token, { name: "Rina", password: PASSWORD }, client),
    ).rejects.toBeInstanceOf(InvitationInvalidError);
  });

  it("AC-OWN-10.2 & 10.3: email tidak valid ditolak; undangan aktif ganda ditolak", async () => {
    const { invite } = await setup();
    await expect(invite({ email: "bukan-email", name: "X" })).rejects.toThrow();
    await invite({ email: "dodi@teaterbagol.com", name: "Dodi" });
    await expect(invite({ email: "DODI@teaterbagol.com", name: "Dodi" })).rejects.toBeInstanceOf(
      InvitationExistsError,
    );
  });

  it("AC-ADM-01.2: undangan lewat 7 hari → kedaluwarsa, akun tidak dibuat", async () => {
    const { invite } = await setup();
    const email = `lama-${crypto.randomUUID().slice(0, 6)}@example.com`;
    const { token } = await invite({ email, name: "Lama" }, new Date("2026-01-01T00:00:00Z"));

    await expect(getInvitationByToken(db, token)).rejects.toBeInstanceOf(InvitationExpiredError);
    await expect(
      acceptInvitation(db, token, { name: "Lama", password: PASSWORD }, client),
    ).rejects.toBeInstanceOf(InvitationExpiredError);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });

  it("kirim ulang → token lama tidak berlaku; cabut → tidak bisa diterima", async () => {
    const { event, owner, invite } = await setup();
    const first = await invite({ email: "panitia2@teaterbagol.com", name: "Dodi" });
    const resent = await withTenant(db, { eventId: event.id, actorUserId: owner.id }, (repo) =>
      resendInvitation(repo, first.invitation.id),
    );
    await expect(getInvitationByToken(db, first.token)).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
    await withTenant(db, { eventId: event.id }, (repo) =>
      revokeInvitation(repo, first.invitation.id),
    );
    await expect(getInvitationByToken(db, resent.token)).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
  });

  it("admin event lain menerima undangan → password lama tetap", async () => {
    const otherEvent = await createEvent(db);
    const existing = await createEventAdmin(db, otherEvent.id);
    const { event, invite } = await setup();
    const { token } = await invite({ email: existing.email, name: "Baru" });

    await acceptInvitation(db, token, { name: "Baru", password: "password-lain-999" }, client);
    const [user] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(await verifyPassword(user!.passwordHash!, PASSWORD)).toBe(true);
    const active = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, existing.id), isNull(memberships.revokedAt)));
    expect(active.map((m) => m.eventId).sort()).toEqual([event.id, otherEvent.id].sort());
  });

  it("email yang sudah admin aktif → ALREADY_MEMBER; daftar akses menampilkan status", async () => {
    const { event, invite } = await setup();
    const admin = await createEventAdmin(db, event.id);
    await expect(invite({ email: admin.email, name: "Rina" })).rejects.toBeInstanceOf(
      AlreadyMemberError,
    );
    await invite({ email: "baru@teaterbagol.com", name: "Baru" });

    const access = await withTenant(db, { eventId: event.id }, (repo) => listAdminAccess(repo));
    expect(access.map((row) => [row.email, row.status]).sort()).toEqual(
      [
        [admin.email, "ACTIVE"],
        ["baru@teaterbagol.com", "PENDING"],
      ].sort(),
    );
  });
});
