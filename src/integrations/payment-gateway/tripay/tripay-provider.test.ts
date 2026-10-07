import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { PaymentGatewayFailure, type GatewayCredentials } from "../payment-provider";
import {
  createTripayProvider,
  tripayCallbackSignature,
  tripayRequestSignature,
} from "./tripay-provider";

const credentials: GatewayCredentials = {
  mode: "SANDBOX",
  merchantCode: "T0001",
  apiKey: "DEV-api-key",
  privateKey: "private-key",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function providerWith(...responses: Array<Response | Error>) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("tidak ada respons tersisa");
    if (next instanceof Error) throw next;
    return next;
  });
  return { provider: createTripayProvider({ fetch }), fetch };
}

describe("Tripay signature", () => {
  it("request create = HMAC-SHA256(merchant_code + merchant_ref + amount, private_key)", () => {
    const expected = createHmac("sha256", "private-key")
      .update("T0001UNC-ABC123-1300000")
      .digest("hex");
    expect(tripayRequestSignature(credentials, "UNC-ABC123-1", 300000)).toBe(expected);
  });
});

describe("createTripayProvider", () => {
  it("testConnection: channel QRIS aktif → ok; nonaktif / ditolak → pesan provider", async () => {
    const ok = providerWith(
      jsonResponse(200, { success: true, data: [{ code: "QRIS", active: true }] }),
    );
    expect(await ok.provider.testConnection(credentials)).toEqual({ ok: true });
    const [url, init] = ok.fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://tripay.co.id/api-sandbox/merchant/payment-channel?code=QRIS");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer DEV-api-key");

    const inactive = providerWith(
      jsonResponse(200, { success: true, data: [{ code: "QRIS", active: false }] }),
    );
    expect(await inactive.provider.testConnection(credentials)).toEqual({
      ok: false,
      message: "Channel QRIS belum aktif di akun Tripay.",
    });

    const rejected = providerWith(
      jsonResponse(401, { success: false, message: "Invalid API Key" }),
    );
    expect(await rejected.provider.testConnection(credentials)).toEqual({
      ok: false,
      message: "Invalid API Key",
    });
  });

  it("createQrisPayment mengirim body bertanda tangan dan membaca qr_string", async () => {
    const { provider, fetch } = providerWith(
      jsonResponse(200, {
        success: true,
        data: {
          reference: "DEV-T0001123",
          payment_method: "QRIS",
          qr_string: "00020101021226",
          qr_url: "https://tripay.test/qr.png",
          expired_time: 1_800_000_000,
          total_fee: 2100,
        },
      }),
    );
    const expiresAt = new Date(1_799_999_000_000);
    const payment = await provider.createQrisPayment(credentials, {
      merchantRef: "UNC-ABC123-1",
      amount: 300000,
      customer: { name: "Budi", email: "budi@mail.com", phone: "+6281234567890" },
      items: [{ sku: "reg", name: "Reguler", price: 75000, quantity: 4 }],
      expiresAt,
      callbackUrl: "https://app.uncle.id/api/webhooks/payments/tripay/key",
    });
    expect(payment).toMatchObject({
      providerReference: "DEV-T0001123",
      qrString: "00020101021226",
      qrImageUrl: "https://tripay.test/qr.png",
      channel: "QRIS",
      feeAmount: 2100,
      expiresAt: new Date(1_800_000_000_000),
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://tripay.co.id/api-sandbox/transaction/create");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      method: "QRIS",
      merchant_ref: "UNC-ABC123-1",
      amount: 300000,
      expired_time: 1_799_999_000,
      callback_url: "https://app.uncle.id/api/webhooks/payments/tripay/key",
      signature: tripayRequestSignature(credentials, "UNC-ABC123-1", 300000),
    });
  });

  it("error jaringan di-retry sekali; gagal dua kali → PaymentGatewayFailure network", async () => {
    const retried = providerWith(
      new Error("ECONNRESET"),
      jsonResponse(200, {
        success: true,
        data: { status: "PAID", amount: 300000, paid_at: 1_800_000_000 },
      }),
    );
    expect(await retried.provider.getPaymentStatus(credentials, "DEV-1")).toEqual({
      status: "PAID",
      amount: 300000,
      paidAt: new Date(1_800_000_000_000),
    });
    expect(retried.fetch).toHaveBeenCalledTimes(2);

    const failing = providerWith(new Error("timeout"), new Error("timeout"));
    await expect(failing.provider.getPaymentStatus(credentials, "DEV-1")).rejects.toMatchObject({
      kind: "network",
    });

    const rejected = providerWith(
      jsonResponse(400, { success: false, message: "Invalid signature" }),
    );
    await expect(
      rejected.provider.createQrisPayment(credentials, {
        merchantRef: "X",
        amount: 1,
        customer: { name: "a", email: "a@b.c", phone: "+62811" },
        items: [],
        expiresAt: new Date(),
        callbackUrl: "https://x",
      }),
    ).rejects.toBeInstanceOf(PaymentGatewayFailure);
  });

  it("verifyWebhook memeriksa X-Callback-Signature & X-Callback-Event; parseWebhook", () => {
    const { provider } = providerWith();
    const body = JSON.stringify({
      reference: "DEV-T0001123",
      merchant_ref: "UNC-ABC123-1",
      status: "PAID",
      total_amount: 302100,
      fee_customer: 2100,
      paid_at: 1_800_000_000,
    });
    const headers = new Headers({
      "x-callback-event": "payment_status",
      "x-callback-signature": tripayCallbackSignature("private-key", body),
    });
    expect(provider.verifyWebhook(credentials, body, headers)).toBe(true);
    expect(provider.verifyWebhook({ ...credentials, privateKey: "lain" }, body, headers)).toBe(
      false,
    );
    expect(provider.verifyWebhook(credentials, `${body} `, headers)).toBe(false);
    headers.set("x-callback-event", "other");
    expect(provider.verifyWebhook(credentials, body, headers)).toBe(false);

    expect(provider.parseWebhook(body)).toEqual({
      providerReference: "DEV-T0001123",
      merchantRef: "UNC-ABC123-1",
      status: "PAID",
      amount: 300000,
      paidAt: new Date(1_800_000_000_000),
    });
    expect(() => provider.parseWebhook("bukan json")).toThrow(PaymentGatewayFailure);
    expect(() => provider.parseWebhook(JSON.stringify({ status: "ANEH" }))).toThrow(
      PaymentGatewayFailure,
    );
  });
});
