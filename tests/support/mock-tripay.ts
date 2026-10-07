import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Tripay tiruan berbasis HTTP untuk uji API & E2E (TRIPAY_API_BASE_URL).
// Meniru endpoint yang dipakai adapter: payment-channel, transaction/create,
// transaction/detail. Bukan pengganti uji sandbox Tripay sungguhan.

export interface MockTripayState {
  rejectApiKey: boolean;
  createFails: boolean;
  statuses: Map<string, { status: string; amount: number }>;
  created: Array<Record<string, unknown>>;
}

export interface MockTripay {
  readonly url: string;
  readonly state: MockTripayState;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startMockTripay(port = 0): Promise<MockTripay> {
  const state: MockTripayState = {
    rejectApiKey: false,
    createFails: false,
    statuses: new Map(),
    created: [],
  };
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://mock");
      // Endpoint kontrol untuk E2E (proses terpisah): health & transaksi per merchant_ref.
      if (url.pathname === "/__control/health") return send(res, 200, { ok: true });
      if (url.pathname === "/__control/transaction") {
        const merchantRef = url.searchParams.get("merchant_ref");
        const found = state.created.find((body) => body.merchant_ref === merchantRef);
        return send(res, found ? 200 : 404, found ?? { ok: false });
      }
      const path = url.pathname.replace(/^\/api(-sandbox)?/, "");
      if (state.rejectApiKey || !req.headers.authorization?.startsWith("Bearer ")) {
        return send(res, 401, { success: false, message: "Invalid API Key" });
      }
      if (path === "/merchant/payment-channel") {
        return send(res, 200, { success: true, data: [{ code: "QRIS", active: true }] });
      }
      if (path === "/transaction/create" && req.method === "POST") {
        if (state.createFails) return send(res, 500, { success: false, message: "Server error" });
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const reference = `DEV-T${randomBytes(5).toString("hex").toUpperCase()}`;
        state.created.push({ ...body, reference });
        state.statuses.set(reference, { status: "UNPAID", amount: Number(body.amount) });
        return send(res, 200, {
          success: true,
          data: {
            reference,
            merchant_ref: body.merchant_ref,
            payment_method: "QRIS",
            amount: body.amount,
            total_fee: 0,
            qr_string: `00020101021226670016COM.MOCK.TRIPAY${String(body.merchant_ref)}`,
            qr_url: null,
            expired_time: body.expired_time,
          },
        });
      }
      if (path === "/transaction/detail") {
        const reference = url.searchParams.get("reference") ?? "";
        const found = state.statuses.get(reference);
        if (!found) return send(res, 404, { success: false, message: "Transaction not found" });
        return send(res, 200, {
          success: true,
          data: { reference, status: found.status, amount: found.amount, paid_at: null },
        });
      }
      return send(res, 404, { success: false, message: "Not found" });
    })();
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}/api-sandbox`,
    state,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
