import { DomainError } from "@/server/http/domain-error";

export type TicketResendBlockReason = "ORDER_NOT_PAID" | "EMAIL_MISSING" | "TICKET_UNAVAILABLE";

// Kode baru (belum ada di DRD) — Kirim Ulang QR Tiket (ADM-08) tidak bisa
// dijalankan untuk order ini; `reason` menjelaskan sebabnya.
export class TicketResendNotAllowedError extends DomainError {
  readonly code = "TICKET_RESEND_NOT_ALLOWED";
  readonly status = 400;
  constructor(readonly reason: TicketResendBlockReason) {
    super(
      reason === "ORDER_NOT_PAID"
        ? "Email tiket hanya bisa dikirim ulang untuk pesanan Lunas"
        : reason === "EMAIL_MISSING"
          ? "Pesanan ini tidak punya email pembeli"
          : "QR Tiket pesanan ini tidak aktif",
    );
  }
}

// Kode baru (belum ada di DRD) — Resend menolak / tidak bisa dihubungi.
export class EmailSendFailedError extends DomainError {
  readonly code = "EMAIL_SEND_FAILED";
  readonly status = 502;
  constructor() {
    super("Email gagal dikirim. Coba lagi.");
  }
}
