import path from "node:path";

import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` melempar error di luar React Server; aman dinetralkan di test Node.
  "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only-stub.ts"),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/config/**/*.ts", "src/lib/**/*.ts"],
      // Entry point CLI (migrate/seed) diuji lewat `npm run db:*`, bukan unit test.
      exclude: ["src/server/db/migrate.ts", "src/server/db/seed/index.ts", "**/*.test.ts"],
      thresholds: {
        // AI-CODING-RULES Testing §2 — modul kritis.
        "src/server/tenancy/**": { lines: 90, branches: 85 },
        "src/server/modules/ordering/**": { lines: 90, branches: 85 },
        "src/server/modules/ticketing/**": { lines: 90, branches: 85 },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "tests/cross-tenant/**/*.test.ts"],
          globalSetup: ["tests/setup/postgres-container.ts"],
          // Satu DB bersama; job lintas tenant (expire-orders) tidak boleh
          // berjalan bersamaan dengan file test lain.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
