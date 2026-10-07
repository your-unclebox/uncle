import { defineConfig, devices } from "@playwright/test";

// E2E terhadap build production + database development (.env).
// Jalankan: npm run build && npm run test:e2e
const PORT = 3100;

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
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
