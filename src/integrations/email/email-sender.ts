import "server-only";

// Interface pengirim email (DRD Integrations §2): modul lain hanya bergantung
// pada interface ini, sehingga provider (Resend) bisa diganti.

export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: string;
  /** Untuk gambar inline: dirujuk di HTML sebagai `cid:{contentId}`. */
  readonly contentId?: string;
}

export interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly replyTo?: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments?: readonly EmailAttachment[];
  /** Mencegah email ganda bila worker mengirim ulang pesan yang sama. */
  readonly idempotencyKey: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

/** "retryable": limit/jaringan/5xx → dicoba lagi; "permanent": ditolak (alamat/format). */
export class EmailSendFailure extends Error {
  constructor(
    message: string,
    readonly kind: "retryable" | "permanent",
  ) {
    super(message);
    this.name = "EmailSendFailure";
  }
}
