import { DomainError } from "@/server/http/domain-error";

// Kode error sesuai DRD API §2 & §5. Kode yang belum ada di DRD ditandai.

export class EventNotFoundError extends DomainError {
  readonly code = "EVENT_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Event tidak ditemukan");
  }
}

export class SalesClosedError extends DomainError {
  readonly code = "SALES_CLOSED";
  readonly status = 409;
  constructor() {
    super("Penjualan ditutup");
  }
}

export class PaymentMethodUnavailableError extends DomainError {
  readonly code = "PAYMENT_METHOD_UNAVAILABLE";
  readonly status = 422;
  constructor(readonly method: "QRIS" | "CASH") {
    super(`Metode pembayaran ${method} tidak tersedia untuk event ini`);
  }
}

export interface RemainingQuota {
  readonly ticketTypeId: string;
  readonly name: string;
  readonly remaining: number;
}

export class QuotaInsufficientError extends DomainError {
  readonly code = "QUOTA_INSUFFICIENT";
  readonly status = 409;
  constructor(readonly remaining: readonly RemainingQuota[]) {
    super("Kuota tidak mencukupi");
  }
}

// Kode baru (belum ada di DRD) — 404 untuk order yang tidak ada / milik tenant lain.
export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Pesanan tidak ditemukan");
  }
}

export class OrderNotExpiredError extends DomainError {
  readonly code = "ORDER_NOT_EXPIRED";
  readonly status = 409;
  constructor() {
    super("Pesanan bukan reservasi Cash yang sudah kedaluwarsa");
  }
}

export class AlreadyReissuedError extends DomainError {
  readonly code = "ALREADY_REISSUED";
  readonly status = 409;
  constructor(readonly newOrderCode: string) {
    super("Reservasi ini sudah dibuatkan pesanan baru");
  }
}

export class PriceChangedError extends DomainError {
  readonly code = "PRICE_CHANGED";
  readonly status = 409;
  constructor(readonly totalAmount: bigint) {
    super("Harga berubah, tampilkan ulang tagihan");
  }
}

export class EventNotOperationalError extends DomainError {
  readonly code = "EVENT_NOT_OPERATIONAL";
  readonly status = 409;
  constructor() {
    super("Event tidak sedang berlangsung");
  }
}

// Kode baru (belum ada di DRD) — transisi status di luar state machine DRD §4.1.
export class InvalidOrderTransitionError extends DomainError {
  readonly code = "INVALID_ORDER_TRANSITION";
  readonly status = 409;
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transisi status order ${from} → ${to} tidak diizinkan`);
  }
}

// Kode baru (internal, bukan untuk klien) — aksi admin tanpa actorUserId.
export class ActorRequiredError extends DomainError {
  readonly code = "ACTOR_REQUIRED";
  readonly status = 500;
  constructor() {
    super("Aksi ini membutuhkan actorUserId di TenantContext");
  }
}

// Kode baru (belum ada di DRD) — QR Tiket tidak ada / milik tenant lain (check-in).
export class TicketNotFoundError extends DomainError {
  readonly code = "TICKET_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Tiket tidak ditemukan");
  }
}

// DRD Security §6 / I-9: check-in kalah cepat atau tiket sudah diambil.
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

// Kode baru (belum ada di DRD) — "Tandai Diambil" hanya bila Lunas (BR-TKT-04).
export class OrderNotPaidError extends DomainError {
  readonly code = "ORDER_NOT_PAID";
  readonly status = 409;
  constructor() {
    super("Tiket belum lunas, belum bisa ditandai diambil");
  }
}

// Kode baru (belum ada di DRD) — Konfirmasi Lunas untuk reservasi yang lewat batas.
export class ReservationExpiredError extends DomainError {
  readonly code = "RESERVATION_EXPIRED";
  readonly status = 409;
  constructor() {
    super("Reservasi sudah kedaluwarsa");
  }
}
