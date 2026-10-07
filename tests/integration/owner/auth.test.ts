import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { sessions, users } from "@/server/db/schema";
import { MemoryRateLimiter } from "@/server/http/rate-limit";
import {
  ForbiddenError,
  InvalidCredentialsError,
  login,
  RateLimitedError,
  requireEventAdmin,
  requireOwner,
  resolveSession,
  revokeAllSessions,
  UnauthenticatedError,
} from "@/server/modules/identity";

import { createEvent, useTestDatabase } from "../../fixtures/db";
import { createEventAdmin, createOwnerUser, PASSWORD } from "../../fixtures/identity";

const context = () => ({
  ip: "10.0.0.1",
  userAgent: "vitest",
  rateLimiter: new MemoryRateLimiter(),
});

describe("auth session custom (OWN-01, DRD Auth §1)", () => {
  const db = useTestDatabase();

  it("AC-OWN-01.1: login benar → sesi Owner", async () => {
    const owner = await createOwnerUser(db);
    const result = await login(
      db,
      { email: owner.email.toUpperCase(), password: PASSWORD },
      context(),
    );

    const auth = await resolveSession(db, result.token);
    expect(auth).toMatchObject({ isOwner: true, user: { id: owner.id } });
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
    expect(row?.tokenHash.toString("hex")).not.toContain(result.token);
  });

  it("AC-OWN-01.2: password salah / email tidak ada → pesan umum yang sama", async () => {
    const owner = await createOwnerUser(db);
    for (const input of [
      { email: owner.email, password: "salah-password" },
      { email: "tidak-ada@example.com", password: PASSWORD },
    ]) {
      const error = await login(db, input, context()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidCredentialsError);
      expect((error as Error).message).toBe("Email atau password salah");
    }
  });

  it("akun DISABLED tidak bisa login", async () => {
    const owner = await createOwnerUser(db);
    await db.update(users).set({ status: "DISABLED" }).where(eq(users.id, owner.id));
    await expect(
      login(db, { email: owner.email, password: PASSWORD }, context()),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rate limit: percobaan ke-6 dalam 15 menit ditolak", async () => {
    const owner = await createOwnerUser(db);
    const ctx = context();
    for (let i = 0; i < 5; i += 1) {
      await login(db, { email: owner.email, password: "salah" }, ctx).catch(() => undefined);
    }
    await expect(login(db, { email: owner.email, password: PASSWORD }, ctx)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("sesi kedaluwarsa, dicabut, atau token palsu → null", async () => {
    const owner = await createOwnerUser(db);
    const now = new Date("2026-10-01T00:00:00Z");
    const { token } = await login(
      db,
      { email: owner.email, password: PASSWORD },
      { ...context(), now },
    );

    expect(await resolveSession(db, "token-palsu", now)).toBeNull();
    expect(await resolveSession(db, token, new Date("2026-10-09T00:00:00Z"))).toBeNull();
    await revokeAllSessions(db, owner.id);
    expect(await resolveSession(db, token, now)).toBeNull();
  });

  it("idle timeout 12 jam untuk Admin, tidak untuk Owner", async () => {
    const event = await createEvent(db);
    const admin = await createEventAdmin(db, event.id);
    const owner = await createOwnerUser(db);
    const now = new Date("2026-10-01T00:00:00Z");
    const later = new Date("2026-10-01T13:00:00Z");
    const adminLogin = await login(
      db,
      { email: admin.email, password: PASSWORD },
      { ...context(), now },
    );
    const ownerLogin = await login(
      db,
      { email: owner.email, password: PASSWORD },
      { ...context(), now },
    );

    expect(await resolveSession(db, adminLogin.token, later)).toBeNull();
    expect(await resolveSession(db, ownerLogin.token, later)).not.toBeNull();
  });

  it("AC-OWN-01.3: Admin ditolak di area Owner; admin hanya event miliknya", async () => {
    const event = await createEvent(db);
    const other = await createEvent(db);
    const admin = await createEventAdmin(db, event.id);
    const { token } = await login(db, { email: admin.email, password: PASSWORD }, context());
    const auth = await resolveSession(db, token);

    expect(() => requireOwner(auth)).toThrow(ForbiddenError);
    expect(() => requireOwner(null)).toThrow(UnauthenticatedError);
    expect(requireEventAdmin(auth, event.id)?.tenant).toEqual({
      eventId: event.id,
      actorUserId: admin.id,
    });
    expect(requireEventAdmin(auth, other.id)).toBeNull();
  });
});
