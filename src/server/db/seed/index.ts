import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseServerEnv } from "@/config/env";
import { logger } from "@/lib/logger";

import * as schema from "../schema";
import { seedTeaterBagol } from "./teater-bagol";

// Seed hanya untuk database development.
async function main(): Promise<void> {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("db:seed ditolak untuk NODE_ENV=production.");
  }
  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const result = await seedTeaterBagol(drizzle(client, { schema }));
    logger.info("Seed Teater Bagol", { ...result });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.error("Seed gagal", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
