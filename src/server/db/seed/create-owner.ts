import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import { parseServerEnv } from "@/config/env";
import { logger } from "@/lib/logger";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/modules/identity/password";

import * as schema from "../schema";

// DRD Auth §1: akun Owner dibuat lewat CLI, bukan pendaftaran publik.
// Pemakaian: OWNER_PASSWORD='…' npm run owner:create -- --email owner@uncle.id --name "Nama"
// Password dibaca dari env OWNER_PASSWORD (tidak pernah dicetak atau disimpan mentah).
const argsSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`),
});

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const env = parseServerEnv(process.env);
  const args = argsSchema.parse({
    email: readArg("--email")?.toLowerCase(),
    name: readArg("--name"),
    password: process.env.OWNER_PASSWORD,
  });
  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, args.email));
    if (existing) throw new Error("User dengan email ini sudah ada.");

    const passwordHash = await hashPassword(args.password);
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email: args.email, name: args.name, passwordHash })
        .returning({ id: schema.users.id });
      const [ownerRole] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.code, "OWNER"));
      if (!user || !ownerRole) throw new Error("Gagal membuat akun Owner.");
      await tx.insert(schema.memberships).values({ userId: user.id, roleId: ownerRole.id });
    });
    logger.info("Akun Owner dibuat", { email: args.email });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.error("owner:create gagal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
