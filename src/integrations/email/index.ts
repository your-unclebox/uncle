import "server-only";

import path from "node:path";

import { getServerEnv } from "@/config/env";

import type { EmailSender } from "./email-sender";
import { createFileEmailSender } from "./file-sender";
import { createResendSender } from "./resend/resend-sender";

export * from "./email-sender";
export { createFileEmailSender } from "./file-sender";
export { createResendSender, verifyResendWebhook } from "./resend/resend-sender";

let sender: EmailSender | undefined;

/** Resend bila EMAIL_API_KEY diisi; tanpa key hanya boleh di non-production (file lokal). */
export function getEmailSender(): EmailSender {
  if (sender) return sender;
  const env = getServerEnv();
  if (env.EMAIL_API_KEY) {
    sender = createResendSender({ apiKey: env.EMAIL_API_KEY });
  } else if (env.NODE_ENV !== "production" || env.EMAIL_DEV_OUTBOX_DIR) {
    sender = createFileEmailSender(
      env.EMAIL_DEV_OUTBOX_DIR ?? path.join(process.cwd(), ".data/emails"),
    );
  } else {
    throw new Error("EMAIL_API_KEY belum diisi.");
  }
  return sender;
}
