import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { RateLimiter } from "@/server/http/rate-limit";
import { parseInput } from "@/server/http/validation-error";

import { InvalidCredentialsError, RateLimitedError } from "./errors";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { createSession } from "./sessions";

export const loginInputSchema = z
  .object({
    email: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(254),
    password: z.string("Wajib diisi").min(1, "Wajib diisi").max(200),
  })
  .strict();

// DRD Security §4: 5 percobaan / 15 menit per email + IP.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function login(
  db: Database,
  rawInput: unknown,
  context: { ip: string | null; userAgent: string | null; rateLimiter: RateLimiter; now?: Date },
): Promise<{ token: string; expiresAt: Date; userId: string }> {
  const input = parseInput(loginInputSchema, rawInput);
  const email = input.email.toLowerCase();
  const now = context.now ?? new Date();

  const limit = await context.rateLimiter.consume(
    `login:${email}:${context.ip ?? "unknown"}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS,
    now,
  );
  if (!limit.allowed) throw new RateLimitedError(limit.retryAfterSeconds);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await verifyAgainstDummy(input.password);
    throw new InvalidCredentialsError();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new InvalidCredentialsError();
  }

  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  const session = await createSession(db, {
    userId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
    now,
  });
  return { ...session, userId: user.id };
}
