import { defineConfig } from "drizzle-kit";

// Hanya untuk `drizzle-kit generate` (tidak butuh koneksi DB).
// Migrasi dijalankan lewat `npm run db:migrate` (src/server/db/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  strict: true,
  verbose: true,
});
