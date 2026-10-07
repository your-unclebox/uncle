import { DomainError } from "@/server/http/domain-error";

// Kode error check-in (DRD API §5, Security §6). Kode yang belum ada di DRD ditandai.

// Kode baru (belum ada di DRD) — tiket tidak ada / milik tenant lain.
export class TicketNotFoundError extends DomainError {
  readonly code = "TICKET_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Tiket tidak ditemukan");
  }
}

// AC-SCN-05.1 / AC-SCN-07.1: "Tiket sudah diambil pada [waktu] oleh [admin]".
export class AlreadyCheckedInError extends DomainError {
  readonly code = "ALREADY_CHECKED_IN";
  readonly status = 409;
  constructor(
    readonly checkedInAt: Date | null,
    readonly checkedInBy: string | null,
  ) {
    super("Tiket sudah diambil");
  }
}

// Kode baru (belum ada di DRD) — BR-TKT-04: "Tandai Diambil" hanya bila Lunas.
export class OrderNotPaidError extends DomainError {
  readonly code = "ORDER_NOT_PAID";
  readonly status = 409;
  constructor() {
    super("Tiket hanya bisa diambil setelah Lunas");
  }
}

// Kode baru (belum ada di DRD) — QR Tiket VOID (kedaluwarsa/dibatalkan).
export class TicketVoidError extends DomainError {
  readonly code = "TICKET_VOID";
  readonly status = 409;
  constructor() {
    super("QR Tiket ini sudah tidak berlaku");
  }
}
