import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// E2E terhadap build production + database development (.env).
// Jalankan: npm run build && npm run test:e2e
const PORT = 3100;
const MOCK_TRIPAY_PORT = 3199;
export const E2E_EMAIL_DIR = path.join(process.cwd(), ".data/e2e-emails");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // UI-UX: acuan mobile 360px.
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: [
    {
      // Tripay tiruan untuk alur QRIS (bukan sandbox Tripay sungguhan).
      command: `npx tsx tests/support/run-mock-tripay.ts`,
      url: `http://127.0.0.1:${MOCK_TRIPAY_PORT}/__control/health`,
      env: { MOCK_TRIPAY_PORT: String(MOCK_TRIPAY_PORT) },
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npm run start -- -p ${PORT}`,
      // Landing page diakses lewat {slug}.uncle.localhost:3100 (proxy.ts).
      env: {
        APP_BASE_DOMAIN: `uncle.localhost:${PORT}`,
        APP_URL: `http://localhost:${PORT}`,
        TRIPAY_API_BASE_URL: `http://127.0.0.1:${MOCK_TRIPAY_PORT}/api-sandbox`,
        // Tanpa EMAIL_API_KEY: email ditulis ke folder ini (tidak dikirim), diperiksa E2E.
        EMAIL_DEV_OUTBOX_DIR: E2E_EMAIL_DIR,
      },
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
