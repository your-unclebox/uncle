import { randomBytes } from "node:crypto";

import {
  createTripayProvider,
  tripayCallbackSignature,
} from "@/integrations/payment-gateway/tripay/tripay-provider";
import type { Database } from "@/server/db/client";
import { savePaymentConfig, type EncryptionKey } from "@/server/modules/payments";

export const kek: EncryptionKey = { id: "v1", key: randomBytes(32) };
export const APP_URL = "https://app.uncle.test";

export const TRIPAY_CREDENTIALS = {
  merchantCode: "T0001",
  apiKey: "DEV-api-key-1234",
  privateKey: "private-key-abcd",
};

export interface FakeTripayState {
  rejectApiKey: boolean;
  channelActive: boolean;
  createFails: false | "network" | "rejected";
  statuses: Map<string, { status: string; amount: number; paidAt?: number }>;
  created: Array<Record<string, unknown>>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Tripay palsu di level fetch: adapter Tripay asli tetap teruji. */
export function fakeTripay() {
  const state: FakeTripayState = {
    rejectApiKey: false,
    channelActive: true,
    createFails: false,
    statuses: new Map(),
    created: [],
  };
  const provider = createTripayProvider({
    baseUrl: "https://tripay.fake/api-sandbox",
    fetch: async (url, init) => {
      const path = new URL(url).pathname.replace("/api-sandbox", "");
      if (state.rejectApiKey) return json(401, { success: false, message: "Invalid API Key" });
      if (path === "/merchant/payment-channel") {
        return json(200, { success: true, data: [{ code: "QRIS", active: state.channelActive }] });
      }
      if (path === "/transaction/create") {
        if (state.createFails === "network") throw new Error("ECONNRESET");
        if (state.createFails === "rejected") {
          return json(400, { success: false, message: "Invalid signature" });
        }
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        state.created.push(body);
        return json(200, {
          success: true,
          data: {
            reference: `DEV-T0001${randomBytes(6).toString("hex")}`,
            merchant_ref: body.merchant_ref,
            payment_method: "QRIS",
            amount: body.amount,
            total_fee: 0,
            qr_string: `00020101021226-${String(body.merchant_ref)}`,
            qr_url: null,
            expired_time: body.expired_time,
            customer_email: body.customer_email,
          },
        });
      }
      if (path === "/transaction/detail") {
        const reference = new URL(url).searchParams.get("reference") ?? "";
        const found = state.statuses.get(reference) ?? { status: "UNPAID", amount: 0 };
        return json(200, {
          success: true,
          data: {
            reference,
            status: found.status,
            amount: found.amount,
            paid_at: found.paidAt ?? null,
          },
        });
      }
      return json(404, { success: false, message: "not found" });
    },
  });
  return { provider, state };
}

export function connectQris(
  db: Database,
  eventId: string,
  provider: ReturnType<typeof fakeTripay>["provider"],
  now?: Date,
) {
  return savePaymentConfig(db, { eventId }, TRIPAY_CREDENTIALS, {
    provider,
    kek,
    mode: "SANDBOX",
    appUrl: APP_URL,
    ...(now ? { now } : {}),
  });
}

/** Callback Tripay bertanda tangan (X-Callback-Signature = HMAC raw body). */
export function signedCallback(
  payload: Record<string, unknown>,
  privateKey = TRIPAY_CREDENTIALS.privateKey,
) {
  const rawBody = JSON.stringify(payload);
  const headers = new Headers({
    "content-type": "application/json",
    "x-callback-event": "payment_status",
    "x-callback-signature": tripayCallbackSignature(privateKey, rawBody),
  });
  return { rawBody, headers };
}
