import { parseServerEnv } from "@/config/env";
import { logger } from "@/lib/logger";

import { runMigrations } from "./run-migrations";

// Fase 1: migrasi hanya dijalankan ke database development lokal.
async function main(): Promise<void> {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("db:migrate ditolak untuk NODE_ENV=production pada fase ini.");
  }
  const url = new URL(env.DATABASE_URL_DIRECT ?? env.DATABASE_URL);
  // Hanya host & nama database yang dicatat — tidak pernah kredensial.
  logger.info("Menjalankan migrasi", { host: url.host, database: url.pathname.slice(1) });
  await runMigrations(url.toString());
  logger.info("Migrasi selesai");
}

main().catch((error: unknown) => {
  logger.error("Migrasi gagal", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
