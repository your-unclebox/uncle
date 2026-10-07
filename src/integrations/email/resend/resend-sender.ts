import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { EmailSendFailure, type EmailMessage, type EmailSender } from "../email-sender";

// Adapter Resend via fetch (tanpa SDK). API: POST /emails, header
// Idempotency-Key. Format diverifikasi ulang saat kredensial tersedia.

const RESEND_URL = "https://api.resend.com/emails";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createResendSender(options: {
  apiKey: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}): EmailSender {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    async send(message: EmailMessage) {
      let response: Response;
      try {
        response = await doFetch(RESEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            subject: message.subject,
            html: message.html,
            text: message.text,
            attachments: (message.attachments ?? []).map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content.toString("base64"),
              content_type: attachment.contentType,
              ...(attachment.contentId ? { content_id: attachment.contentId } : {}),
            })),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
      } catch (error) {
        throw new EmailSendFailure(
          error instanceof Error ? error.message : "Gagal menghubungi Resend",
          "retryable",
        );
      }
      const data = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !data?.id) {
        // 429 (limit harian/detik) & 5xx → retry; 4xx lain → permanen (DRD Integrations §2).
        const retryable = response.status === 429 || response.status >= 500;
        throw new EmailSendFailure(
          data?.message ?? `Resend menolak (HTTP ${response.status})`,
          retryable ? "retryable" : "permanent",
        );
      }
      return { providerMessageId: data.id };
    },
  };
}

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifikasi webhook Resend (format Svix): signature = base64(HMAC-SHA256(
 * secret, "{svix-id}.{svix-timestamp}.{body}")), secret "whsec_<base64>".
 */
export function verifyResendWebhook(
  secret: string,
  rawBody: string,
  headers: Headers,
  now = new Date(),
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
