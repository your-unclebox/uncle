import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentGatewayFailure,
  type GatewayCredentials,
  type GatewayStatus,
  type GatewayWebhook,
  type PaymentProvider,
} from "../payment-provider";

// Adapter Tripay (DRD Integrations §1). Endpoint & signature mengikuti API
// Tripay (diverifikasi terhadap SDK tripay-sdk; dokumentasi resmi tidak bisa
// diakses dari environment build — lihat Pertanyaan Terbuka T2).

const BASE_URL = {
  SANDBOX: "https://tripay.co.id/api-sandbox",
  PRODUCTION: "https://tripay.co.id/api",
} as const;

// T2: kode channel QRIS yang dipakai.
export const TRIPAY_QRIS_CHANNEL = "QRIS";

const STATUSES: ReadonlySet<string> = new Set(["UNPAID", "PAID", "EXPIRED", "FAILED", "REFUND"]);

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TripayOptions {
  readonly fetch?: FetchLike;
  /** Override URL API (mock lokal/E2E). */
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

interface TripayEnvelope {
  readonly success?: boolean;
  readonly message?: string;
  readonly data?: unknown;
}

const hmacHex = (key: string, value: string) =>
  createHmac("sha256", key).update(value).digest("hex");

/** Signature create transaction: HMAC-SHA256(merchant_code + merchant_ref + amount, private_key). */
export function tripayRequestSignature(
  credentials: GatewayCredentials,
  merchantRef: string,
  amount: number,
): string {
  return hmacHex(credentials.privateKey, `${credentials.merchantCode}${merchantRef}${amount}`);
}

/** Signature callback: HMAC-SHA256(raw body, private_key), header X-Callback-Signature. */
export function tripayCallbackSignature(privateKey: string, rawBody: string): string {
  return hmacHex(privateKey, rawBody);
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

function toStatus(value: unknown): GatewayStatus {
  const status = String(value ?? "").toUpperCase();
  if (!STATUSES.has(status))
    throw new PaymentGatewayFailure(`Status tidak dikenal: ${status}`, "rejected");
  return status as GatewayStatus;
}

function toNumber(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : 0;
}

// paid_at / expired_time Tripay berupa unix detik.
function toDate(value: unknown): Date | null {
  const seconds = toNumber(value);
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

export function createTripayProvider(options: TripayOptions = {}): PaymentProvider {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function call(
    credentials: GatewayCredentials,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${options.baseUrl ?? BASE_URL[credentials.mode]}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${credentials.apiKey}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    let response: Response | undefined;
    // 1x retry untuk error jaringan (aman: merchant_ref unik, DRD §1.3).
    for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
      try {
        response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (attempt === 1) {
          throw new PaymentGatewayFailure(
            error instanceof Error ? error.message : "Gagal menghubungi Tripay",
            "network",
          );
        }
      }
    }
    if (!response) throw new PaymentGatewayFailure("Gagal menghubungi Tripay", "network");
    const envelope = record(await response.json().catch(() => null)) as TripayEnvelope;
    if (!response.ok || envelope.success !== true) {
      throw new PaymentGatewayFailure(
        envelope.message || `Tripay menolak permintaan (HTTP ${response.status})`,
        response.status >= 500 ? "network" : "rejected",
      );
    }
    return envelope.data;
  }

  return {
    async testConnection(credentials) {
      try {
        const data = await call(
          credentials,
          "GET",
          `/merchant/payment-channel?code=${TRIPAY_QRIS_CHANNEL}`,
        );
        const channels = Array.isArray(data) ? data.map(record) : [];
        const qris = channels.find((channel) => channel.code === TRIPAY_QRIS_CHANNEL);
        if (!qris || qris.active === false) {
          return { ok: false, message: "Channel QRIS belum aktif di akun Tripay." };
        }
        return { ok: true };
      } catch (error) {
        if (error instanceof PaymentGatewayFailure) return { ok: false, message: error.message };
        throw error;
      }
    },

    async createQrisPayment(credentials, input) {
      const data = record(
        await call(credentials, "POST", "/transaction/create", {
          method: TRIPAY_QRIS_CHANNEL,
          merchant_ref: input.merchantRef,
          amount: input.amount,
          customer_name: input.customer.name,
          customer_email: input.customer.email,
          customer_phone: input.customer.phone,
          order_items: input.items.map((item) => ({
            sku: item.sku,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
          callback_url: input.callbackUrl,
          expired_time: Math.floor(input.expiresAt.getTime() / 1000),
          signature: tripayRequestSignature(credentials, input.merchantRef, input.amount),
        }),
      );
      const reference = typeof data.reference === "string" ? data.reference : "";
      const qrString = typeof data.qr_string === "string" ? data.qr_string : "";
      if (!reference || !qrString) {
        throw new PaymentGatewayFailure("Respons Tripay tanpa reference/qr_string", "rejected");
      }
      return {
        providerReference: reference,
        qrString,
        qrImageUrl: typeof data.qr_url === "string" ? data.qr_url : null,
        expiresAt: toDate(data.expired_time) ?? input.expiresAt,
        channel:
          typeof data.payment_method === "string" ? data.payment_method : TRIPAY_QRIS_CHANNEL,
        feeAmount: data.total_fee === undefined ? null : toNumber(data.total_fee),
        raw: data,
      };
    },

    async getPaymentStatus(credentials, providerReference) {
      const data = record(
        await call(
          credentials,
          "GET",
          `/transaction/detail?reference=${encodeURIComponent(providerReference)}`,
        ),
      );
      return {
        status: toStatus(data.status),
        amount: toNumber(data.amount),
        paidAt: toDate(data.paid_at),
      };
    },

    verifyWebhook(credentials, rawBody, headers) {
      if (headers.get("x-callback-event") !== "payment_status") return false;
      const given = Buffer.from(headers.get("x-callback-signature") ?? "", "utf8");
      const expected = Buffer.from(
        tripayCallbackSignature(credentials.privateKey, rawBody),
        "utf8",
      );
      return given.length === expected.length && timingSafeEqual(given, expected);
    },

    parseWebhook(rawBody): GatewayWebhook {
      let payload: Record<string, unknown>;
      try {
        payload = record(JSON.parse(rawBody));
      } catch {
        throw new PaymentGatewayFailure("Body callback bukan JSON", "rejected");
      }
      // total_amount = tagihan + fee customer (bila fee dibebankan ke customer, Q13).
      return {
        providerReference: String(payload.reference ?? ""),
        merchantRef: String(payload.merchant_ref ?? ""),
        status: toStatus(payload.status),
        amount: toNumber(payload.total_amount) - toNumber(payload.fee_customer),
        paidAt: toDate(payload.paid_at),
      };
    },
  };
}
