import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { EmailSendFailure } from "../email-sender";
import { createResendSender, verifyResendWebhook } from "./resend-sender";

const message = {
  from: '"Teater Bagol via Uncle" <tiket@mail.uncle.id>',
  to: "budi@mail.com",
  replyTo: "panitia@teater.id",
  subject: "Tiket",
  html: "<p>hi</p>",
  text: "hi",
  attachments: [
    {
      filename: "qr.png",
      content: Buffer.from("png"),
      contentType: "image/png",
      contentId: "qr-ticket",
    },
  ],
  idempotencyKey: "outbox-1",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createResendSender", () => {
  it("POST /emails dengan Idempotency-Key, lampiran base64 + content_id", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      reply(200, { id: "re_123" }),
    );
    const sender = createResendSender({ apiKey: "re_key", fetch });
    expect(await sender.send(message)).toEqual({ providerMessageId: "re_123" });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer re_key");
    expect(headers.get("idempotency-key")).toBe("outbox-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      to: ["budi@mail.com"],
      reply_to: "panitia@teater.id",
      attachments: [
        {
          filename: "qr.png",
          content: Buffer.from("png").toString("base64"),
          content_id: "qr-ticket",
        },
      ],
    });
  });

  it("429/5xx/jaringan → retryable; 4xx lain → permanent", async () => {
    const cases: Array<[Response | Error, "retryable" | "permanent"]> = [
      [reply(429, { message: "Too many requests" }), "retryable"],
      [reply(503, {}), "retryable"],
      [new Error("ECONNRESET"), "retryable"],
      [reply(422, { message: "Invalid `to` field" }), "permanent"],
    ];
    for (const [outcome, kind] of cases) {
      const sender = createResendSender({
        apiKey: "re_key",
        fetch: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      });
      const error = await sender.send(message).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EmailSendFailure);
      expect((error as EmailSendFailure).kind).toBe(kind);
    }
  });
});

describe("verifyResendWebhook (Svix)", () => {
  const secretBytes = Buffer.from("rahasia-webhook-resend-32-bytes!");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_123" } });
  const now = new Date("2026-10-07T10:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const sign = (content: string) =>
    createHmac("sha256", secretBytes).update(content).digest("base64");

  const headers = (signature: string, ts = timestamp) =>
    new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": signature });

  it("signature valid diterima; salah, kedaluwarsa, atau header hilang ditolak", () => {
    const valid = `v1,${sign(`msg_1.${timestamp}.${body}`)}`;
    expect(verifyResendWebhook(secret, body, headers(`v1,xxx ${valid}`), now)).toBe(true);
    expect(verifyResendWebhook(secret, `${body} `, headers(valid), now)).toBe(false);
    expect(verifyResendWebhook(secret, body, headers("v1,salah"), now)).toBe(false);
    const old = String(Number(timestamp) - 600);
    expect(
      verifyResendWebhook(secret, body, headers(`v1,${sign(`msg_1.${old}.${body}`)}`, old), now),
    ).toBe(false);
    expect(verifyResendWebhook(secret, body, new Headers(), now)).toBe(false);
  });
});
