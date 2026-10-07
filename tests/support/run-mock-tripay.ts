import { startMockTripay } from "./mock-tripay";

// Dijalankan Playwright (webServer) untuk E2E QRIS: Tripay tiruan di port tetap.
const port = Number(process.env.MOCK_TRIPAY_PORT ?? 3199);
void startMockTripay(port).then((mock) => {
  process.stdout.write(`Mock Tripay siap di ${mock.url}\n`);
});
