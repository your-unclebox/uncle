import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmailSender } from "./email-sender";

/**
 * HANYA development/E2E (EMAIL_API_KEY kosong): email ditulis ke folder lokal
 * sebagai .html + .json, tidak dikirim ke siapa pun.
 */
export function createFileEmailSender(directory: string): EmailSender {
  return {
    async send(message) {
      const id = `dev-${randomUUID()}`;
      await mkdir(directory, { recursive: true });
      const base = path.join(directory, id);
      await writeFile(`${base}.html`, message.html, "utf8");
      await writeFile(
        `${base}.json`,
        JSON.stringify(
          {
            to: message.to,
            from: message.from,
            replyTo: message.replyTo ?? null,
            subject: message.subject,
            text: message.text,
            attachments: (message.attachments ?? []).map((a) => ({
              filename: a.filename,
              contentId: a.contentId ?? null,
              bytes: a.content.length,
            })),
          },
          null,
          2,
        ),
        "utf8",
      );
      return { providerMessageId: id };
    },
  };
}
